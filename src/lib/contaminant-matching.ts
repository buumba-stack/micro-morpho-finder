/**
 * Contaminant-family matching.
 *
 * Deliberately reuses the existing, validated blank-similarity algorithm
 * (`appearanceSimilarity` / `agreeingFeatureCount`) — no new classifier and no
 * machine learning. The additions are:
 *   - a family is represented by ALL of its confirmed observations (best
 *     observation plus the family centroid), not one isolated blank particle;
 *   - memory scope decides relevance order: current batch, then tissue +
 *     protocol, then protocol, then the permanent library.
 *
 * Every result is advisory. Nothing is excluded automatically.
 */

import {
  agreeingFeatureCount,
  appearanceSimilarity,
  type AppearanceFeatures,
} from "@/lib/blank-library";
import {
  SCOPE_TIER,
  type ContaminantFamily,
  type ContaminantObservation,
  type ContaminantScope,
  type ContaminantType,
  type FamilyStatus,
} from "@/lib/contamination-memory";

/** Explicit matcher identity stored with every prediction and decision. */
export const CONTAMINANT_MATCH_METHOD = "contaminant_matcher";
export const CONTAMINANT_MATCHER_VERSION = "contaminant_matcher/1.1-family-centroid";

/** Low-confidence matches are shown, not hidden — the reviewer decides. */
export const CONTAMINANT_MIN_SIMILARITY = 0.55;
export const CONTAMINANT_HIGH_SIMILARITY = 0.85;
export const CONTAMINANT_HIGH_FEATURES = 7;

export interface FamilyMatch {
  familyId: string;
  familyName: string;
  contaminantType: ContaminantType;
  scope: ContaminantScope;
  status: FamilyStatus;
  /** 0 = current batch evidence, 3 = permanent library */
  tier: number;
  similarity: number;
  /** similarity against the family centroid (distribution centre) */
  centroidSimilarity: number;
  agreeingFeatures: number;
  observations: number;
  blankObservations: number;
  /** true when at least one procedural-blank observation supports the family */
  supportedByBlanks: boolean;
  highConfidence: boolean;
}

export interface ParticleContaminantMatch {
  particleId: number;
  similarity: number;
  highConfidence: boolean;
  matches: FamilyMatch[];
}

/** particle id -> contaminant-family comparison */
export type ContaminantMatchMap = Record<number, ParticleContaminantMatch>;

export interface MemoryContext {
  batchId?: string | null | undefined;
  tissue?: string | null | undefined;
  protocol?: string | null | undefined;
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** null when the family's scope does not apply to the current context. */
function scopeTier(family: ContaminantFamily, ctx: MemoryContext): number | null {
  switch (family.scope) {
    case "batch":
      return ctx.batchId && family.batch_id === ctx.batchId ? SCOPE_TIER.batch : null;
    case "tissue_protocol":
      return same(family.tissue, ctx.tissue) && same(family.protocol, ctx.protocol)
        ? SCOPE_TIER.tissue_protocol
        : null;
    case "protocol":
      return same(family.protocol, ctx.protocol) ? SCOPE_TIER.protocol : null;
    case "permanent":
      return SCOPE_TIER.permanent;
    default:
      return null;
  }
}

function centroid(list: AppearanceFeatures[]): AppearanceFeatures | null {
  if (!list.length) return null;
  const keys = Object.keys(list[0]!) as (keyof AppearanceFeatures)[];
  const out = {} as AppearanceFeatures;
  for (const key of keys) {
    if (key === "hue") {
      // circular mean
      let x = 0;
      let y = 0;
      for (const f of list) {
        const rad = ((f.hue ?? 0) * Math.PI) / 180;
        x += Math.cos(rad);
        y += Math.sin(rad);
      }
      let hue = (Math.atan2(y, x) * 180) / Math.PI;
      if (hue < 0) hue += 360;
      out.hue = hue;
      continue;
    }
    const values = list.map((f) => f[key]).filter((v) => Number.isFinite(v));
    out[key] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  }
  return out;
}

export interface MatchOptions {
  limit?: number;
  minSimilarity?: number;
  /** family ids the reviewer already overruled for this particle */
  suppressedFamilyIds?: Set<string> | undefined;
}

/** Ranked contaminant families for one particle's already-calculated features. */
export function matchContaminantFamilies(
  features: AppearanceFeatures,
  families: ContaminantFamily[],
  observations: ContaminantObservation[],
  ctx: MemoryContext = {},
  options: MatchOptions = {},
): FamilyMatch[] {
  const limit = options.limit ?? 3;
  const min = options.minSimilarity ?? CONTAMINANT_MIN_SIMILARITY;
  const suppressed = options.suppressedFamilyIds;
  const out: FamilyMatch[] = [];

  for (const family of families) {
    if (suppressed?.has(family.id)) continue;
    const tier = scopeTier(family, ctx);
    if (tier === null) continue;

    const own = observations.filter((o) => o.family_id === family.id && o.manually_confirmed);
    if (!own.length) continue;


    const vectors = own.map((o) => o.particle_features as AppearanceFeatures);
    let best = 0;
    let bestFeatures = 0;
    for (const v of vectors) {
      const s = appearanceSimilarity(features, v);
      if (s > best) {
        best = s;
        bestFeatures = agreeingFeatureCount(features, v);
      }
    }
    const mid = centroid(vectors);
    const centroidSimilarity = mid ? appearanceSimilarity(features, mid) : 0;
    const similarity = Math.max(best, centroidSimilarity);
    if (similarity < min) continue;

    const blankObservations = own.filter((o) => o.source_type === "procedural_blank").length;
    out.push({
      familyId: family.id,
      familyName: family.name,
      contaminantType: family.contaminant_type,
      scope: family.scope,
      status: family.status,
      tier,
      similarity,
      centroidSimilarity,
      agreeingFeatures: bestFeatures,
      observations: own.length,
      blankObservations,
      supportedByBlanks: blankObservations > 0,
      highConfidence:
        similarity >= CONTAMINANT_HIGH_SIMILARITY && bestFeatures >= CONTAMINANT_HIGH_FEATURES,
    });
  }

  out.sort((a, b) => a.tier - b.tier || b.similarity - a.similarity);
  return out.slice(0, limit);
}

export interface ImageMatchOptions extends MatchOptions {
  /** per-particle family suppressions from the persistent decision log */
  suppressedFor?: ((particleId: number) => Set<string> | undefined) | undefined;
}

/**
 * Re-compares every already-analysed particle of one image using its stored
 * feature vector. No image decoding, no re-segmentation.
 */
export function computeContaminantMatches(
  featuresById: Record<number, AppearanceFeatures> | undefined,
  families: ContaminantFamily[],
  observations: ContaminantObservation[],
  ctx: MemoryContext = {},
  options: ImageMatchOptions = {},
): ContaminantMatchMap {
  const out: ContaminantMatchMap = {};
  if (!featuresById || !families.length || !observations.length) return out;
  const { suppressedFor, ...base } = options;
  for (const [id, features] of Object.entries(featuresById)) {
    const particleId = Number(id);
    const suppressedFamilyIds = suppressedFor?.(particleId) ?? base.suppressedFamilyIds;
    const matches = matchContaminantFamilies(features, families, observations, ctx, {
      ...base,
      suppressedFamilyIds,
    });
    if (!matches.length) continue;
    out[particleId] = {
      particleId,
      similarity: matches[0]!.similarity,
      highConfidence: matches.some((m) => m.highConfidence),
      matches,
    };
  }
  return out;
}

