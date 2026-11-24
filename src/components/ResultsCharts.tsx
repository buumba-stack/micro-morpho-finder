import { useMemo, useState } from "react";
import type { ImageEntry } from "@/lib/study-types";
import type { Figure, FigureWidthMm } from "@/lib/publication/figure";
import { compositionFigure, funnelFigure, sizeFigure } from "@/lib/publication/figures";
import { PublicationExport } from "@/components/PublicationExport";

const CHARTS: { key: string; title: string; build: (e: ImageEntry, w: FigureWidthMm) => Figure }[] = [
  { key: "composition", title: "Class composition", build: compositionFigure },
  { key: "size", title: "Size distribution (ECD)", build: sizeFigure },
  { key: "funnel", title: "Candidate screening", build: funnelFigure },
];

/** Per-sample result charts from existing result data (display/export only). */
export function ResultsCharts({ entries }: { entries: ImageEntry[] }) {
  const analysed = entries.filter((e) => e.analysis);
  const [id, setId] = useState<string>("");
  const entry = analysed.find((e) => e.id === id) ?? analysed[0];
  const figs = useMemo(() => (entry ? CHARTS.map((c) => ({ ...c, fig: c.build(entry, 85) })) : []), [entry]);
  if (!entry) return null;
  return (
    <section className="panel flex flex-col gap-3 p-3" aria-label="Results summary per sample">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Results summary per sample</h3>
        <select className="rounded border border-border bg-background px-2 py-1 text-xs" value={entry.id} onChange={(e) => setId(e.target.value)} aria-label="Sample">
          {analysed.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {figs.map((c) => (
          <figure key={c.key} className="flex flex-col gap-2 rounded border border-border bg-card p-2">
            {/* Chart SVG is generated locally from result numbers; text is escaped. */}
            <div className="w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: c.fig.svg }} />
            <PublicationExport
              entry={entry}
              baseName={`${entry.name}_${c.key}`}
              build={(w) => c.build(entry, w)}
              extras={() => ({ figure: `${c.title} — accepted particles; screening counts rejected particles with a blank or contamination match` })}
            />
          </figure>
        ))}
      </div>
    </section>
  );
}
