/**
 * Procedural-blank library.
 *
 * Stores blank micrographs, their metadata, and object-level candidates that
 * the user annotates. Only `confirmed_procedural_artifact` candidates may ever
 * support an automatic exclusion decision later in the pipeline; everything
 * else is reference material for manual review.
 *
 * This module is pure data + scoring. Image decoding and crop rendering live in
 * `blank-ingest.ts` so this file stays testable outside the browser.
 */

export type BlankAnnotation =
  | "confirmed_procedural_artifact"
  | "possible_artifact"
  | "environmental_contaminant"
  | "unresolved";

export const BLANK_ANNOTATIONS: BlankAnnotation[] = [
  "confirmed_procedural_artifact",
  "possible_artifact",
  "environmental_contaminant",
  "unresolved",
];

export const ANNOTATION_LABELS: Record<BlankAnnotation, string> = {
  confirmed_procedural_artifact: "Confirmed procedural artefact",
  possible_artifact: "Possible artefact",
  environmental_contaminant: "Environmental contaminant",
  unresolved: "Unresolved",
};

/** Appearance descriptor used for local (non-AI) visual retrieval. */
export interface AppearanceFeatures {
  /** log10 of calibrated area, µm² */
  logArea: number;
  /** feret / minFeret, >= 1 */
  elongation: number;
  circularity: number;
  solidity: number;
  /** mean 8-bit intensity inside the object */
  meanIntensity: number;
  /** interior mean minus local background mean, 8-bit */
  contrast: number;
  /** mean hue 0-360 and saturation 0-1 of the fluorescent signal */
  hue: number;
  saturation: number;
  /** std-dev of interior intensity, texture proxy */
  intensitySd: number;
}

export interface BlankCandidate {
  id: string;
  /** particle id inside the blank image analysis */
  particleId: number;
  annotation: BlankAnnotation;
  features: AppearanceFeatures;
  /** tight native-resolution crop with outline overlay, PNG data URL */
  crop: string;
  /** context crop, ~4x bounding box */
  contextCrop: string;
  area: number;
  perimeter: number;
  feret: number;
  minFeret: number;
  aspectRatio: number;
  circularity: number;
  touchesBorder: boolean;
  note: string;
}

export interface BlankMetadata {
  referenceId: string;
  solution: string;
  protocol: string;
  batch: string;
  acquisitionDate: string;
  microscope: string;
  objective: string;
  camera: string;
  umPerPx: number;
  threshold: number;
  notes: string;
}

export interface BlankRecord {
  id: string;
  fileName: string;
  /** SHA-256 of the original file bytes, for audit + cache keys */
  fileHash: string;
  width: number;
  height: number;
  addedAt: string;
  metadata: BlankMetadata;
  candidates: BlankCandidate[];
}

export interface BlankLibraryState {
  /** bumped on every mutation; part of the AI decision cache key */
  version: number;
  records: BlankRecord[];
}

export const EMPTY_LIBRARY: BlankLibraryState = { version: 0, records: [] };

export const STORAGE_KEY = "microfluor.blank-library.v1";

export function emptyMetadata(): BlankMetadata {
  return {
    referenceId: "",
    solution: "",
    protocol: "",
    batch: "",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    microscope: "",
    objective: "",
    camera: "",
    umPerPx: 1,
    threshold: 100,
    notes: "",
  };
}

/* ------------------------------ persistence ------------------------------ */

export function loadLibrary(): BlankLibraryState {
  if (typeof localStorage === "undefined") return EMPTY_LIBRARY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LIBRARY;
    const parsed = JSON.parse(raw) as BlankLibraryState;
    if (!parsed || !Array.isArray(parsed.records)) return EMPTY_LIBRARY;
    return { version: Number(parsed.version) || 0, records: parsed.records };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function saveLibrary(state: BlankLibraryState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — library stays in memory for this session */
  }
}

/* ------------------------------- similarity ------------------------------ */

interface Weighted {
  key: keyof AppearanceFeatures;
  weight: number;
  /** the feature delta considered "one unit of dissimilarity" */
  scale: number;
}

/**
 * Multi-feature agreement. A single matching feature (e.g. colour alone) must
 * not produce a high score, so every term contributes and the result is the
 * weighted mean of per-feature agreements.
 */
