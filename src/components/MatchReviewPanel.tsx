import { useEffect, useMemo, useState } from "react";
import type { ImageEntry } from "@/lib/study-types";
import type { BlankLibraryState } from "@/lib/blank-library";
import type { AppearanceFeatures } from "@/lib/blank-library";
import { agreeingFeatureCount } from "@/lib/blank-library";

/**
 * Per-feature agreement derived only by calling the existing
 * agreeingFeatureCount: the probe equals the candidate except for one feature
 * taken from the reference, so the count drops by one exactly when that
 * feature fails the existing rule. No tolerances are redefined here.
 */
function featureAgreementRows(a: AppearanceFeatures, b: AppearanceFeatures) {
  const all = agreeingFeatureCount(a, a);
  return (Object.keys(a) as (keyof AppearanceFeatures)[]).map((key) => ({
    key,
    candidate: a[key],
    reference: b[key],
    agrees: agreeingFeatureCount(a, { ...a, [key]: b[key] }) === all,
  })).filter((row) => row.key in FEATURE_LABELS);
}
import { Button } from "@/components/ui/button";

interface Props {
  entry: ImageEntry | undefined;
  library: BlankLibraryState;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAcceptBlank: (id: number) => void;
  onRejectBlank: (id: number) => void;
  onAcceptContaminant: (id: number) => void;
  onRejectContaminant: (id: number) => void;
}

const FEATURE_LABELS: Record<string, string> = {
  logArea: "Area (log)",
  elongation: "Elongation",
  circularity: "Circularity",
  solidity: "Solidity",
  meanIntensity: "Mean intensity",
  contrast: "Contrast",
  saturation: "Saturation",
  intensitySd: "Texture (SD)",
  hue: "Hue",
};

/** Shared display scale: screen px per µm. */
const VIEW = 220;

function niceBar(umAcross: number): number {
  const target = umAcross / 4;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (s <= target ? s : best), steps[0]!);
}

