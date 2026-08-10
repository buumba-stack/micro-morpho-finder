/**
 * Client helpers for the AI features. Online-only: the desktop build talks to
 * the hosted MicroFluor endpoints, the web build uses its own origin.
 */

const HOSTED_BASE = "https://project--7c28e508-642b-4ca7-9872-79dbf40d3aff.lovable.app";

export function aiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol.startsWith("http") ? "" : HOSTED_BASE;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
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

export async function requestQc(payload: {
  file: string;
  tissue: string;
  umPerPx: number;
  threshold: number;
  particles: QcParticleInput[];
}): Promise<AiReview[]> {
  const res = await fetch(`${aiBaseUrl()}/api/public/ai-qc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `AI review failed (${res.status})`);
  const parsed = JSON.parse(text) as { reviews?: AiReview[] };
  return parsed.reviews ?? [];
}

export async function streamChat(
  payload: { messages: { role: "user" | "assistant"; content: string }[]; dataset: string },
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${aiBaseUrl()}/api/public/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || `AI chat failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
}
