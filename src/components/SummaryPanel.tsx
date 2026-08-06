import { useMemo } from "react";
import { MORPHOLOGIES } from "@/lib/particle-analysis";
import type { ImageEntry } from "@/lib/study-types";
import {
  downloadText,
  particlesCsv,
  summaryCsv,
  type ExportRow,
} from "@/lib/export-results";

const MORPH_CLASS: Record<string, string> = {
  fibre: "text-fibre",
  sphere: "text-sphere",
  pellet: "text-pellet",
  fragment: "text-fragment",
};

function buildRows(entries: ImageEntry[]): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const e of entries) {
    if (!e.analysis) continue;
    for (const p of e.analysis.particles) {
      rows.push({
        file: e.name,
        tissue: e.tissue,
        particle: p.id,
        area: p.area,
        perimeter: p.perimeter,
        width: p.width,
        height: p.height,
        feret: p.feret,
        minFeret: p.minFeret,
        feretAngle: p.feretAngle,
        aspectRatio: p.aspectRatio,
        circularity: p.circularity,
        morphology: p.morphology,
        status: p.rejected ? "rejected" : "accepted",
      });
    }
  }
  return rows;
}

export function SummaryPanel({ entries }: { entries: ImageEntry[] }) {
  const rows = useMemo(() => buildRows(entries), [entries]);
  const accepted = rows.filter((r) => r.status === "accepted");

  const tissues = useMemo(() => {
    const map = new Map<string, ExportRow[]>();
    for (const r of accepted) {
      const list = map.get(r.tissue);
      if (list) list.push(r);
      else map.set(r.tissue, [r]);
    }
    return [...map.entries()];
  }, [accepted]);

  const analyzed = entries.filter((e) => e.status === "done").length;
  const autoExcluded = entries.reduce(
    (s, e) =>
      s +
      (e.analysis
        ? e.analysis.excludedEdge + e.analysis.excludedSize + e.analysis.excludedCircularity
        : 0),
    0,
  );

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Batch summary</h3>
        <span className="label-caps">
          {analyzed} images · {accepted.length} accepted · {rows.length - accepted.length} rejected ·{" "}
          {autoExcluded} auto-excluded
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MORPHOLOGIES.map((m) => {
          const c = accepted.filter((r) => r.morphology === m).length;
          const pct = accepted.length ? (100 * c) / accepted.length : 0;
          return (
            <div key={m} className="rounded-md border border-border bg-card p-2.5">
              <p className="label-caps">{m}</p>
              <p className={`font-mono text-2xl font-semibold ${MORPH_CLASS[m]}`}>{c}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{pct.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>

      {tissues.length > 0 && (
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="bg-card">
              <tr className="label-caps text-left">
                {["Tissue", "n", ...MORPHOLOGIES, "Mean area µm²", "Mean Feret µm", "Mean circ"].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {tissues.map(([tissue, list]) => {
                const mean = (f: (r: ExportRow) => number) =>
                  list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : 0;
                return (
                  <tr key={tissue} className="border-b border-border/60">
                    <td className="px-2 py-1">{tissue}</td>
                    <td className="px-2 py-1">{list.length}</td>
                    {MORPHOLOGIES.map((m) => (
                      <td key={m} className="px-2 py-1">
                        {list.filter((r) => r.morphology === m).length}
                      </td>
                    ))}
                    <td className="px-2 py-1">{mean((r) => r.area).toFixed(2)}</td>
                    <td className="px-2 py-1">{mean((r) => r.feret).toFixed(2)}</td>
                    <td className="px-2 py-1">{mean((r) => r.circularity).toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          disabled={!rows.length}
          onClick={() => downloadText(`particles_${stamp}.csv`, particlesCsv(rows))}
        >
          Export particles CSV
        </button>
        <button
          className="btn-ghost"
          disabled={!rows.length}
          onClick={() => downloadText(`summary_by_image_${stamp}.csv`, summaryCsv(rows, "file"))}
        >
          Summary per image
        </button>
        <button
          className="btn-ghost"
          disabled={!rows.length}
          onClick={() => downloadText(`summary_by_tissue_${stamp}.csv`, summaryCsv(rows, "tissue"))}
        >
          Summary per tissue
        </button>
      </div>
    </div>
  );
}