const TERMS: Weighted[] = [
  { key: "logArea", weight: 1.2, scale: 0.5 },
  { key: "elongation", weight: 1.2, scale: 1.5 },
  { key: "circularity", weight: 1.2, scale: 0.25 },
  { key: "solidity", weight: 0.8, scale: 0.2 },
  { key: "meanIntensity", weight: 1.0, scale: 45 },
  { key: "contrast", weight: 1.0, scale: 40 },
  { key: "saturation", weight: 0.6, scale: 0.35 },
  { key: "intensitySd", weight: 0.6, scale: 35 },
];

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 0 (unrelated) .. 1 (near-identical appearance). */
export function appearanceSimilarity(a: AppearanceFeatures, b: AppearanceFeatures): number {
  let sum = 0;
  let weight = 0;
  for (const term of TERMS) {
    const delta = Math.abs(a[term.key] - b[term.key]) / term.scale;
    sum += term.weight * Math.exp(-delta * delta);
    weight += term.weight;
  }
  // hue handled separately (circular)
  const hueAgreement = Math.exp(-Math.pow(hueDistance(a.hue, b.hue) / 35, 2));
  sum += 1.0 * hueAgreement;
  weight += 1.0;
  return sum / weight;
}

/** Number of individual appearance features that agree closely. */
export function agreeingFeatureCount(a: AppearanceFeatures, b: AppearanceFeatures): number {
  let n = 0;
  for (const term of TERMS) {
    if (Math.abs(a[term.key] - b[term.key]) <= term.scale) n++;
  }
  if (hueDistance(a.hue, b.hue) <= 35) n++;
  return n;
}

export interface BlankMatch {
  candidate: BlankCandidate;
  record: BlankRecord;
  similarity: number;
  agreeingFeatures: number;
  /** metadata provenance tier: 0 = same solution+protocol+config, higher = weaker */
  tier: number;
}

export interface RetrievalContext {
  solution?: string | undefined;
  protocol?: string | undefined;
  batch?: string | undefined;
  microscope?: string | undefined;
  objective?: string | undefined;
}

function sameish(a: string | undefined, b: string): boolean {
  if (!a) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function provenanceTier(meta: BlankMetadata, ctx: RetrievalContext): number {
  const solution = sameish(ctx.solution, meta.solution);
  const protocol = sameish(ctx.protocol, meta.protocol);
  if (!solution && !protocol) return 3;
  const config =
    sameish(ctx.microscope, meta.microscope) && sameish(ctx.objective, meta.objective);
  const batch = sameish(ctx.batch, meta.batch);
  if (solution && protocol && config) return 0;
  if (solution && protocol) return batch ? 0 : 1;
  return 2;
}

/**
 * Retrieve the visually most relevant blank references for one sample
 * candidate. Same solution/protocol (and, where known, the same acquisition
 * configuration and batch) is preferred before raw appearance similarity.
 *
 * `confirmedOnly` restricts the result to references that may support an
 * automatic exclusion.
 */
export function retrieveBlankMatches(
  library: BlankLibraryState,
  features: AppearanceFeatures,
  ctx: RetrievalContext = {},
  options: { limit?: number; confirmedOnly?: boolean; minSimilarity?: number } = {},
): BlankMatch[] {
  const limit = options.limit ?? 4;
  const minSimilarity = options.minSimilarity ?? 0.35;
  const matches: BlankMatch[] = [];

  for (const record of library.records) {
    const tier = provenanceTier(record.metadata, ctx);
    for (const candidate of record.candidates) {
      if (options.confirmedOnly && candidate.annotation !== "confirmed_procedural_artifact") {
        continue;
      }
      if (candidate.annotation === "unresolved" && options.confirmedOnly) continue;
      const similarity = appearanceSimilarity(features, candidate.features);
      if (similarity < minSimilarity) continue;
      matches.push({
        candidate,
        record,
        similarity,
        agreeingFeatures: agreeingFeatureCount(features, candidate.features),
        tier,
      });
    }
  }

  matches.sort((a, b) => a.tier - b.tier || b.similarity - a.similarity);
  return matches.slice(0, limit);
}

export function countConfirmed(library: BlankLibraryState): number {
  let n = 0;
  for (const r of library.records) {
    for (const c of r.candidates) {
      if (c.annotation === "confirmed_procedural_artifact") n++;
    }
  }
  return n;
}
