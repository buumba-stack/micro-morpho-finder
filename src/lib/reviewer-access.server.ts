/**
 * Server-only anonymous reviewer access for MicroFluor.
 *
 * One shared access key (server secret) is exchanged for a short-lived, signed,
 * identity-free token. Nothing here touches scientific logic, and no reviewer
 * identity is requested, derived or stored.
 *
 * Secrets / configuration (all server-side environment variables):
 *   MICROFLUOR_REVIEW_ACCESS_KEY      required — the shared key reviewers type
 *   MICROFLUOR_REVIEW_TOKEN_SECRET    required — HMAC signing key for tokens
 *   MICROFLUOR_REVIEW_ACCESS_EXPIRES  optional — ISO date; review period end
 *   MICROFLUOR_REVIEW_TOKEN_VERSION   optional — bump to revoke issued tokens
 *   MICROFLUOR_REVIEW_AI_DAILY_LIMIT  optional — shared reviewer AI calls / 24 h
 */

const TOKEN_PREFIX = "mfr1";

/** Reviewer token lifetime: 24 hours. */
export const REVIEWER_TOKEN_TTL_SECONDS = 60 * 60 * 24;

/** Default aggregate reviewer AI limit per rolling 24 h (all reviewers together). */
const DEFAULT_REVIEWER_AI_DAILY_LIMIT = 100;

export function reviewerAiDailyLimit(): number {
  const raw = process.env["MICROFLUOR_REVIEW_AI_DAILY_LIMIT"];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REVIEWER_AI_DAILY_LIMIT;
}

function tokenVersion(): number {
  const raw = process.env["MICROFLUOR_REVIEW_TOKEN_VERSION"];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** True when a review-period expiry is configured and already past. */
export function reviewPeriodExpired(): boolean {
  const raw = process.env["MICROFLUOR_REVIEW_ACCESS_EXPIRES"];
  if (!raw) return false;
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() > at;
}

export function reviewerAccessConfigured(): boolean {
  return Boolean(process.env["MICROFLUOR_REVIEW_ACCESS_KEY"] && signingSecret());
}

function signingSecret(): string | undefined {
  return process.env["MICROFLUOR_REVIEW_TOKEN_SECRET"];
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Constant-time string compare (equal length inputs are hashed first). */
async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function hmac(payload: string): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error("reviewer token secret is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

interface ReviewerClaims {
  /** fixed role marker — no identity of any kind */
  r: "anonymous_reviewer";
  /** token version, for server-side revocation */
  v: number;
  iat: number;
  exp: number;
}

/** Verify the submitted shared key. Never logs or returns the stored value. */
export async function accessKeyMatches(submitted: string): Promise<boolean> {
  const expected = process.env["MICROFLUOR_REVIEW_ACCESS_KEY"];
  if (!expected) return false;
  return constantTimeEquals(submitted, expected);
}

export async function issueReviewerToken(): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: ReviewerClaims = {
    r: "anonymous_reviewer",
    v: tokenVersion(),
    iat: now,
    exp: now + REVIEWER_TOKEN_TTL_SECONDS,
  };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await hmac(`${TOKEN_PREFIX}.${body}`);
  return {
    token: `${TOKEN_PREFIX}.${body}.${sig}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function looksLikeReviewerToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

/** Verify signature, version and expiry. Returns true only for live tokens. */
export async function verifyReviewerToken(token: string): Promise<boolean> {
  if (!looksLikeReviewerToken(token) || !signingSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [, body, sig] = parts as [string, string, string];
  let expected: string;
  try {
    expected = await hmac(`${TOKEN_PREFIX}.${body}`);
  } catch {
    return false;
  }
  if (!(await constantTimeEquals(sig, expected))) return false;

  let claims: ReviewerClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ReviewerClaims;
  } catch {
    return false;
  }
  if (claims.r !== "anonymous_reviewer") return false;
  if (claims.v !== tokenVersion()) return false;
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return false;
  // A finished review period also stops previously issued tokens.
  if (reviewPeriodExpired()) return false;
  return true;
}
