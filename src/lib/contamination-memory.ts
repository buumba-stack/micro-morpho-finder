/**
 * Contamination memory — persistent, batch-aware record of contaminants.
 *
 * Design rules:
 *  - Local-first. Every mutation is written to local storage immediately so the
 *    desktop/offline build keeps working; rows are pushed to the account
 *    database when a signed-in session is available.
 *  - Nothing here changes segmentation, calibration, thresholding or any
 *    scientific measurement. It only stores measurements that were already
 *    calculated, plus the reviewer's decisions.
 *  - No images are stored remotely. Only feature vectors and identifiers.
 *  - Predictions (blank matcher / future ML / future AI) are stored separately
 *    from human-confirmed decisions and never become training truth.
 */

import type { AppearanceFeatures } from "@/lib/blank-library";

/* --------------------------------- types --------------------------------- */

export type ContaminantType =
  | "procedural_blank_contaminant"
  | "laboratory_or_environmental_contaminant"
  | "sample_processing_artifact"
  | "imaging_artifact"
  | "other_contaminant";

export const CONTAMINANT_TYPES: ContaminantType[] = [
  "procedural_blank_contaminant",
  "laboratory_or_environmental_contaminant",
  "sample_processing_artifact",
  "imaging_artifact",
  "other_contaminant",
];

export const CONTAMINANT_TYPE_LABELS: Record<ContaminantType, string> = {
  procedural_blank_contaminant: "Procedural blank contaminant",
  laboratory_or_environmental_contaminant: "Laboratory / environmental contaminant",
  sample_processing_artifact: "Sample-processing artefact",
  imaging_artifact: "Imaging artefact",
  other_contaminant: "Other contaminant",
};

export type ContaminantScope = "batch" | "tissue_protocol" | "protocol" | "permanent";

export const CONTAMINANT_SCOPES: ContaminantScope[] = [
  "batch",
  "tissue_protocol",
  "protocol",
  "permanent",
];

export const SCOPE_LABELS: Record<ContaminantScope, string> = {
  batch: "Current batch",
  tissue_protocol: "Same tissue + protocol",
  protocol: "Same protocol",
  permanent: "Permanent library",
};

/** Relevance order: current batch evidence outranks wider memory. */
export const SCOPE_TIER: Record<ContaminantScope, number> = {
  batch: 0,
  tissue_protocol: 1,
  protocol: 2,
  permanent: 3,
};

export type FamilyStatus = "new" | "characterising" | "established";

export type SourceType = "procedural_blank" | "sample_image";

export type ParticleDecision = "confirmed_contaminant" | "keep_genuine_particle" | "uncertain";

export interface AnalysisBatch {
  id: string;
  name: string;
  analysis_date: string | null;
  tissue: string | null;
  protocol: string | null;
  solution: string | null;
  microscope: string | null;
  objective: string | null;
  acquisition_profile: string | null;
  um_per_px: number | null;
  threshold: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** false when the row still needs to be pushed to the account database */
  synced: boolean;
}

export interface ContaminantFamily {
  id: string;
  name: string;
  contaminant_type: ContaminantType;
  scope: ContaminantScope;
  batch_id: string | null;
  tissue: string | null;
  protocol: string | null;
  status: FamilyStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

export interface ContaminantObservation {
  id: string;
  family_id: string;
  batch_id: string | null;
  source_type: SourceType;
  particle_id: string | null;
  source_image_id: string | null;
  source_image_name: string | null;
  tissue: string | null;
  protocol: string | null;
  particle_features: AppearanceFeatures & Record<string, number>;
  manually_confirmed: boolean;
  notes: string | null;
  created_at: string;
  synced: boolean;
}

export interface ParticleDecisionRow {
  id: string;
  batch_id: string | null;
  particle_id: string | null;
  source_image_id: string | null;
  source_image_name: string | null;
  contaminant_family_id: string | null;
  proposed_prediction: string | null;
  proposed_confidence: number | null;
  decision: ParticleDecision;
  decision_source: string;
  particle_features: (AppearanceFeatures & Record<string, number>) | null;
  created_at: string;
  synced: boolean;
}

export interface ParticlePredictionRow {
  id: string;
  batch_id: string | null;
  particle_id: string | null;
  source_image_id: string | null;
  source_image_name: string | null;
  method: string;
  prediction: string;
  confidence: number | null;
  contaminant_family_id: string | null;
  model_version: string | null;
  created_at: string;
  synced: boolean;
}

export interface MemoryState {
  version: number;
  activeBatchId: string | null;
  batches: AnalysisBatch[];
  families: ContaminantFamily[];
  observations: ContaminantObservation[];
  decisions: ParticleDecisionRow[];
  predictions: ParticlePredictionRow[];
  /** blank-library record ids already imported into the memory */
  importedBlankCandidates: string[];
}

export const EMPTY_MEMORY: MemoryState = {
  version: 0,
  activeBatchId: null,
  batches: [],
  families: [],
  observations: [],
  decisions: [],
  predictions: [],
  importedBlankCandidates: [],
};

export const MEMORY_STORAGE_KEY = "microfluor.contamination-memory.v1";

export function memoryUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC-4122-shaped fallback so the id stays valid for the account database
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/* ------------------------------ persistence ------------------------------ */

export function loadMemory(): MemoryState {
  if (typeof localStorage === "undefined") return EMPTY_MEMORY;
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    return {
      ...EMPTY_MEMORY,
      ...parsed,
      batches: parsed.batches ?? [],
      families: parsed.families ?? [],
      observations: parsed.observations ?? [],
      decisions: parsed.decisions ?? [],
      predictions: parsed.predictions ?? [],
      importedBlankCandidates: parsed.importedBlankCandidates ?? [],
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

export function saveMemory(state: MemoryState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — memory stays in this session */
  }
}

/* ------------------------------ family stats ----------------------------- */

export interface FeatureRange {
  key: string;
  min: number;
  max: number;
  mean: number;
}

export interface FamilySummary {
  confirmedObservations: number;
  blankObservations: number;
  sampleObservations: number;
  imageCount: number;
  featureRanges: FeatureRange[];
}

const SUMMARY_KEYS = [
  "logArea",
  "elongation",
  "circularity",
  "solidity",
  "meanIntensity",
  "contrast",
  "hue",
  "saturation",
  "intensitySd",
];

export function summariseFamily(
  familyId: string,
  observations: ContaminantObservation[],
): FamilySummary {
  const own = observations.filter((o) => o.family_id === familyId);
  const confirmed = own.filter((o) => o.manually_confirmed);
  const images = new Set(own.map((o) => o.source_image_id ?? o.source_image_name ?? o.id));
  const featureRanges: FeatureRange[] = [];
  for (const key of SUMMARY_KEYS) {
    const values = own
      .map((o) => o.particle_features?.[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!values.length) continue;
    featureRanges.push({
      key,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((s, v) => s + v, 0) / values.length,
    });
  }
  return {
    confirmedObservations: confirmed.length,
    blankObservations: own.filter((o) => o.source_type === "procedural_blank").length,
    sampleObservations: own.filter((o) => o.source_type === "sample_image").length,
    imageCount: images.size,
    featureRanges,
  };
}

/**
 * Evidence-based status. Never claims "established" from a single observation,
 * and never promotes the family's scope — scope stays whatever the user chose.
 */
export function suggestedStatus(summary: FamilySummary): FamilyStatus {
  if (summary.confirmedObservations >= 4 && summary.imageCount >= 2) return "established";
  if (summary.confirmedObservations >= 2) return "characterising";
  return "new";
}
