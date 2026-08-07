import { useMemo, useRef, useState } from "react";
import {
  ANNOTATION_LABELS,
  BLANK_ANNOTATIONS,
  countConfirmed,
  emptyMetadata,
  type BlankAnnotation,
  type BlankMetadata,
  type BlankRecord,
} from "@/lib/blank-library";
import { ingestBlankImage } from "@/lib/blank-ingest";
import type { AnalysisSettings } from "@/lib/particle-analysis";
import { useBlankLibrary } from "@/hooks/useBlankLibrary";

const ANNOTATION_STYLES: Record<BlankAnnotation, string> = {
  confirmed_procedural_artifact: "border-destructive/60 bg-destructive/10 text-destructive",
  possible_artifact: "border-accent/60 bg-accent/10 text-accent",
  environmental_contaminant: "border-primary/60 bg-primary/10 text-primary",
  unresolved: "border-border bg-secondary text-muted-foreground",
};

interface Props {
  settings: AnalysisSettings;
  /** shared instance so the analysis side can retrieve the same library */
  api: ReturnType<typeof useBlankLibrary>;
}

export function BlankLibraryPanel({ settings, api }: Props) {
  const { library, addRecord, removeRecord, annotate, annotateAll, updateMetadata } = api;
  const [meta, setMeta] = useState<BlankMetadata>(() => ({
    ...emptyMetadata(),
    umPerPx: settings.umPerPx,
    threshold: settings.threshold,
  }));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const confirmed = useMemo(() => countConfirmed(library), [library]);
  const totalCandidates = useMemo(
    () => library.records.reduce((n, r) => n + r.candidates.length, 0),
    [library.records],
  );

  const patch = (p: Partial<BlankMetadata>) => setMeta((m) => ({ ...m, ...p }));

  async function handleFiles(files: File[]) {
    setError(null);
    for (const file of files) {
      setBusy(file.name);
      try {
        const result = await ingestBlankImage(file, meta, settings);
        const id = `${result.fileHash.slice(0, 12)}`;
        const record: BlankRecord = {
          id,
          fileName: file.name,
          fileHash: result.fileHash,
          width: result.width,
          height: result.height,
          addedAt: new Date().toISOString(),
          metadata: {
            ...meta,
            referenceId: meta.referenceId.trim() || `blank-${id.slice(0, 6)}`,
          },
          candidates: result.candidates,
        };
        addRecord(record);
        setOpenId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not read ${file.name}`);
      }
    }
    setBusy(null);
  }

  const open = library.records.find((r) => r.id === openId);

  return (
    <div className="panel flex min-h-0 flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Procedural-blank library</h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Blank micrographs are run through the same detector as samples. Only objects you mark{" "}
            <span className="text-destructive">confirmed procedural artefact</span> may ever support
            an automatic exclusion; everything else stays reference-only.
          </p>
        </div>
        <dl className="flex gap-4 font-mono text-[11px] text-muted-foreground">
          <div>
            <dt className="label-caps">Blanks</dt>
            <dd className="text-foreground">{library.records.length}</dd>
          </div>
          <div>
            <dt className="label-caps">Objects</dt>
            <dd className="text-foreground">{totalCandidates}</dd>
          </div>
          <div>
            <dt className="label-caps">Confirmed</dt>
            <dd className="text-foreground">{confirmed}</dd>
          </div>
          <div>
            <dt className="label-caps">Version</dt>
            <dd className="text-foreground">v{library.version}</dd>
          </div>
        </dl>
      </header>

      <section className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Blank reference ID" value={meta.referenceId} onChange={(v) => patch({ referenceId: v })} placeholder="blank-014" />
        <Field label="Working solution" value={meta.solution} onChange={(v) => patch({ solution: v })} placeholder="KOH 10%" />
        <Field label="Protocol" value={meta.protocol} onChange={(v) => patch({ protocol: v })} placeholder="Digestion A" />
        <Field label="Laboratory batch" value={meta.batch} onChange={(v) => patch({ batch: v })} placeholder="2026-B07" />
        <Field label="Acquisition date" type="date" value={meta.acquisitionDate} onChange={(v) => patch({ acquisitionDate: v })} />
        <Field label="Microscope" value={meta.microscope} onChange={(v) => patch({ microscope: v })} placeholder="Leica DM2500" />
        <Field label="Objective" value={meta.objective} onChange={(v) => patch({ objective: v })} placeholder="20x / 0.5" />
        <Field label="Camera / settings" value={meta.camera} onChange={(v) => patch({ camera: v })} placeholder="DFC450, 200 ms" />
        <label className="flex flex-col gap-1">
          <span className="label-caps">µm per pixel</span>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={meta.umPerPx}
            onChange={(e) => patch({ umPerPx: Math.max(1e-6, Number(e.target.value) || 0) })}
            className="field field-focus"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Threshold · {meta.threshold}</span>
          <input
            type="range"
            min={1}
            max={254}
            value={meta.threshold}
            onChange={(e) => patch({ threshold: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label-caps">Notes</span>
          <input
            value={meta.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Filter blank, no tissue"
            className="field field-focus"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void handleFiles(files);
            e.target.value = "";
          }}
        />
        <button className="btn-primary" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? `Detecting in ${busy}…` : "Add blank images"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Metadata above is applied to the images you add next.
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      <section className="flex min-h-0 flex-col gap-2 border-t border-border pt-3">
        {library.records.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No blanks yet. Add the procedural blanks acquired with the same solution, protocol and
            microscope settings as your samples.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {library.records.map((r) => {
            const c = r.candidates.filter(
              (x) => x.annotation === "confirmed_procedural_artifact",
            ).length;
            return (
              <li key={r.id}>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                  <button
                    className="flex-1 text-left"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    <span className="font-mono text-xs text-foreground">
                      {r.metadata.referenceId}
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {r.fileName} · {r.metadata.solution || "no solution"} ·{" "}
                      {r.metadata.protocol || "no protocol"} · batch {r.metadata.batch || "—"}
                    </span>
                  </button>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.candidates.length} obj · {c} confirmed
                  </span>
                  <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => removeRecord(r.id)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {open && (
        <section className="flex min-h-0 flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Annotate · {open.metadata.referenceId}{" "}
              <span className="font-mono text-[11px] text-muted-foreground">
                {open.width}×{open.height} px · thr {open.metadata.threshold} ·{" "}
                {open.metadata.umPerPx} µm/px
              </span>
            </h3>
            <div className="flex flex-wrap gap-1">
              {BLANK_ANNOTATIONS.map((a) => (
                <button
                  key={a}
                  className="btn-ghost px-2 py-0.5 text-[11px]"
                  onClick={() => annotateAll(open.id, a)}
                >
                  All → {ANNOTATION_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="label-caps">Record notes</span>
            <input
              value={open.metadata.notes}
              onChange={(e) => updateMetadata(open.id, { notes: e.target.value })}
              className="field field-focus"
            />
          </label>

          <ul className="grid max-h-[52vh] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {open.candidates.map((c) => (
              <li
                key={c.id}
                className={`flex flex-col gap-2 rounded-md border p-2 ${ANNOTATION_STYLES[c.annotation]}`}
              >
                <div className="flex items-start gap-2">
                  {c.crop && (
                    <img
                      src={c.crop}
                      alt={`Blank object ${c.particleId} tight crop with detected outline`}
                      className="h-20 w-20 shrink-0 rounded border border-border object-contain bg-black"
                    />
                  )}
                  {c.contextCrop && (
                    <img
                      src={c.contextCrop}
                      alt={`Blank object ${c.particleId} context crop`}
                      className="h-20 w-20 shrink-0 rounded border border-border object-contain bg-black"
                    />
                  )}
                  <dl className="min-w-0 flex-1 font-mono text-[10px] leading-tight text-muted-foreground">
                    <div className="text-foreground">#{c.particleId}</div>
                    <div>area {c.area.toFixed(1)} µm²</div>
                    <div>AR {c.aspectRatio.toFixed(2)}</div>
                    <div>circ {c.circularity.toFixed(2)}</div>
                    <div>feret {c.feret.toFixed(1)}</div>
                    <div>int {c.features.meanIntensity.toFixed(0)}</div>
                    <div>contrast {c.features.contrast.toFixed(0)}</div>
                    {c.touchesBorder && <div className="text-accent">touches border</div>}
                  </dl>
                </div>
                <select
                  value={c.annotation}
                  onChange={(e) => annotate(open.id, c.id, e.target.value as BlankAnnotation)}
                  className="field field-focus text-[11px]"
                >
                  {BLANK_ANNOTATIONS.map((a) => (
                    <option key={a} value={a}>
                      {ANNOTATION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field field-focus"
      />
    </label>
  );
}
