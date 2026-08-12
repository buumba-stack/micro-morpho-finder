import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GatewayError, openResponsesStream, sseEvents, GPT5_MODEL } from "@/lib/gpt5.server";
import {
  AI_CHAT_DAILY_LIMIT,
  AI_CORS_HEADERS as CORS_HEADERS,
  authenticateAiRequest,
  chatRateLimited,
  chatRecentCount,
  clientUpdateRequired,
  logChatAttempt,
} from "@/lib/ai-quota.server";


const BodySchema = z.object({
  dataset: z.string().max(200000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
      }),
    )
    .min(1)
    .max(40),
});

const INSTRUCTIONS = `You are the data analyst for MicroFluor, a microplastics morphology study on
wild fish liver and intestine tissue. The user analysed fluorescence photomicrographs with an
ImageJ-equivalent pipeline (8-bit, fixed threshold, binary, Analyze Particles).

You are given the current dataset summary (counts, morphology breakdown, size statistics per tissue
and per image). Answer questions about it precisely and quantitatively. Use the numbers you are
given; never invent values. If a question cannot be answered from the summary, say what extra data
is needed. Classification criteria: fibre AR <= 0.33 or >= 3; sphere circ > 0.90; pellet
0.60 < circ <= 0.90; fragment circ <= 0.60. Circularity = 4*pi*area/perimeter².

Be concise and use markdown-free plain text with short lines and simple lists.`;

export const Route = createFileRoute("/api/public/ai-chat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const caller = await authenticateAiRequest(request);
        if (!caller) return clientUpdateRequired();

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Invalid request", {
            status: 400,
            headers: CORS_HEADERS,
          });
        }

        // Abuse-prevention cap only — AI Chat never touches AI Review credits.
        if (!caller.unlimited) {
          let used: number;
          try {
            used = await chatRecentCount(caller.userId);
          } catch (err) {
            return new Response(err instanceof Error ? err.message : "Usage check failed", {
              status: 503,
              headers: CORS_HEADERS,
            });
          }
          if (used >= AI_CHAT_DAILY_LIMIT) return chatRateLimited();
        }


        const input = [
          {
            role: "user" as const,
            content: [
              {
                type: "input_text",
                text: `Current dataset summary:\n${body.dataset}`,
              },
            ],
          },
          ...body.messages.map((m) => ({
            role: m.role,
            content: [
              {
                type: m.role === "assistant" ? "output_text" : "input_text",
                text: m.content,
              },
            ],
          })),
        ];

        let upstream: Response;
        try {
          upstream = await openResponsesStream({
            instructions: INSTRUCTIONS,
            input,
            reasoningEffort: "low",
          });
        } catch (err) {
          const status = err instanceof GatewayError ? err.status : 500;
          console.error("ai-chat failed", err);
          return new Response(err instanceof Error ? err.message : "AI chat failed", {
            status,
            headers: CORS_HEADERS,
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const event of sseEvents(upstream)) {
                if (
                  event["type"] === "response.output_text.delta" &&
                  typeof event["delta"] === "string"
                ) {
                  controller.enqueue(encoder.encode(event["delta"]));
                }
              }
              controller.close();
            } catch (err) {
              console.error("ai-chat stream error", err);
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
