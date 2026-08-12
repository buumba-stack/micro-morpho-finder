/**
 * Provenance for a completed analysis run.
 *
 * Metadata only — never used as a seed, threshold, or input to any measurement
 * or classification. Exports and AI reports carry it so a result set can be
 * traced back to the exact run that produced it.
 */
import { MICROFLUOR_VERSION } from "./app-version";

export interface AnalysisRun {
  analysis_run_id: string;
  analysis_timestamp: string;
  microfluor_version: string;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newAnalysisRun(): AnalysisRun {
  return {
    analysis_run_id: uuid(),
    analysis_timestamp: new Date().toISOString(),
    microfluor_version: MICROFLUOR_VERSION,
  };
}
