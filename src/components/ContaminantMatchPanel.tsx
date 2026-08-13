import { useMemo } from "react";
import type { ImageEntry } from "@/lib/study-types";
import { CONTAMINANT_TYPE_LABELS, SCOPE_LABELS } from "@/lib/contamination-memory";
import type { FamilyMatch } from "@/lib/contaminant-matching";

interface Props {
  entry: ImageEntry | undefined;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onExclude: (id: number) => void;
  onKeep: (id: number) => void;
  onMark: (id: number) => void;
  /** user-initiated bulk exclusion of high-confidence matches */
  onExcludeAllHighConfidence: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function MatchRow({ m }: { m: FamilyMatch }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-foreground">{m.familyName}</span>
        <span className={`font-mono text-[11px] ${m.highConfidence ? "text-accent" : "text-muted-foreground"}`}>
          {pct(m.similarity)} · {m.agreeingFeatures}/9 features
          {m.highConfidence ? " ●" : ""}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        {CONTAMINANT_TYPE_LABELS[m.contaminantType]} · {SCOPE_LABELS[m.scope]} · {m.status} ·{" "}
        {m.observations} confirmed observation{m.observations === 1 ? "" : "s"}
        {m.supportedByBlanks ? ` (${m.blankObservations} from procedural blanks)` : ""} · centre match{" "}
        {pct(m.centroidSimilarity)}
      </p>
      {!m.supportedByBlanks && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          No procedural-blank evidence — weaker suggestion.
        </p>
      )}
    </div>
  );
}

/**
 * Contamination-memory suggestions for the current image. Advisory only:
 * nothing is excluded until the reviewer acts, and both outcomes (exclude or
 * keep) are recorded as reviewer decisions.
 */
export function ContaminantMatchPanel({
  entry,
  selectedId,
  onSelect,
  onExclude,
  onKeep,
  onMark,
  onExcludeAllHighConfidence,
}: Props) {
  const flagged = useMemo(() => {
    const map = entry?.contaminantMatches ?? {};
    return Object.values(map).sort((a, b) => b.similarity - a.similarity);
  }, [entry?.contaminantMatches]);

  const highConfidenceCount = flagged.filter((m) => m.highConfidence).length;

  if (!entry) return null;
  const active = flagged.find((m) => m.particleId === selectedId);
  const particle = entry.analysis?.particles.find((p) => p.id === selectedId);

  return (
    <section className="panel flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="mr-auto text-sm font-semibold">Contamination memory</h3>
        <span className="label-caps">
          {flagged.length} particle{flagged.length === 1 ? "" : "s"} resemble known contaminants
        </span>
        {highConfidenceCount > 0 && (
          <button className="btn-ghost px-2 py-1" onClick={onExcludeAllHighConfidence}>
            Exclude {highConfidenceCount} high-confidence match
            {highConfidenceCount === 1 ? "" : "es"}
          </button>
        )}
        {particle && (
          <button className="btn-ghost px-2 py-1" onClick={() => onMark(particle.id)}>
            Mark #{particle.id} as contaminant
          </button>
        )}
      </div>

      {flagged.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
          {flagged.map((m) => (
            <button
              key={m.particleId}
              onClick={() => onSelect(m.particleId)}
              className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                m.particleId === selectedId
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-accent/40 text-foreground hover:bg-secondary"
              }`}
            >
              #{m.particleId} · {pct(m.similarity)}
              {m.highConfidence ? " ●" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 p-3">
        {!active ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {flagged.length
              ? "Select a suggested particle to see which contaminant family it resembles."
              : "No matches in this image. Use “Mark as contaminant” on a particle to add one."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                particle #{active.particleId}
                {particle ? ` · ${particle.morphology}` : ""}
                {particle?.rejected ? " · excluded" : ""}
              </span>
              <span className="ml-auto flex gap-2">
                <button className="btn-ghost px-2 py-1" onClick={() => onKeep(active.particleId)}>
                  Keep — genuine particle
                </button>
                <button
                  className="btn-primary px-2 py-1"
                  onClick={() => onExclude(active.particleId)}
                >
                  Exclude as contaminant
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {active.matches.map((m) => (
                <MatchRow key={m.familyId} m={m} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
