/**
 * Server-only helper for calling GPT-5 through the Lovable AI Gateway
 * Responses API. Every call streams (reasoning models can run for minutes).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";

export const GPT5_MODEL = "openai/gpt-5";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function requireApiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export interface ResponsesRequest {
  input: unknown;
  instructions?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  reasoningEffort?: "low" | "medium" | "high";
}

export async function openResponsesStream(req: ResponsesRequest): Promise<Response> {
  const body: Record<string, unknown> = {
    model: GPT5_MODEL,
    input: req.input,
    stream: true,
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

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": requireApiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text();
    throw new GatewayError(res.status, detail);
  }
  return res;
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`AI gateway request failed [${status}]: ${detail}`);
    this.status = status;
  }
}

/** Iterate SSE events of a Responses stream. */
export async function* sseEvents(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          /* ignore keepalive / partial */
        }
      }
    }
  }
}

/** Collect the full answer text of a streamed Responses call. */
export async function collectText(res: Response): Promise<string> {
  let text = "";
  for await (const event of sseEvents(res)) {
    if (event["type"] === "response.output_text.delta" && typeof event["delta"] === "string") {
      text += event["delta"];
    }
  }
  return text;
}
