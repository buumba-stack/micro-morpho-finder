/**
 * Client-side anonymous reviewer session.
 *
 * Only the short-lived signed token and its expiry are retained (localStorage
 * in the browser, the Electron renderer's localStorage on the desktop, i.e.
 * inside the app's own user-data directory). The plaintext access key is never
 * stored, and nothing about the reviewer's identity is recorded.
 */
import { aiBaseUrl } from "@/lib/ai-client-base";

const STORAGE_KEY = "microfluor.reviewer.session.v1";

export interface ReviewerSession {
  token: string;
  expiresAt: string;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getReviewerSession(): ReviewerSession | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewerSession;
    if (!parsed.token || Date.parse(parsed.expiresAt) <= Date.now()) {
      s.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isReviewerSessionActive(): boolean {
  return getReviewerSession() !== null;
}

export function endReviewerSession(): void {
  store()?.removeItem(STORAGE_KEY);
}

export class ReviewerAuthError extends Error {}

/**
 * Exchanges the shared access key for a temporary reviewer token. The key is
 * used for this single request and never persisted.
 */
export async function startReviewerSession(accessKey: string): Promise<ReviewerSession> {
  const res = await fetch(`${aiBaseUrl()}/api/public/reviewer-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "Access key not recognized.";
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* keep the generic message */
    }
    throw new ReviewerAuthError(message);
  }
  const body = JSON.parse(text) as ReviewerSession;
  const session: ReviewerSession = { token: body.token, expiresAt: body.expiresAt };
  store()?.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * Asks the server whether the stored token is still genuine and live. The
 * browser never holds the signing secret, so this is the only trustworthy
 * check. A negative answer clears the local session.
 */
export async function verifyReviewerSession(): Promise<boolean> {
  const session = getReviewerSession();
  if (!session) return false;
  try {
    const res = await fetch(`${aiBaseUrl()}/api/public/reviewer-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: session.token }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { valid?: boolean };
    if (body.valid !== true) {
      endReviewerSession();
      return false;
    }
    return true;
  } catch {
    // Offline / unreachable: do not silently unlock.
    return false;
  }
}
