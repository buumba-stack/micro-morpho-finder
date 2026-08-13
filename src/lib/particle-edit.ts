/**
 * Manual particle deletion during visual QC.
 *
 * Deleting an object removes it from the measurement list entirely (unlike
 * "reject", which keeps the row) and renumbers the remaining particles from 1
 * so the overlay labels and the table stay contiguous. Blank matches and
 * "kept despite blank" flags are remapped onto the new ids.
 */

import type { ImageAnalysis } from "./particle-analysis";
import type { BlankMatchMap, ParticleFeatureMap } from "./blank-matching";
import type { ContaminantMatchMap } from "./contaminant-matching";

export interface EditResult {
  analysis: ImageAnalysis;
  blankMatches: BlankMatchMap | undefined;
  blankKeep: number[];
  features: ParticleFeatureMap | undefined;
  contaminantMatches: ContaminantMatchMap | undefined;
}

export interface EditExtras {
  features?: ParticleFeatureMap | undefined;
  contaminantMatches?: ContaminantMatchMap | undefined;
}

export function deleteParticles(
  analysis: ImageAnalysis,
  blankMatches: BlankMatchMap | undefined,
  blankKeep: number[] | undefined,
  ids: number[],
  extras: EditExtras = {},
): EditResult {
  const drop = new Set(ids);
  const keptOld = new Set(blankKeep ?? []);
  const remap = new Map<number, number>();

  const particles = analysis.particles
    .filter((p) => !drop.has(p.id))
    .map((p, i) => {
      remap.set(p.id, i + 1);
      return { ...p, id: i + 1 };
    });

  let nextMatches: BlankMatchMap | undefined;
  if (blankMatches) {
    nextMatches = {};
    for (const [oldId, match] of Object.entries(blankMatches)) {
      const to = remap.get(Number(oldId));
      if (to === undefined) continue;
      nextMatches[to] = { ...match, particleId: to };
    }
  }

  const nextKeep: number[] = [];
  for (const oldId of keptOld) {
    const to = remap.get(oldId);
    if (to !== undefined) nextKeep.push(to);
  }

  let nextFeatures: ParticleFeatureMap | undefined;
  if (extras.features) {
    nextFeatures = {};
    for (const [oldId, features] of Object.entries(extras.features)) {
      const to = remap.get(Number(oldId));
      if (to === undefined) continue;
      nextFeatures[to] = features;
    }
  }

  let nextContaminants: ContaminantMatchMap | undefined;
  if (extras.contaminantMatches) {
    nextContaminants = {};
    for (const [oldId, match] of Object.entries(extras.contaminantMatches)) {
      const to = remap.get(Number(oldId));
      if (to === undefined) continue;
      nextContaminants[to] = { ...match, particleId: to };
    }
  }

  return {
    analysis: { ...analysis, particles },
    blankMatches: nextMatches,
    blankKeep: nextKeep,
    features: nextFeatures,
    contaminantMatches: nextContaminants,
  };
}
