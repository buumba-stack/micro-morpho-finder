import { useMemo, useState } from "react";
import type { MemoryApi } from "@/components/BatchBar";
import {
  CONTAMINANT_SCOPES,
  CONTAMINANT_TYPE_LABELS,
  SCOPE_LABELS,
  suggestedStatus,
  summariseFamily,
  type ContaminantScope,
} from "@/lib/contamination-memory";
import type { useBlankLibrary } from "@/hooks/useBlankLibrary";

interface Props {
  memory: MemoryApi;
  blanks: ReturnType<typeof useBlankLibrary>;
}

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/**
 * Contamination memory review: what the app remembers, how strong the evidence
 * is, and the batch-completion step where families are promoted, merged or
 * removed. Every change here is an explicit user action.
 */
export function ContaminationMemoryPanel({ memory, blanks }: Props) {
  const [mergeInto, setMergeInto] = useState<string>("");
  const [mergeFrom, setMergeFrom] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      memory.families.map((f) => ({
        family: f,
        summary: summariseFamily(f.id, memory.observations),
      })),
    [memory.families, memory.observations],
  );

  const confirmedBlanks = useMemo(
    () =>
      blanks.library.records.flatMap((r) =>
        r.candidates
          .filter((c) => c.annotation === "confirmed_procedural_artifact")
          .map((c) => ({
            key: `${r.id}:${c.id}`,
            particleId: c.particleId,
            sourceImageId: r.id,
            sourceImageName: r.fileName,
            features: c.features,
          })),
      ),
    [blanks.library.records],
  );

  const notYetImported = confirmedBlanks.filter(
    (c) => !memory.state.importedBlankCandidates.includes(c.key),
  );

  const keeps = memory.decisions.filter((d) => d.decision === "keep_genuine_particle").length;
  const confirmations = memory.decisions.filter(
    (d) => d.decision === "confirmed_contaminant",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Contamination memory</h3>
          <span className="label-caps">
            {memory.families.length} famil{memory.families.length === 1 ? "y" : "ies"} ·{" "}
            {memory.observations.length} confirmed observations · {confirmations} exclusions ·{" "}
            {keeps} kept as genuine
          </span>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Only particles you explicitly marked as contamination are stored here — matcher
          suggestions are kept separately and never become truth. Memory is advisory: it changes
          what MicroFluor points out, never what it measures.
        </p>
        {!memory.userId && (
          <p className="font-mono text-[11px] text-accent">
            Working offline: memory is stored on this machine. Sign in to keep it with your account.
          </p>
        )}
      </section>

      {notYetImported.length > 0 && memory.families.length > 0 && (
        <section className="panel flex flex-col gap-2 p-3">
          <h4 className="text-sm font-semibold">Import from procedural-blank library</h4>
          <p className="text-[11px] text-muted-foreground">
            {notYetImported.length} confirmed procedural artefact
            {notYetImported.length === 1 ? "" : "s"} in the blank library are not part of any family
            yet.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input-field w-auto min-w-[220px] font-mono text-[11px]"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
            >
              <option value="">Choose family…</option>
              {memory.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary px-2 py-1"
              disabled={!mergeInto}
              onClick={() => memory.importBlankObservations(mergeInto, notYetImported)}
            >
              Import {notYetImported.length} observation
              {notYetImported.length === 1 ? "" : "s"}
            </button>
          </div>
        </section>
      )}

      <section className="panel flex flex-col overflow-hidden">
        <div className="border-b border-border px-3 py-2">
          <h4 className="text-sm font-semibold">Contaminant families</h4>
        </div>
        {rows.length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground">
            Nothing remembered yet. Use “Mark as contaminant” on a particle during review.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {rows.map(({ family, summary }) => {
              const advised = suggestedStatus(summary);
              return (
                <div key={family.id} className="flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input-field w-auto min-w-[180px] font-mono text-[11px]"
                      value={family.name}
                      onChange={(e) => memory.updateFamily(family.id, { name: e.target.value })}
                    />
                    <select
                      className="input-field w-auto font-mono text-[11px]"
                      value={family.scope}
                      onChange={(e) =>
                        memory.updateFamily(family.id, {
                          scope: e.target.value as ContaminantScope,
                        })
                      }
                    >
                      {CONTAMINANT_SCOPES.map((s) => (
                        <option key={s} value={s}>
                          {SCOPE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {CONTAMINANT_TYPE_LABELS[family.contaminant_type]}
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        family.status === "established" ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {family.status}
                    </span>
                    {advised !== family.status && (
                      <button
                        className="btn-ghost px-2 py-0.5"
                        onClick={() => memory.updateFamily(family.id, { status: advised })}
                      >
                        Set status to {advised}
                      </button>
                    )}
                    <button
                      className="btn-ghost ml-auto px-2 py-0.5"
                      onClick={() => memory.deleteFamily(family.id)}
                    >
                      Delete family
                    </button>
                  </div>

                  <p className="font-mono text-[11px] text-muted-foreground">
                    {summary.confirmedObservations} confirmed · {summary.blankObservations} from
                    procedural blanks · {summary.sampleObservations} from samples ·{" "}
                    {summary.imageCount} image{summary.imageCount === 1 ? "" : "s"}
                    {family.protocol ? ` · protocol ${family.protocol}` : ""}
                    {family.tissue ? ` · tissue ${family.tissue}` : ""}
                  </p>

                  {summary.featureRanges.length > 0 && (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground sm:grid-cols-5">
                      {summary.featureRanges.map((r) => (
                        <div key={r.key}>
                          <dt className="label-plain">{r.key}</dt>
                          <dd>
                            {n(r.mean)} ({n(r.min)}–{n(r.max)})
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={mergeFrom.includes(family.id)}
                        onChange={(e) =>
                          setMergeFrom((prev) =>
                            e.target.checked
                              ? [...prev, family.id]
                              : prev.filter((id) => id !== family.id),
                          )
                        }
                      />
                      select for merge
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mergeFrom.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              Merge {mergeFrom.length} selected families into:
            </span>
            <select
              className="input-field w-auto font-mono text-[11px]"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
            >
              <option value="">Choose target…</option>
              {memory.families
                .filter((f) => mergeFrom.includes(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            <button
              className="btn-primary px-2 py-1"
              disabled={!mergeInto || !mergeFrom.includes(mergeInto)}
              onClick={() => {
                memory.mergeFamilies(mergeFrom, mergeInto);
                setMergeFrom([]);
              }}
            >
              Merge
            </button>
          </div>
        )}
      </section>

      <section className="panel flex flex-col gap-2 p-3">
        <h4 className="text-sm font-semibold">Batches</h4>
        {memory.batches.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No batches recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-[11px]">
            {memory.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <span className={b.id === memory.activeBatch?.id ? "text-primary" : ""}>{b.name}</span>
                <span className="text-muted-foreground">
                  {[b.tissue, b.protocol, b.analysis_date].filter(Boolean).join(" · ")}
                </span>
                <span className="text-muted-foreground">{b.status}</span>
                <button className="btn-ghost px-2 py-0.5" onClick={() => memory.selectBatch(b.id)}>
                  Use
                </button>
                <button
                  className="btn-ghost px-2 py-0.5"
                  onClick={() =>
                    b.status === "closed" ? memory.reopenBatch(b.id) : memory.closeBatch(b.id)
                  }
                >
                  {b.status === "closed" ? "Reopen" : "Complete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
