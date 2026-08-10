import { useRef, useState } from "react";
import { TISSUE_OPTIONS, type AnalysisSettings, type RunProgress } from "@/lib/study-types";

interface Props {
  /** settings currently being edited: the selected image's own, or the defaults */
  settings: AnalysisSettings;
  onChange: (patch: Partial<AnalysisSettings>) => void;
  scope: "image" | "defaults";
  selectedName?: string | undefined;
  selectedAnalyzed?: boolean | undefined;
  selectedStale?: boolean | undefined;
  onReanalyzeSelected: () => void;
  onApplyDefaultsToSelected: () => void;
  onCopySelectedToDefaults: () => void;
  defaults: AnalysisSettings;
  onAddFiles: (files: File[], tissue: string) => void;
  onRun: () => void;
  onClear: () => void;
  progress: RunProgress;
  imageCount: number;
  pendingCount: number;
}

export function SetupPanel({
  settings,
  onChange,
  scope,
  selectedName,
  selectedAnalyzed,
  selectedStale,
  onReanalyzeSelected,
  onApplyDefaultsToSelected,
  onCopySelectedToDefaults,
  defaults,
  onAddFiles,
  onRun,
  onClear,
  progress,
  imageCount,
  pendingCount,
}: Props) {
  const [tissue, setTissue] = useState<string>(TISSUE_OPTIONS[0]);
  const [customTissue, setCustomTissue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectiveTissue = tissue === "__custom" ? customTissue.trim() || "Unassigned" : tissue;
  const perImage = scope === "image";

  return (
    <div className="panel flex flex-col gap-4 p-3">
      <section
        className={`flex flex-col gap-1 rounded-md border px-2.5 py-2 ${
          perImage ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/40"
        }`}
      >
        <span className="label-caps">{perImage ? "Editing image" : "Editing defaults"}</span>
        <span className="truncate font-mono text-[11px] text-foreground">
          {perImage ? selectedName : "no image selected"}
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {perImage
            ? "These scale, threshold and filter values belong to this image only. Other images keep their own settings and results."
            : "Values below become the starting settings for images you add next."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">1 · Set scale</h3>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Micrometres per pixel</span>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={settings.umPerPx}
            onChange={(e) => onChange({ umPerPx: Math.max(1e-6, Number(e.target.value) || 0) })}
            className="field field-focus"
          />
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Equivalent to ImageJ <span className="font-mono">Analyze &gt; Set Scale</span>.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">2 · Threshold</h3>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Fixed 8-bit threshold · {settings.threshold}</span>
          <input
            type="range"
            min={1}
            max={254}
            value={settings.threshold}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Grayscale ≥ threshold counts as fluorescent signal. The Binary view previews this value for
          the selected image; results only change when you re-analyze it.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">3 · Particle filters</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="label-plain">Min area µm²</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={settings.minArea}
              onChange={(e) => onChange({ minArea: Math.max(0, Number(e.target.value) || 0) })}
              className="field field-focus"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-plain">Max area µm²</span>
            <input
              type="number"
              min="0"
              value={Number.isFinite(settings.maxArea) ? settings.maxArea : ""}
              placeholder="Infinity"
              onChange={(e) =>
                onChange({ maxArea: e.target.value === "" ? Infinity : Number(e.target.value) })
              }
              className="field field-focus"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Min circularity</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={settings.minCircularity}
              onChange={(e) => onChange({ minCircularity: Number(e.target.value) || 0 })}
              className="field field-focus"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Max circularity</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={settings.maxCircularity}
              onChange={(e) => onChange({ maxCircularity: Number(e.target.value) || 0 })}
              className="field field-focus"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={settings.excludeEdges}
            onChange={(e) => onChange({ excludeEdges: e.target.checked })}
            className="accent-primary"
          />
          <span className="text-xs">Exclude particles touching the image border</span>
        </label>
      </section>

      {perImage && (
        <section className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">4 · Apply to this image</h3>
          <button
            className={selectedStale ? "btn-primary" : "btn-ghost"}
            disabled={progress.running}
            onClick={onReanalyzeSelected}
          >
            {progress.running ? "Working…" : "Re-analyze selected image"}
          </button>
          {selectedStale && (
            <p className="font-mono text-[11px] text-accent">
              Settings edited — re-analyze to apply them to this image.
            </p>
          )}
          {selectedAnalyzed === false && (
            <p className="font-mono text-[11px] text-muted-foreground">
              This image has not been analyzed yet.
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1 px-2 py-1"
              disabled={progress.running}
              onClick={onApplyDefaultsToSelected}
            >
              Load defaults
            </button>
            <button
              className="btn-ghost flex-1 px-2 py-1"
              disabled={progress.running}
              onClick={onCopySelectedToDefaults}
            >
              Save as defaults
            </button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Defaults ({defaults.umPerPx} µm/px · threshold {defaults.threshold}) apply only to images
            you add from now on.
          </p>
        </section>
      )}

      {!perImage && (
        <section className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">4 · Per-image analysis</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Select an image in the list to edit and re-analyze that image on its own. The values above
            are the defaults ({defaults.umPerPx} µm/px · threshold {defaults.threshold}) used for
            images you add next.
          </p>
        </section>
      )}


      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">5 · Add micrographs</h3>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Tissue for this batch</span>
          <select
            value={tissue}
            onChange={(e) => setTissue(e.target.value)}
            className="field field-focus"
          >
            {TISSUE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="__custom">Custom…</option>
          </select>
        </label>
        {tissue === "__custom" && (
          <input
            value={customTissue}
            onChange={(e) => setCustomTissue(e.target.value)}
            placeholder="e.g. Gill"
            className="field field-focus"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAddFiles(files, effectiveTissue);
            e.target.value = "";
          }}
        />
        <button className="btn-ghost" onClick={() => inputRef.current?.click()}>
          Select images ({effectiveTissue})
        </button>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <button
          className="btn-primary"
          disabled={progress.running || pendingCount === 0}
          onClick={onRun}
        >
          {progress.running
            ? `Analyzing ${progress.done}/${progress.total}…`
            : pendingCount > 0
              ? `Analyze ${pendingCount} new image${pendingCount === 1 ? "" : "s"}`
              : "All images analyzed"}
        </button>
        {progress.running && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }}
            />
          </div>
        )}
        <button className="btn-ghost" disabled={progress.running || !imageCount} onClick={onClear}>
          Clear all images
        </button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Batch analysis only touches images that have never been analyzed. Analyzed images keep
          their measurements, rejections and AI review until you re-analyze them individually.
        </p>
      </section>
    </div>
  );
}
