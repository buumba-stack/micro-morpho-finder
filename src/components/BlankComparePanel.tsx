import { useMemo, useState } from "react";
import type { ImageEntry } from "@/lib/study-types";
import { ANNOTATION_LABELS } from "@/lib/blank-library";
import type { BlankMatchDetail, ParticleBlankMatch } from "@/lib/blank-matching";

interface Props {
  entry: ImageEntry | undefined;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onExclude: (id: number) => void;
  onKeep: (id: number) => void;
  onExcludeAllHighConfidence: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

function MatchCard({ match, sample }: { match: BlankMatchDetail; sample: ParticleBlankMatch }) {
  const [context, setContext] = useState(false);
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-foreground">
          blank {match.referenceId} · {ANNOTATION_LABELS[match.annotation]}
        </span>
        <span className="font-mono text-[11px] text-accent">
          {pct(match.similarity)} · {match.agreeingFeatures}/9 features
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <figure className="flex flex-col gap-1">
          <figcaption className="label-caps">Sample particle #{sample.particleId}</figcaption>
          {sample.sampleCrop ? (
            <img
              src={sample.sampleCrop}
              alt={`Sample particle ${sample.particleId} crop`}
              className="w-full rounded border border-border bg-background"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="rounded border border-border py-6 text-center text-[11px] text-muted-foreground">
              no crop
            </div>
          )}
        </figure>
        <figure className="flex flex-col gap-1">
          <figcaption className="label-caps flex items-center justify-between gap-1">
            <span>Blank object</span>
            <button
              className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
              onClick={() => setContext((c) => !c)}
            >
              {context ? "tight" : "context"}
            </button>
          </figcaption>
          <img
            src={context ? match.contextCrop || match.crop : match.crop}
            alt={`Confirmed blank artefact ${match.referenceId}`}
            className="w-full rounded border border-border bg-background"
            style={{ imageRendering: "pixelated" }}
          />
        </figure>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <div>
          <dt className="label-plain">area</dt>
          <dd>{n(match.area)}</dd>
        </div>
        <div>
          <dt className="label-plain">feret</dt>
          <dd>{n(match.feret)}</dd>
        </div>
        <div>
          <dt className="label-plain">AR</dt>
          <dd>{n(match.aspectRatio, 3)}</dd>
        </div>
        <div>
          <dt className="label-plain">circ</dt>
          <dd>{n(match.circularity, 3)}</dd>
        </div>
      </dl>
      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
        source: {match.fileName}
      </p>
    </div>
  );
}

/**
 * "Procedural blank comparison" — side-by-side review of a sample particle and
 * the confirmed blank artefacts it resembles. Nothing is excluded automatically;
 * every exclusion here is an explicit user action.
 */
export function BlankComparePanel({
  entry,
  selectedId,
  onSelect,
  onExclude,
  onKeep,
  onExcludeAllHighConfidence,
}: Props) {
  const flagged = useMemo(() => {
    const map = entry?.blankMatches ?? {};
    return Object.values(map).sort((a, b) => b.similarity - a.similarity);
  }, [entry?.blankMatches]);

  if (!entry || !flagged.length) return null;

  const kept = new Set(entry.blankKeep ?? []);
  const highCount = flagged.filter((m) => m.highConfidence && !kept.has(m.particleId)).length;
  const active = flagged.find((m) => m.particleId === selectedId);
  const particle = entry.analysis?.particles.find((p) => p.id === selectedId);

  return (
    <section className="panel flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="mr-auto text-sm font-semibold">Procedural blank comparison</h3>
        <span className="label-caps">
          {flagged.length} flagged · {highCount} high-confidence
        </span>
        <button
          className="btn-ghost px-2 py-1"
          disabled={!highCount}
          onClick={onExcludeAllHighConfidence}
        >
          Exclude {highCount} high-confidence match{highCount === 1 ? "" : "es"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {flagged.map((m) => (
          <button
            key={m.particleId}
            onClick={() => onSelect(m.particleId)}
            className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
              m.particleId === selectedId
                ? "border-accent bg-accent/15 text-accent"
                : kept.has(m.particleId)
                  ? "border-border text-muted-foreground hover:bg-secondary"
                  : "border-accent/40 text-foreground hover:bg-secondary"
            }`}
          >
            #{m.particleId} · {pct(m.similarity)}
            {m.highConfidence ? " ●" : ""}
            {kept.has(m.particleId) ? " kept" : ""}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {!active ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Select a flagged particle to compare it with the closest confirmed blank artefacts.
            Advisory only — nothing is removed unless you exclude it.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                particle #{active.particleId}
                {particle ? ` · ${particle.morphology} · area ${n(particle.area)} µm²` : ""}
                {particle?.rejected ? " · excluded" : ""}
                {kept.has(active.particleId) ? " · kept by reviewer" : ""}
              </span>
              <span className="ml-auto flex gap-2">
                <button className="btn-ghost px-2 py-1" onClick={() => onKeep(active.particleId)}>
                  Keep particle
                </button>
                <button
                  className="btn-primary px-2 py-1"
                  onClick={() => onExclude(active.particleId)}
                >
                  Exclude as blank artefact
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {active.matches.map((m) => (
                <MatchCard key={m.candidateId} match={m} sample={active} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
