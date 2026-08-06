import type { ImageAnalysis, AnalysisSettings } from "./particle-analysis";

export type ImageStatus = "pending" | "running" | "done" | "error";

export interface ImageEntry {
  id: string;
  file: File;
  name: string;
  tissue: string;
  status: ImageStatus;
  analysis?: ImageAnalysis | undefined;
  error?: string | undefined;
}

export const TISSUE_OPTIONS = ["Liver", "Intestine", "Positive control", "Blank"] as const;

export interface RunProgress {
  running: boolean;
  done: number;
  total: number;
}

export type { AnalysisSettings };
