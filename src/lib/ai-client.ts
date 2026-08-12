/**
 * Client helpers for the AI features. Online-only: the desktop build talks to
 * the hosted MicroFluor endpoints, the web build uses its own origin.
 *
 * Both AI endpoints require a signed-in account (v2.5+). Scientific behaviour
 * of the requests themselves is unchanged — only auth headers were added.
 */
import { CLIENT_VERSION_HEADER, MICROFLUOR_VERSION } from "./app-version";
import { getAccessToken } from "@/hooks/useAuth";

const HOSTED_BASE = "https://project--7c28e508-642b-4ca7-9872-79dbf40d3aff.lovable.app";

export function aiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol.startsWith("http") ? "" : HOSTED_BASE;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export class AiRequestError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get needsSignIn() {
    return this.status === 401;
  }
  get quotaExhausted() {
    return this.code === "ai_review_quota_exhausted";
  }
  get chatLimited() {
    return this.code === "ai_chat_rate_limit_reached";
  }
}

function parseError(status: number, text: string): AiRequestError {
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return new AiRequestError(
      status,
      body.message || body.error || `AI request failed (${status})`,
      body.error ?? null,
    );
  } catch {
    return new AiRequestError(status, text || `AI request failed (${status})`, null);
  }
}

async function aiHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) {
    throw new AiRequestError(
      401,
      "Sign in to MicroFluor to use the AI features.",
      "not_signed_in",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    [CLIENT_VERSION_HEADER]: MICROFLUOR_VERSION,
  };
}

export type AiVerdict = "keep" | "exclude" | "uncertain";

export interface AiReview {
  id: number;
  verdict: AiVerdict;
  morphology: string;
  issue: string;
  confidence: number;
  note: string;
}

export interface QcParticleInput {
  id: number;
  area: number;
  perimeter: number;
  width: number;
  height: number;
  feret: number;
  minFeret: number;
  aspectRatio: number;
  circularity: number;
  morphology: string;
  touchesBorder: boolean;
  crop?: string;
  /** similarity to the closest confirmed procedural-blank artefact, 0-1 */
  blankSimilarity?: number;
  /** reference id of that blank record */
  blankReference?: string;
  /** crop of the matched blank artefact, PNG data URL */
  blankCrop?: string;
}

export interface QcResult {
  reviews: AiReview[];
  credits: { unlimited?: boolean; remaining?: number | null } | null;
}

export async function requestQc(payload: {
  file: string;
  tissue: string;
  umPerPx: number;
  threshold: number;
  particles: QcParticleInput[];
}): Promise<QcResult> {
  const res = await fetch(`${aiBaseUrl()}/api/public/ai-qc`, {
    method: "POST",
    headers: await aiHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw parseError(res.status, text);
  const parsed = JSON.parse(text) as QcResult;
  return { reviews: parsed.reviews ?? [], credits: parsed.credits ?? null };
}

export async function streamChat(
  payload: { messages: { role: "user" | "assistant"; content: string }[]; dataset: string },
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${aiBaseUrl()}/api/public/ai-chat`, {
    method: "POST",
    headers: await aiHeaders(),
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) throw parseError(res.status, await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
}
