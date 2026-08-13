import { useState } from "react";
import type { useContaminationMemory } from "@/hooks/useContaminationMemory";
import type { AnalysisSettings } from "@/lib/particle-analysis";

export type MemoryApi = ReturnType<typeof useContaminationMemory>;

interface Props {
  memory: MemoryApi;
  settings: AnalysisSettings;
  /** distinct tissue labels currently loaded, offered as a default */
  tissues: string[];
}

/**
 * Analysis-batch selector. A batch is metadata only: it groups the images
 * processed together so contaminant memory can be scoped to it. It never
 * influences segmentation, calibration or classification.
 */
export function BatchBar({ memory, settings, tissues }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tissue, setTissue] = useState(tissues[0] ?? "");
  const [protocol, setProtocol] = useState("");
  const [solution, setSolution] = useState("");
  const [microscope, setMicroscope] = useState("");
  const [objective, setObjective] = useState("");

  const active = memory.activeBatch;

  const create = () => {
    if (!name.trim()) return;
    memory.createBatch({
      name: name.trim(),
      tissue: tissue.trim() || null,
      protocol: protocol.trim() || null,
      solution: solution.trim() || null,
      microscope: microscope.trim() || null,
      objective: objective.trim() || null,
      um_per_px: settings.umPerPx,
      threshold: settings.threshold,
    });
    setName("");
    setOpen(false);
  };

  return (
    <section className="panel flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Analysis batch</h3>
        <span className="label-caps">
          {memory.userId
            ? memory.syncing
              ? "syncing…"
              : memory.pendingSync
                ? `${memory.pendingSync} unsynced`
                : "synced to account"
            : "local only — sign in to keep memory across devices"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input-field w-auto min-w-[220px] font-mono text-[11px]"
          value={active?.id ?? ""}
          onChange={(e) => memory.selectBatch(e.target.value || null)}
        >
          <option value="">No batch selected</option>
          {memory.batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.status === "closed" ? " (closed)" : ""}
            </option>
          ))}
        </select>
        <button className="btn-ghost px-2 py-1" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "New batch"}
        </button>
        {active && (
          <button
            className="btn-ghost px-2 py-1"
            onClick={() =>
              active.status === "closed"
                ? memory.reopenBatch(active.id)
                : memory.closeBatch(active.id)
            }
          >
            {active.status === "closed" ? "Reopen batch" : "Complete batch"}
          </button>
        )}
      </div>

      {active && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-muted-foreground sm:grid-cols-4">
          <div>
            <dt className="label-plain">tissue</dt>
            <dd>{active.tissue || "—"}</dd>
          </div>
          <div>
            <dt className="label-plain">protocol</dt>
            <dd>{active.protocol || "—"}</dd>
          </div>
          <div>
            <dt className="label-plain">solution</dt>
            <dd>{active.solution || "—"}</dd>
          </div>
          <div>
            <dt className="label-plain">acquisition</dt>
            <dd>
              {[active.microscope, active.objective].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      )}

      {open && (
        <div className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Batch name</span>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Liver run 2026-03-04"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Tissue</span>
            <input
              className="input-field"
              value={tissue}
              onChange={(e) => setTissue(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Digestion protocol</span>
            <input
              className="input-field"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Solution / reagent lot</span>
            <input
              className="input-field"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Microscope</span>
            <input
              className="input-field"
              value={microscope}
              onChange={(e) => setMicroscope(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Objective</span>
            <input
              className="input-field"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </label>
          <button className="btn-primary self-end px-2 py-1" disabled={!name.trim()} onClick={create}>
            Create batch
          </button>
        </div>
      )}
    </section>
  );
}
