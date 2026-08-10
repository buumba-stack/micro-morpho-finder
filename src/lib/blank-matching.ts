/**
 * Links detected sample particles to the procedural-blank library.
 *
 * Only candidates annotated `confirmed_procedural_artifact` may support an
 * exclusion, so retrieval runs with `confirmedOnly`. Nothing here rejects a
 * particle — matches are advisory and the user decides.
 */

import type { AnalysisSettings, Particle } from "@/lib/particle-analysis";
import { extractFeatures } from "@/lib/blank-ingest";
import {
  retrieveBlankMatches,
  type BlankAnnotation,
  type BlankLibraryState,
  type RetrievalContext,
} from "@/lib/blank-library";

/** Minimum agreement before a particle is flagged in the overlay at all. */
export const BLANK_FLAG_SIMILARITY = 0.7;
export const BLANK_FLAG_FEATURES = 5;
/** Additional bar for the optional bulk action. */
export const BLANK_HIGH_SIMILARITY = 0.85;
export const BLANK_HIGH_FEATURES = 7;

export interface BlankMatchDetail {
  candidateId: string;
  recordId: string;
  referenceId: string;
  fileName: string;
  annotation: BlankAnnotation;
  similarity: number;
  agreeingFeatures: number;
  crop: string;
  contextCrop: string;
  area: number;
  perimeter: number;
  feret: number;
  minFeret: number;
  aspectRatio: number;
  circularity: number;
}

export interface ParticleBlankMatch {
  particleId: number;
  /** zoomed crop of the sample particle, for side-by-side comparison */
  sampleCrop: string;
  similarity: number;
  highConfidence: boolean;
  matches: BlankMatchDetail[];
}

/** particle id -> blank comparison */
export type BlankMatchMap = Record<number, ParticleBlankMatch>;

function renderSampleCrop(
  src: HTMLCanvasElement,
  imageData: ImageData,
  p: Particle,
  maxSide = 200,
): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pad = Math.max(4, Math.round(Math.max(p.bwPx, p.bhPx) * 0.25));
  const x = Math.max(0, Math.round(p.bxPx) - pad);
  const y = Math.max(0, Math.round(p.byPx) - pad);
  const w = Math.min(imageData.width - x, Math.round(p.bwPx) + pad * 2);
  const h = Math.min(imageData.height - y, Math.round(p.bhPx) + pad * 2);
  if (w <= 0 || h <= 0) return "";
  const scale = Math.min(4, Math.max(1, maxSide / Math.max(w, h)));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const o = p.outline;
  if (o.length >= 4) {
    ctx.beginPath();
    ctx.moveTo((o[0]! - x) * scale, (o[1]! - y) * scale);
    for (let i = 2; i < o.length; i += 2) ctx.lineTo((o[i]! - x) * scale, (o[i + 1]! - y) * scale);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,90,90,0.9)";
    ctx.lineWidth = Math.max(1, scale * 0.6);
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

export function isHighConfidence(m: ParticleBlankMatch): boolean {
  const best = m.matches[0];
  return (
    !!best &&
    best.similarity >= BLANK_HIGH_SIMILARITY &&
    best.agreeingFeatures >= BLANK_HIGH_FEATURES
  );
}

/**
 * Compares every particle of one analysed sample image with the confirmed
 * procedural artefacts in the library. Returns only particles that clear the
 * conservative flag thresholds.
 */
export function computeBlankMatches(
  imageData: ImageData,
  particles: Particle[],
  settings: AnalysisSettings,
  library: BlankLibraryState,
  ctx: RetrievalContext = {},
): BlankMatchMap {
  const out: BlankMatchMap = {};
  if (typeof document === "undefined" || !particles.length) return out;
  const hasConfirmed = library.records.some((r) =>
    r.candidates.some((c) => c.annotation === "confirmed_procedural_artifact"),
  );
  if (!hasConfirmed) return out;

  const src = document.createElement("canvas");
  src.width = imageData.width;
  src.height = imageData.height;
  src.getContext("2d")?.putImageData(imageData, 0, 0);

  for (const p of particles) {
    const features = extractFeatures(imageData, p, settings.threshold);
    const found = retrieveBlankMatches(library, features, ctx, {
      limit: 3,
      confirmedOnly: true,
      minSimilarity: BLANK_FLAG_SIMILARITY,
    }).filter((m) => m.agreeingFeatures >= BLANK_FLAG_FEATURES);
    if (!found.length) continue;

    const matches: BlankMatchDetail[] = found.map((m) => ({
      candidateId: m.candidate.id,
      recordId: m.record.id,
      referenceId: m.record.metadata.referenceId || m.record.id.slice(0, 8),
      fileName: m.record.fileName,
      annotation: m.candidate.annotation,
      similarity: m.similarity,
      agreeingFeatures: m.agreeingFeatures,
      crop: m.candidate.crop,
      contextCrop: m.candidate.contextCrop,
      area: m.candidate.area,
      perimeter: m.candidate.perimeter,
      feret: m.candidate.feret,
      minFeret: m.candidate.minFeret,
      aspectRatio: m.candidate.aspectRatio,
      circularity: m.candidate.circularity,
    }));

    const entry: ParticleBlankMatch = {
      particleId: p.id,
      sampleCrop: renderSampleCrop(src, imageData, p),
      similarity: matches[0]!.similarity,
      highConfidence: false,
      matches,
    };
    entry.highConfidence = isHighConfidence(entry);
    out[p.id] = entry;
  }

  return out;
}
