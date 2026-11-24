import { useState, type ReactNode } from "react";
import type { ImageEntry } from "@/lib/study-types";
import {
  exportFigure, provenanceText,
  type Figure, type FigureFormat, type FigureWidthMm, type ProvenanceExtras,
} from "@/lib/publication/figure";
import { Button } from "@/components/ui/button";

/** "Export for publication" controls: width (85/170 mm), SVG or PNG (300 dpi) + .txt record. */
export function PublicationExport({ entry, baseName, build, extras, children }: {
  entry: ImageEntry | undefined;
  baseName: string;
  build: (widthMm: FigureWidthMm) => Figure | Promise<Figure>;
  extras: () => ProvenanceExtras;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<FigureWidthMm>(85);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (format: FigureFormat) => {
    setBusy(true); setError("");
    try {
      const fig = await build(width);
      await exportFigure(fig, format, baseName, provenanceText(entry, extras(), fig, format));
    } catch (e) { setError(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1 text-xs">
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Export for publication
      </Button>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
          <label className="flex items-center gap-1">Width
            <select className="rounded border border-border bg-background px-1 py-0.5" value={width} onChange={(e) => setWidth(Number(e.target.value) as FigureWidthMm)}>
              <option value={85}>85 mm (single column)</option>
              <option value={170}>170 mm (double column)</option>
            </select>
          </label>
          {children}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run("svg")}>SVG</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run("png")}>PNG 300 dpi</Button>
          <span className="text-muted-foreground">A .txt record with the same name is saved alongside.</span>
          {error && <span role="alert" className="text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}
