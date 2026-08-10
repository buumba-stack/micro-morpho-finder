/**
 * Manual particle deletion during visual QC.
 *
 * Deleting an object removes it from the measurement list entirely (unlike
 * "reject", which keeps the row) and renumbers the remaining particles from 1
 * so the overlay labels and the table stay contiguous. Blank matches and
 * "kept despite blank" flags are remapped onto the new ids.
 */

import type { ImageAnalysis } from "./particle-analysis";
import type { BlankMatchMap } from "./blank-matching";

export interface EditResult {
  analysis: ImageAnalysis;
  blankMatches: BlankMatchMap | undefined;
  blankKeep: number[];
}

export function deleteParticles(
  analysis: ImageAnalysis,
  blankMatches: BlankMatchMap | undefined,
  blankKeep: number[] | undefined,
  ids: number[],
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

  return {
    analysis: { ...analysis, particles },
    blankMatches: nextMatches,
    blankKeep: nextKeep,
  };
}
