/**
 * Server-only counters for anonymous reviewer access.
 *
 * Deliberately identity-free: rows contain a timestamp, a success flag and a
 * feature name only. Submitted access keys are never written or logged.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Failed access-key attempts tolerated inside the throttle window. */
export const REVIEWER_AUTH_MAX_FAILURES = 10;
export const REVIEWER_AUTH_WINDOW_MINUTES = 10;

function since(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export async function recordAuthAttempt(success: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("reviewer_auth_attempts").insert({ success });
  if (error) console.error("reviewer_auth_attempts insert failed", error.message);
}

/** True when the endpoint is currently throttled (global, anonymous). */
export async function reviewerAuthThrottled(): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("reviewer_auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("created_at", since(REVIEWER_AUTH_WINDOW_MINUTES));
  if (error) {
    console.error("reviewer_auth_attempts count failed", error.message);
    return false;
  }
  return (count ?? 0) >= REVIEWER_AUTH_MAX_FAILURES;
}

export async function recordReviewerAiUse(feature: string, success: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("reviewer_ai_usage").insert({ feature, success });
  if (error) console.error("reviewer_ai_usage insert failed", error.message);
}

/** Rolling 24 h successful reviewer AI calls, aggregated across all reviewers. */
export async function reviewerAiRecentCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("reviewer_ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("success", true)
    .gte("created_at", since(60 * 24));
  if (error) {
    console.error("reviewer_ai_usage count failed", error.message);
    throw new Error("Could not verify reviewer AI usage. Please try again.");
  }
  return count ?? 0;
}