function ScaledCrop({ src, umWidth, umHeight, pxPerUm, label }: { src: string; umWidth: number; umHeight: number; pxPerUm: number; label: string }) {
  const bar = niceBar(Math.max(umWidth, umHeight));
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="flex h-[240px] w-[240px] items-center justify-center overflow-hidden rounded border border-border bg-muted">
        {src ? (
          <img src={src} alt={label} style={{ width: umWidth * pxPerUm, height: umHeight * pxPerUm, imageRendering: "pixelated" }} />
        ) : (
          <span className="text-xs text-muted-foreground">No image stored</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-1 bg-foreground" style={{ width: bar * pxPerUm }} />
        {bar} µm
      </div>
      <figcaption className="text-xs font-medium">{label}</figcaption>
    </figure>
  );
}

/** Renders the candidate crop at a known scale (source px → µm). */
function useCandidateCrop(entry: ImageEntry | undefined, particleId: number | null) {
  const [crop, setCrop] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    setCrop(null);
    const p = entry?.analysis?.particles.find((x) => x.id === particleId);
    if (!entry?.file || !p) return;
    let cancelled = false;
    void createImageBitmap(entry.file).then((bmp) => {
      if (cancelled) return;
      const pad = Math.max(4, Math.round(Math.max(p.bwPx, p.bhPx) * 0.25));
      const x = Math.max(0, Math.round(p.bxPx) - pad);
      const y = Math.max(0, Math.round(p.byPx) - pad);
      const w = Math.min(bmp.width - x, Math.round(p.bwPx) + pad * 2);
      const h = Math.min(bmp.height - y, Math.round(p.bhPx) + pad * 2);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      setCrop({ src: c.toDataURL(), w, h });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [entry?.file, entry?.analysis, particleId]);
  return crop;
}

/** Natural size of a stored reference crop. */
function useNaturalSize(src: string | undefined) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setSize(null);
    if (!src) return;
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  return size;
}

export function MatchReviewPanel(props: Props) {
  const { entry, library, selectedId, onSelect } = props;
  const queue = useMemo(() => {
    const ids = new Set<number>([
      ...Object.keys(entry?.blankMatches ?? {}).map(Number),
      ...Object.keys(entry?.contaminantMatches ?? {}).map(Number),
    ]);
    return [...ids].sort((a, b) => a - b);
  }, [entry?.blankMatches, entry?.contaminantMatches]);

  const index = selectedId !== null ? queue.indexOf(selectedId) : -1;
  const currentId = index >= 0 ? queue[index]! : queue[0] ?? null;
  const position = index >= 0 ? index : 0;
  const blank = currentId !== null ? entry?.blankMatches?.[currentId] : undefined;
  const contaminant = currentId !== null ? entry?.contaminantMatches?.[currentId] : undefined;
  const [source, setSource] = useState<"blank" | "memory">("blank");
  const active = source === "blank" && blank ? "blank" : contaminant ? "memory" : blank ? "blank" : null;

  const particle = entry?.analysis?.particles.find((p) => p.id === currentId);
  const umPerPx = entry?.runSettings?.umPerPx ?? entry?.settings.umPerPx ?? 1;
  const candidateCrop = useCandidateCrop(entry, currentId);
  const topBlank = blank?.matches[0];
  const refSize = useNaturalSize(active === "blank" ? topBlank?.crop : undefined);

  const refRecord = topBlank ? library.records.find((r) => r.id === topBlank.recordId) : undefined;
  const refCandidate = refRecord?.candidates.find((c) => c.id === topBlank?.candidateId);
  const candFeatures = currentId !== null ? entry?.features?.[currentId] : undefined;
  const rows = active === "blank" && candFeatures && refCandidate ? featureAgreementRows(candFeatures, refCandidate.features) : null;

  // Reference crop source scale, as written by the existing crop renderer:
  // natural side <200 → 4×, >200 → 1×, =200 → 200/sourceSide (estimated from Feret).
  const refUmSize = useMemo(() => {
    if (!refSize || !refRecord || !topBlank) return null;
    const exact = Math.max(refSize.w, refSize.h) !== 200;
    const m = Math.max(refSize.w, refSize.h);
    const um = refRecord.metadata.umPerPx || 1;
    let scale: number;
    if (m < 200) scale = 4;
    else if (m > 200) scale = 1;
    else {
      const box = topBlank.feret / um;
      scale = Math.min(4, Math.max(1, 200 / (box + 2 * Math.max(4, Math.round(box * 0.25)))));
    }
    return { w: (refSize.w / scale) * um, h: (refSize.h / scale) * um, exact };
  }, [refSize, refRecord, topBlank]);

  const candUm = candidateCrop ? { w: candidateCrop.w * umPerPx, h: candidateCrop.h * umPerPx } : null;
  const largest = Math.max(candUm?.w ?? 0, candUm?.h ?? 0, refUmSize?.w ?? 0, refUmSize?.h ?? 0, 1);
  const pxPerUm = VIEW / largest;

  const similarity = active === "blank" ? blank?.similarity : contaminant?.similarity;
  const agreeing = active === "blank" ? topBlank?.agreeingFeatures : contaminant?.matches[0]?.agreeingFeatures;
  const agreeCount = rows?.filter((r) => r.agrees).length;
  const breakdownOk = !!rows && agreeCount === agreeing;
  const approxScale = active === "blank" && refUmSize ? !refUmSize.exact : active !== "blank";
  const high = active === "blank" ? blank?.highConfidence : contaminant?.highConfidence;

  const go = (d: number) => {
    if (!queue.length) return;
    const next = queue[(position + d + queue.length) % queue.length]!;
    onSelect(next);
  };
  const decide = (accept: boolean) => {
    if (currentId === null || !active) return;
    if (active === "blank") (accept ? props.onAcceptBlank : props.onRejectBlank)(currentId);
    else (accept ? props.onAcceptContaminant : props.onRejectContaminant)(currentId);
    if (queue.length > 1) go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !queue.length) return;
      const k = e.key.toLowerCase();
      if (k === "e") decide(true);
      else if (k === "k") decide(false);
      else if (k === "n") go(1);
      else if (k === "p") go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!queue.length || currentId === null) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="Match review">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Match review</h2>
        <span className="text-xs text-muted-foreground">{approxScale ? "Approximately same scale" : "Same scale"} · Candidate {position + 1} of {queue.length}</span>
      </header>

      {blank && contaminant && (
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant={active === "blank" ? "default" : "outline"} onClick={() => setSource("blank")}>Blank library</Button>
          <Button size="sm" variant={active === "memory" ? "default" : "outline"} onClick={() => setSource("memory")}>Contamination memory</Button>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-wrap gap-4">
          <ScaledCrop
            src={candidateCrop?.src ?? ""}
            umWidth={candUm?.w ?? 0}
            umHeight={candUm?.h ?? 0}
            pxPerUm={pxPerUm}
            label={`Candidate #${currentId}`}
          />
          {active === "blank" ? (
            <ScaledCrop
              src={topBlank?.crop ?? ""}
              umWidth={refUmSize?.w ?? 0}
              umHeight={refUmSize?.h ?? 0}
              pxPerUm={pxPerUm}
              label={`Reference ${topBlank?.referenceId ?? ""}`}
            />
          ) : (
            <ScaledCrop src="" umWidth={0} umHeight={0} pxPerUm={pxPerUm} label={contaminant?.matches[0]?.familyName ?? "Reference"} />
          )}
        </div>

        <div className="flex min-w-[200px] flex-1 flex-col gap-3">
          <div className="text-4xl font-semibold tabular-nums">{Math.round((similarity ?? 0) * 100)}%</div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${high ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {high ? "High-confidence match" : "Potential match"}
          </span>

          {rows ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground"><th className="text-left">Feature</th><th className="text-right">Candidate</th><th className="text-right">Reference</th>{breakdownOk && <th className="text-center">Agree</th>}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td>{FEATURE_LABELS[r.key] ?? r.key}</td>
                    <td className="text-right tabular-nums">{r.candidate.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{r.reference.toFixed(2)}</td>
                    {breakdownOk && <td className="text-center" aria-label={r.agrees ? "agrees" : "differs"}>{r.agrees ? "✓" : "✗"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">Per-feature values are not stored for this reference.</p>
          )}
          {rows && !breakdownOk && <p className="text-xs text-muted-foreground">Per-feature breakdown unavailable for this match</p>}
          <p className="text-sm font-medium">{agreeing ?? 0} of {rows?.length ?? 9} features agree</p>
          {particle && <p className="text-xs text-muted-foreground">Feret {particle.feret.toFixed(1)} µm · {particle.morphology}</p>}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={() => decide(true)}>Confirm match – exclude particle</Button>
            <Button size="sm" variant="outline" onClick={() => decide(false)}>Not a match – keep particle</Button>
            <Button size="sm" variant="ghost" onClick={() => go(-1)}>Previous</Button>
            <Button size="sm" variant="ghost" onClick={() => go(1)}>Next</Button>
          </div>
          <p className="text-xs text-muted-foreground">Shortcuts: E exclude · K keep · N next · P previous</p>
        </div>
      </div>
    </section>
  );
}
