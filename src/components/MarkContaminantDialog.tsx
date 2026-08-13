import { useMemo, useState } from "react";
import type { AppearanceFeatures } from "@/lib/blank-library";
import {
  CONTAMINANT_SCOPES,
  CONTAMINANT_TYPES,
  CONTAMINANT_TYPE_LABELS,
  SCOPE_LABELS,
  type ContaminantScope,
  type ContaminantType,
  type SourceType,
} from "@/lib/contamination-memory";
import type { MemoryApi } from "@/components/BatchBar";

export interface MarkTarget {
  particleId: number;
  sourceImageId: string;
  sourceImageName: string;
  tissue: string | null;
  features: AppearanceFeatures | undefined;
  sourceType: SourceType;
  proposedPrediction?: string | null;
  proposedConfidence?: number | null;
}

interface Props {
  target: MarkTarget;
  memory: MemoryApi;
  onClose: () => void;
  /** called after the particle has been recorded, so it can also be excluded */
  onMarked?: ((particleId: number) => void) | undefined;
}

/**
 * "Mark as contaminant" — the only way an observation enters the contamination
 * memory. Always an explicit human decision, always stored as confirmed truth,
 * separate from matcher predictions.
 */
export function MarkContaminantDialog({ target, memory, onClose, onMarked }: Props) {
  const protocol = memory.activeBatch?.protocol ?? null;
  const [familyId, setFamilyId] = useState<string>("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ContaminantType>("procedural_blank_contaminant");
  const [scope, setScope] = useState<ContaminantScope>("batch");
  const [note, setNote] = useState("");
  const [alsoExclude, setAlsoExclude] = useState(true);

  const families = useMemo(
    () =>
      memory.families.filter((f) =>
        f.scope === "batch" ? f.batch_id === memory.activeBatch?.id : true,
      ),
    [memory.families, memory.activeBatch?.id],
  );

  const scopeBlocked = scope === "batch" && !memory.activeBatch;
  const canSave = familyId ? true : Boolean(name.trim()) && !scopeBlocked;

  const save = () => {
    if (!canSave) return;
    memory.markContaminant({
      particleId: target.particleId,
      sourceImageId: target.sourceImageId,
      sourceImageName: target.sourceImageName,
      tissue: target.tissue,
      protocol,
      features: target.features,
      sourceType: target.sourceType,
      note: note.trim() || null,
      proposedPrediction: target.proposedPrediction ?? null,
      proposedConfidence: target.proposedConfidence ?? null,
      ...(familyId
        ? { familyId }
        : {
            newFamily: {
              name: name.trim(),
              contaminant_type: type,
              scope,
            },
          }),
    });
    if (alsoExclude) onMarked?.(target.particleId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="panel flex w-full max-w-lg flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Mark particle as contaminant</h3>
          <button className="btn-ghost px-2 py-0.5" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="font-mono text-[11px] text-muted-foreground">
          particle #{target.particleId} · {target.sourceImageName}
          {target.tissue ? ` · ${target.tissue}` : ""}
          {target.proposedPrediction
            ? ` · matcher proposed ${target.proposedPrediction}${
                target.proposedConfidence
                  ? ` (${Math.round(target.proposedConfidence * 100)}%)`
                  : ""
              }`
            : ""}
        </p>

        <label className="flex flex-col gap-1">
          <span className="label-caps">Contaminant family</span>
          <select
            className="input-field"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            <option value="">➕ New family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {SCOPE_LABELS[f.scope]} · {f.status}
              </option>
            ))}
          </select>
        </label>

        {!familyId && (
          <div className="grid gap-2 rounded-md border border-border p-2">
            <label className="flex flex-col gap-1">
              <span className="label-caps">Family name</span>
              <input
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blue filter fibre"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-caps">Contaminant type</span>
              <select
                className="input-field"
                value={type}
                onChange={(e) => setType(e.target.value as ContaminantType)}
              >
                {CONTAMINANT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTAMINANT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-caps">Applies to</span>
              <select
                className="input-field"
                value={scope}
                onChange={(e) => setScope(e.target.value as ContaminantScope)}
              >
                {CONTAMINANT_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {scopeBlocked && (
              <p className="font-mono text-[11px] text-accent">
                Select or create an analysis batch first, or choose a wider scope.
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="label-caps">Note (optional)</span>
          <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <label className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoExclude}
            onChange={(e) => setAlsoExclude(e.target.checked)}
            className="accent-primary"
          />
          Also exclude this particle from the results
        </label>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-2 py-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary px-2 py-1" disabled={!canSave} onClick={save}>
            Save to contamination memory
          </button>
        </div>
      </div>
    </div>
  );
}
