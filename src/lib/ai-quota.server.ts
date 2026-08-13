/**
 * Server-only access control and accounting for the MicroFluor AI endpoints.
 *
 * Scientific logic lives elsewhere and is untouched by this module: nothing here
 * reads or influences measurements, thresholds, morphology, or prompts. It only
 * decides whether a request is allowed to reach the AI gateway, and records that
 * it happened.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CLIENT_VERSION_HEADER, MIN_AI_CLIENT_VERSION } from "./app-version";
import { looksLikeReviewerToken, reviewerAiDailyLimit, verifyReviewerToken } from "./reviewer-access.server";
import { recordReviewerAiUse, reviewerAiRecentCount } from "./reviewer-usage.server";

/** Abuse-prevention cap on successful AI Chat requests per rolling 24 h. */
export const AI_CHAT_DAILY_LIMIT = 50;

export const AI_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `content-type, authorization, ${CLIENT_VERSION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AI_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function clientUpdateRequired(): Response {
  return jsonResponse(401, {
    error: "client_update_required",
    minimum_version: MIN_AI_CLIENT_VERSION,
    message:
      "AI features require MicroFluor v2.5 or later and a signed-in account. Please update MicroFluor and sign in to continue.",
  });
}

export function quotaExhausted(): Response {
  return jsonResponse(429, {
    error: "ai_review_quota_exhausted",
    message:
      "You have used your 5 free AI Reviews. Standard MicroFluor analysis remains available. Additional AI Review credits may be available in a future version.",
  });
}

export function chatRateLimited(): Response {
  return jsonResponse(429, {
    error: "ai_chat_rate_limit_reached",
    message: "You have reached the temporary AI Chat usage limit. Please try again later.",
  });
}

export interface AiCaller {
  /** "user" = normal account; "reviewer" = anonymous shared-key session. */
  kind: "user" | "reviewer";
  /** empty string for anonymous reviewers — no identity exists for them */
  userId: string;
  unlimited: boolean;
  clientVersion: string | null;
}

export function reviewerQuotaExhausted(): Response {
  return jsonResponse(429, {
    error: "reviewer_ai_quota_reached",
    message:
      "The shared reviewer AI allowance for the current 24 hours has been reached. Local analysis, editing and exports still work. Please try again later.",
  });
}

/**
 * Shared (not per-reviewer) AI allowance. Returns a Response when the reviewer
 * pool is exhausted, otherwise null.
 */
export async function checkReviewerAllowance(): Promise<Response | null> {
  let used: number;
  try {
    used = await reviewerAiRecentCount();
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Usage check failed", {
      status: 503,
      headers: AI_CORS_HEADERS,
    });
  }
  return used >= reviewerAiDailyLimit() ? reviewerQuotaExhausted() : null;
}

export async function logReviewerAiUse(feature: string, success: boolean): Promise<void> {
  await recordReviewerAiUse(feature, success);
}

/**
 * Verify the bearer token server-side. Anything the client claims in the body
 * (user id, role, email) is ignored.
 */
export async function authenticateAiRequest(request: Request): Promise<AiCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  // Anonymous reviewer tokens are signed by us and carry no identity.
  if (looksLikeReviewerToken(token)) {
    if (!(await verifyReviewerToken(token))) return null;
    return {
      kind: "reviewer",
      userId: "",
      unlimited: false,
      clientVersion: request.headers.get(CLIENT_VERSION_HEADER),
    };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: unlimited } = await supabaseAdmin.rpc("is_ai_unlimited", {
    _user_id: data.user.id,
  });

  return {
    kind: "user",
    userId: data.user.id,
    unlimited: unlimited === true,
    clientVersion: request.headers.get(CLIENT_VERSION_HEADER),
  };
}

/**
 * Atomically reserve one AI Review credit BEFORE any gateway traffic.
 * Returns the remaining balance, or null when no credit was available.
 */
export async function reserveReviewCredit(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("reserve_ai_review_credit", {
    _user_id: userId,
  });
  if (error) {
    console.error("reserve_ai_review_credit failed", error);
    throw new Error("Could not verify your AI Review balance. Please try again.");
  }
  return typeof data === "number" ? data : null;
}

export async function releaseReviewCredit(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("release_ai_review_credit", {
    _user_id: userId,
  });
  if (error) console.error("release_ai_review_credit failed", error);
  return typeof data === "number" ? data : null;
}

export async function commitReviewSuccess(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("commit_ai_review_success", {
    _user_id: userId,
  });
  if (error) console.error("commit_ai_review_success failed", error);
  return typeof data === "number" ? data : null;
}

export async function logReviewAttempt(entry: {
  userId: string;
  success: boolean;
  charged: boolean;
  ownerExempt: boolean;
  remainingAfter: number | null;
  clientVersion: string | null;
  model: string;
  errorCode?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_review_audit").insert({
    user_id: entry.userId,
    success: entry.success,
    charged: entry.charged,
    owner_exempt: entry.ownerExempt,
    remaining_after: entry.remainingAfter,
    client_version: entry.clientVersion,
    model: entry.model,
    error_code: entry.errorCode ?? null,
  });
  if (error) console.error("ai_review_audit insert failed", error);
}

/** Rolling 24 h successful-chat count for a normal user. */
export async function chatRecentCount(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("ai_chat_recent_count", { _user_id: userId });
  if (error) {
    console.error("ai_chat_recent_count failed", error);
    throw new Error("Could not verify your AI Chat usage. Please try again.");
  }
  return typeof data === "number" ? data : 0;
}

export async function logChatAttempt(entry: {
  userId: string;
  success: boolean;
  ownerExempt: boolean;
  clientVersion: string | null;
  model: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_chat_usage").insert({
    user_id: entry.userId,
    success: entry.success,
    owner_exempt: entry.ownerExempt,
    client_version: entry.clientVersion,
    model: entry.model,
  });
  if (error) console.error("ai_chat_usage insert failed", error);
}
