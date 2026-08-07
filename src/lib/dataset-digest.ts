import { MORPHOLOGIES } from "@/lib/particle-analysis";
import type { ImageEntry } from "@/lib/study-types";
import type { AnalysisSettings } from "@/lib/particle-analysis";

function stats(values: number[]) {
  if (!values.length) return "n=0";
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return `n=${values.length} mean=${mean.toFixed(2)} median=${median.toFixed(2)} min=${sorted[0]!.toFixed(2)} max=${sorted[sorted.length - 1]!.toFixed(2)}`;
}

/** Compact, token-cheap digest of the current results for the AI chat. */
export function datasetDigest(entries: ImageEntry[], settings: AnalysisSettings): string {
  const done = entries.filter((e) => e.analysis);
  const lines: string[] = [
    `Scale: ${settings.umPerPx} µm/px · threshold: ${settings.threshold} · min area: ${settings.minArea} µm² · exclude border: ${settings.excludeEdges}`,
    `Images loaded: ${entries.length} · analysed: ${done.length}`,
  ];

  const byTissue = new Map<string, { area: number[]; feret: number[]; morph: Record<string, number> }>();
  let accepted = 0;
  let rejected = 0;

  for (const e of done) {
    for (const p of e.analysis!.particles) {
      if (p.rejected) {
        rejected++;
        continue;
      }
      accepted++;
      let g = byTissue.get(e.tissue);
      if (!g) {
        g = { area: [], feret: [], morph: {} };
        byTissue.set(e.tissue, g);
      }
      g.area.push(p.area);
      g.feret.push(p.feret);
      g.morph[p.morphology] = (g.morph[p.morphology] ?? 0) + 1;
    }
  }

  lines.push(`Accepted particles: ${accepted} · manually rejected: ${rejected}`, "");

  for (const [tissue, g] of byTissue) {
    const total = g.area.length;
    const morphs = MORPHOLOGIES.map(
      (m) => `${m}=${g.morph[m] ?? 0} (${total ? (((g.morph[m] ?? 0) / total) * 100).toFixed(1) : "0"}%)`,
    ).join(" ");
    lines.push(
      `Tissue ${tissue}: particles=${total}`,
      `  morphology: ${morphs}`,
      `  area µm²: ${stats(g.area)}`,
      `  Feret µm: ${stats(g.feret)}`,
    );
  }

  lines.push("", "Per image (accepted count · morphology):");
  for (const e of done) {
    const accepts = e.analysis!.particles.filter((p) => !p.rejected);
    const counts = MORPHOLOGIES.map(
      (m) => `${m[0]}${accepts.filter((p) => p.morphology === m).length}`,
    ).join(" ");
    lines.push(
      `  ${e.name} [${e.tissue}]: ${accepts.length} · ${counts} · auto-excluded edge=${e.analysis!.excludedEdge} size=${e.analysis!.excludedSize} circ=${e.analysis!.excludedCircularity}`,
    );
  }

  return lines.join("\n");
}
