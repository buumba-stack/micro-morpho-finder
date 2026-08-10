import type { ImageAnalysis, AnalysisSettings } from "./particle-analysis";
import type { BlankMatchMap } from "./blank-matching";

export type ImageStatus = "pending" | "running" | "done" | "error";

export interface ImageEntry {
  id: string;
  file: File;
  name: string;
  tissue: string;
  status: ImageStatus;
  /** editable analysis settings for THIS image only */
  settings: AnalysisSettings;
  /** snapshot of the settings that produced `analysis` */
  runSettings?: AnalysisSettings | undefined;
  /** changes whenever the detector re-segments this image (AI-review cache key) */
  analysisId?: string | undefined;
  analysis?: ImageAnalysis | undefined;
  /** confirmed-artefact blank matches for the current analysis, per particle id */
  blankMatches?: BlankMatchMap | undefined;
  /** particle ids the user explicitly kept despite a blank match */
  blankKeep?: number[] | undefined;
  error?: string | undefined;
}

export const TISSUE_OPTIONS = ["Liver", "Intestine", "Positive control", "Blank"] as const;

export interface RunProgress {
  running: boolean;
  done: number;
  total: number;
}

/** True when this image's settings differ from the ones its result was computed with. */
export function isEntryStale(entry: ImageEntry): boolean {
  if (!entry.analysis || !entry.runSettings) return false;
  return JSON.stringify(entry.settings) !== JSON.stringify(entry.runSettings);
}

export type { AnalysisSettings };
