import type { ImageAnalysis, AnalysisSettings } from "./particle-analysis";
import type { BlankMatchMap, ParticleFeatureMap } from "./blank-matching";
import type { ContaminantMatchMap } from "./contaminant-matching";
import type { AnalysisRun } from "./analysis-run";

export type ImageStatus = "pending" | "running" | "done" | "error";

/**
 * Result of re-analysing an already-analysed image, held aside until the user
 * clicks "Update batch". The committed batch data stays untouched until then.
 */
export interface EntryDraft {
  analysis: ImageAnalysis;
  runSettings: AnalysisSettings;
  analysisId: string;
  blankMatches?: BlankMatchMap | undefined;
  /** appearance features per particle, reused for contaminant comparison */
  features?: ParticleFeatureMap | undefined;
  /** advisory contaminant-family matches from the contamination memory */
  contaminantMatches?: ContaminantMatchMap | undefined;
  /** provenance of the run that produced this draft */
  run: AnalysisRun;
  createdAt: string;
}


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
  /** provenance of the run that produced the committed `analysis` */
  run?: AnalysisRun | undefined;

  /** pending re-analysis awaiting the user's "Update batch" confirmation */
  draft?: EntryDraft | undefined;
  /** how many times this image's batch record has been updated by re-analysis */
  revision?: number | undefined;
  /** when this image's batch record was last updated */
  updatedAt?: string | undefined;
  /** confirmed-artefact blank matches for the current analysis, per particle id */
  blankMatches?: BlankMatchMap | undefined;
  /** appearance features per particle, reused for contaminant comparison */
  features?: ParticleFeatureMap | undefined;
  /** advisory contaminant-family matches from the contamination memory */
  contaminantMatches?: ContaminantMatchMap | undefined;
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

/** True when this image's settings differ from the ones its latest result used. */
export function isEntryStale(entry: ImageEntry): boolean {
  const applied = entry.draft?.runSettings ?? entry.runSettings;
  if (!entry.analysis || !applied) return false;
  return JSON.stringify(entry.settings) !== JSON.stringify(applied);
}


export type { AnalysisSettings };
