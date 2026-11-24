import { useEffect, useMemo, useRef, useState } from "react";
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
import { PublicationExport } from "@/components/PublicationExport";
import { matchPairFigure } from "@/lib/publication/figures";

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

/** Largest display box side in screen px. */
const VIEW = 240;

function niceBar(umAcross: number): number {
  const target = umAcross / 4;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (s <= target ? s : best), steps[0]!);
}

type Source = CanvasImageSource & { width: number; height: number };

/**
 * Draws only the field of view at native pixel size into a small canvas
 * (never enlarged), then displays it with CSS size and pixelated rendering.
 * The outline is a vector overlay so no large canvas is ever created. Display only.
 */
function FieldCanvas({ src, cx, cy, sw, sh, W, H, outline, label, umAcross, pxPerUm, note }: {
  src: Source | null; cx: number; cy: number; sw: number; sh: number; W: number; H: number;
  outline?: ArrayLike<number> | null | undefined; label: string; umAcross: number; pxPerUm: number; note?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Native-pixel canvas covering the field (rounded up to whole pixels, centred on the particle).
  const cw = Math.max(1, Math.ceil(sw));
  const ch = Math.max(1, Math.ceil(sh));
  const x0 = cx - cw / 2, y0 = cy - ch / 2;
  // Screen px per native px; identical per-µm size for both images comes from W = field µm × pxPerUm.
  const k = sw > 0 ? W / sw : 1;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    if (!src || sw <= 0 || sh <= 0) return;
    ctx.imageSmoothingEnabled = false;
    const ix = Math.max(0, x0), iy = Math.max(0, y0);
    const ix2 = Math.min(src.width, x0 + cw), iy2 = Math.min(src.height, y0 + ch);
    if (ix2 > ix && iy2 > iy) ctx.drawImage(src, ix, iy, ix2 - ix, iy2 - iy, ix - x0, iy - y0, ix2 - ix, iy2 - iy);
  }, [src, cw, ch, x0, y0, sw, sh]);
  const bar = niceBar(umAcross);
  let path = "";
  if (outline && outline.length >= 4) {
    for (let i = 0; i < outline.length; i += 2) path += `${i ? "L" : "M"}${outline[i]! + 0.5 - x0} ${outline[i + 1]! + 0.5 - y0}`;
    path += "Z";
  }
  const dispW = cw * k, dispH = ch * k;
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center overflow-hidden rounded border border-border bg-muted" style={{ width: VIEW, height: VIEW }}>
        {src ? (
          <div className="relative shrink-0" style={{ width: dispW, height: dispH }}>
            <canvas ref={ref} aria-label={label} className="match-display block" style={{ width: dispW, height: dispH, imageRendering: "pixelated" }} />
            {path && (
              <svg className="pointer-events-none absolute inset-0" width={dispW} height={dispH} viewBox={`0 0 ${cw} ${ch}`} aria-hidden="true">
                {/* Matches the stored reference outline (blank-ingest): rgba(255,90,90,0.9), 0.6 native px. */}
                <path d={path} fill="none" stroke="rgba(255,90,90,0.9)" strokeWidth={Math.max(1, k * 0.6)} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No image stored</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-1 bg-foreground" style={{ width: bar * pxPerUm }} />
        {bar} µm
      </div>
      <figcaption className="text-xs font-medium">{label}</figcaption>
      {note && <p className="max-w-[240px] text-center text-[11px] text-muted-foreground">{note}</p>}
    </figure>
  );
}

/** Decodes the original micrograph once for display. */
function useBitmap(file: Blob | undefined) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    setBmp(null);
    if (!file) return;
    let cancelled = false;
    void createImageBitmap(file).then((b) => { if (!cancelled) setBmp(b); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [file]);
  return bmp;
}

/** Loads a stored reference crop as an image element. */
function useImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!src) return;
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = src;
  }, [src]);
  return img;
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
  const bitmap = useBitmap(entry?.file);
  const topBlank = blank?.matches[0];
  const refImg = useImage(active === "blank" ? topBlank?.crop : undefined);
  const refSize = refImg ? { w: refImg.naturalWidth, h: refImg.naturalHeight } : null;
  const [view, setView] = useState<"context" | "closeup">("context");
  const [showOutline, setShowOutline] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [pubScore, setPubScore] = useState(true);

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

  // Shared physical field of view (µm) for both images.
  const refNativeUm = refRecord?.metadata.umPerPx || 0;
  const longest = particle ? Math.max(particle.bwPx, particle.bhPx) * umPerPx : 0;
  const field = view === "closeup" || !longest
    ? { w: longest * 1.2, h: longest * 1.2 }
    : active === "blank" && refUmSize
      ? { w: refUmSize.w, h: refUmSize.h }
      : { w: longest * 3, h: longest * 3 };
  const fieldMax = Math.max(field.w, field.h, 1e-6);
  // One shared screen-px-per-µm factor: the field fills the box in both images.
  const pxPerUm = VIEW / fieldMax;
  const fmtX = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, "");
  const candX = pxPerUm * umPerPx;
  const refX = active === "blank" && refNativeUm ? pxPerUm * refNativeUm : candX;
  const W = field.w * pxPerUm, H = field.h * pxPerUm;
  const refStoredPerUm = refSize && refUmSize ? refSize.w / refUmSize.w : 0;
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

      <style>{`[aria-label="Match review"] .match-display{filter:brightness(${brightness}%) contrast(${contrast}%)}`}</style>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex gap-1">
          <Button size="sm" variant={view === "context" ? "default" : "outline"} onClick={() => setView("context")}>Context</Button>
          <Button size="sm" variant={view === "closeup" ? "default" : "outline"} onClick={() => setView("closeup")}>Close-up</Button>
        </div>
        <label className="flex items-center gap-1"><input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} /> Outline</label>
        <label className="flex items-center gap-1">Brightness <input type="range" min={50} max={300} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label>
        <label className="flex items-center gap-1">Contrast <input type="range" min={50} max={300} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
        <span className="text-muted-foreground">Field {fieldMax.toFixed(0)} µm · display only, same for both</span>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-wrap gap-4">
          <FieldCanvas
            src={bitmap}
            cx={particle ? particle.bxPx + particle.bwPx / 2 : 0}
            cy={particle ? particle.byPx + particle.bhPx / 2 : 0}
            sw={field.w / umPerPx}
            sh={field.h / umPerPx}
            W={W}
            H={H}
            outline={showOutline ? particle?.outline : null}
            umAcross={fieldMax}
            pxPerUm={pxPerUm}
            label={`Candidate #${currentId}`}
          />
          {active === "blank" ? (
            <FieldCanvas
              src={refImg}
              cx={(refSize?.w ?? 0) / 2}
              cy={(refSize?.h ?? 0) / 2}
              sw={field.w * refStoredPerUm}
              sh={field.h * refStoredPerUm}
              W={W}
              H={H}
              umAcross={fieldMax}
              pxPerUm={pxPerUm}
              label={`Reference ${topBlank?.referenceId ?? ""}`}
              note="Reference outline is part of the stored image and cannot be hidden."
            />
          ) : (
            <FieldCanvas src={null} cx={0} cy={0} sw={0} sh={0} W={0} H={0} umAcross={1} pxPerUm={pxPerUm} label={contaminant?.matches[0]?.familyName ?? "Reference"} />
          )}
          <p className="w-full text-xs text-muted-foreground">
            Displayed at {fmtX(candX)}×{Math.abs(refX - candX) > 0.05 ? ` (reference ${fmtX(refX)}× of its original pixels)` : ""} (nearest-neighbour)
          </p>
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
          {bitmap && particle && (
            <PublicationExport
              entry={entry}
              baseName={`${entry?.name ?? "image"}_candidate${currentId}_match`}
              build={(widthMm) => matchPairFigure({
                widthMm,
                fieldUm: field,
                candidate: {
                  src: bitmap, cx: particle.bxPx + particle.bwPx / 2, cy: particle.byPx + particle.bhPx / 2,
                  sw: field.w / umPerPx, sh: field.h / umPerPx, outline: showOutline ? particle.outline : null,
                },
                reference: active === "blank" && refImg && refSize && refStoredPerUm
                  ? { src: refImg, cx: refSize.w / 2, cy: refSize.h / 2, sw: field.w * refStoredPerUm, sh: field.h * refStoredPerUm }
                  : null,
                scoreLine: pubScore ? `Similarity ${Math.round((similarity ?? 0) * 100)}% · ${agreeing ?? 0} of ${rows?.length ?? 9} features agree` : undefined,
              })}
              extras={() => ({
                figure: `Match review pair (${view === "closeup" ? "close-up" : "context"}, field ${field.w.toFixed(1)} × ${field.h.toFixed(1)} µm)`,
                candidateId: currentId,
                referenceId: active === "blank" ? topBlank?.referenceId : contaminant?.matches[0]?.familyId,
                similarity,
                featuresAgreeing: `${agreeing ?? 0} of ${rows?.length ?? 9}`,
                displayFactor: `${fmtX(candX)}× on screen (nearest-neighbour)${Math.abs(refX - candX) > 0.05 ? `; reference ${fmtX(refX)}× of its original pixels` : ""}`,
              })}
            >
              <label className="flex items-center gap-1"><input type="checkbox" checked={pubScore} onChange={(e) => setPubScore(e.target.checked)} /> Similarity and feature agreement</label>
            </PublicationExport>
          )}
        </div>
      </div>
    </section>
  );
}
