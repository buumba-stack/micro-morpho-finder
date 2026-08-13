/**
 * Anonymous reviewer authentication.
 *
 * POST { accessKey } -> { token, expiresAt, role: "anonymous_reviewer" }
 *
 * Failures are generic. The stored key is never returned, and the submitted
 * value is never logged or persisted.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  REVIEWER_TOKEN_TTL_SECONDS,
  accessKeyMatches,
  issueReviewerToken,
  reviewPeriodExpired,
  reviewerAccessConfigured,
} from "@/lib/reviewer-access.server";
import { recordAuthAttempt, reviewerAuthThrottled } from "@/lib/reviewer-usage.server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({ accessKey: z.string().min(8).max(200) });

const GENERIC_FAILURE = { error: "reviewer_access_denied", message: "Access key not recognized." };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/reviewer-auth")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        if (!reviewerAccessConfigured() || reviewPeriodExpired()) {
          return json(403, GENERIC_FAILURE);
        }

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          // Never echo the submitted value back.
          return json(400, GENERIC_FAILURE);
        }

        if (await reviewerAuthThrottled()) {
          return json(429, {
            error: "reviewer_access_throttled",
            message: "Too many attempts. Please wait a few minutes and try again.",
          });
        }

        const ok = await accessKeyMatches(body.accessKey);
        await recordAuthAttempt(ok);
        if (!ok) {
          console.warn("reviewer_auth_failed");
          return json(401, GENERIC_FAILURE);
        }

        const { token, expiresAt } = await issueReviewerToken();
        return json(200, {
          role: "anonymous_reviewer",
          token,
          expiresAt,
          expiresIn: REVIEWER_TOKEN_TTL_SECONDS,
        });
      },
    },
  },
});
