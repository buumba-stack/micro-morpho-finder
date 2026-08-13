/**
 * Base URL for the online MicroFluor endpoints.
 *
 * The packaged desktop app runs from file:// and must talk to the hosted
 * deployment; the web build uses its own origin. Split out of ai-client.ts so
 * the reviewer-session module can reuse it without an import cycle.
 */
const HOSTED_BASE = "https://project--7c28e508-642b-4ca7-9872-79dbf40d3aff.lovable.app";

export function aiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol.startsWith("http") ? "" : HOSTED_BASE;
}
