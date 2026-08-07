/**
 * Server-only OpenAI client for image reasoning. Uses the project's own
 * restricted key (OPENAI_API_KEY) and the Responses API. Every call streams,
 * because reasoning models can run for minutes.
 *
 * The key never leaves the server; the browser only ever talks to our own
 * /api/public/* routes.
 */

const OPENAI_URL = "https://api.openai.com/v1/responses";

export const DEFAULT_VISION_MODEL = "gpt-5";

export function visionModel(): string {
  return process.env["OPENAI_VISION_MODEL"] || DEFAULT_VISION_MODEL;
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

export class OpenAiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`OpenAI request failed [${status}]: ${detail}`);
    this.status = status;
  }
}

export interface VisionRequest {
  input: unknown;
  instructions?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  reasoningEffort?: "low" | "medium" | "high";
}

async function openStream(req: VisionRequest): Promise<Response> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new OpenAiError(503, "OPENAI_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: visionModel(),
    input: req.input,
    stream: true,
    store: false,
    reasoning: { effort: req.reasoningEffort ?? "low", summary: "auto" },
  };
  if (req.instructions) body["instructions"] = req.instructions;
  if (req.jsonSchema) {
    body["text"] = {
      format: {
        type: "json_schema",
        name: req.jsonSchema.name,
        strict: true,
        schema: req.jsonSchema.schema,
      },
    };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new OpenAiError(res.status, await res.text());
  }
  return res;
}

/** Streamed call, collected into the final output text. */
export async function completeJson(req: VisionRequest): Promise<string> {
  const res = await openStream(req);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue; // keepalive / partial
        }
        // Streamed failures arrive as SSE events, not HTTP errors.
        if (event["type"] === "error" || event["type"] === "response.failed") {
          const err = (event["error"] ??
            (event["response"] as { error?: unknown } | undefined)?.error) as
            | { message?: string; code?: string }
            | undefined;
          throw new OpenAiError(
            err?.code === "credit_balance_exhausted" || err?.code === "insufficient_quota"
              ? 402
              : 502,
            err?.message ?? "OpenAI stream failed",
          );
        }
        if (event["type"] === "response.output_text.delta" && typeof event["delta"] === "string") {
          text += event["delta"];
        }

      }
    }
  }
  return text;
}
