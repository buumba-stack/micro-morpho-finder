/**
 * Server-side validation of an existing anonymous reviewer token.
 *
 * POST { token } -> { valid: boolean }
 *
 * The browser cannot decide on its own whether a stored reviewer token is
 * genuine: the signing secret never leaves the server. The web gate calls this
 * before unlocking the full analyzer, so a forged, expired, revoked or
 * out-of-period token is rejected server-side.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { reviewPeriodExpired, verifyReviewerToken } from "@/lib/reviewer-access.server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({ token: z.string().min(8).max(4000) });

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/reviewer-verify")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return json(400, { valid: false });
        }
        if (reviewPeriodExpired()) return json(200, { valid: false });
        return json(200, { valid: await verifyReviewerToken(body.token) });
      },
    },
  },
});
