import { useEffect, useMemo, useRef, useState } from "react";
import { decodeToImageData, thresholdPreview, type Particle } from "@/lib/particle-analysis";
import type { ImageEntry } from "@/lib/study-types";

const MORPH_VAR: Record<string, string> = {
  fibre: "--fibre",
  sphere: "--sphere",
  pellet: "--pellet",
  fragment: "--fragment",
};

function cssColor(name: string): string {
  if (typeof window === "undefined") return "#fff";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";
}

interface Props {
  entry: ImageEntry | undefined;
  threshold: number;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onToggleReject: (id: number) => void;
}

export function ImageViewer({ entry, threshold, selectedId, onSelect, onToggleReject }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [source, setSource] = useState<{ id: string; imageData: ImageData } | null>(null);
  const [mode, setMode] = useState<"fluorescence" | "binary">("fluorescence");
  const [showOutlines, setShowOutlines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(1);
  const blankMatches = entry?.blankMatches;
  const keptIds = useMemo(() => new Set(entry?.blankKeep ?? []), [entry?.blankKeep]);

  useEffect(() => {
    let cancelled = false;
    if (!entry) {
      setSource(null);
      return;
    }
    decodeToImageData(entry.file)
      .then(({ imageData }) => {
        if (!cancelled) setSource({ id: entry.id, imageData });
      })
      .catch(() => {
        if (!cancelled) setSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const particles = entry?.analysis?.particles ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || !entry || source.id !== entry.id) return;
    const { imageData } = source;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.putImageData(mode === "binary" ? thresholdPreview(imageData, threshold) : imageData, 0, 0);

    if (!showOutlines) return;
    const rejectedColor = cssColor("--rejected");
    const blankColor = cssColor("--accent") || "#e0a33c";
    const lw = Math.max(1, Math.round(Math.max(canvas.width, canvas.height) / 700));
    ctx.lineJoin = "round";
    ctx.font = `${Math.max(11, Math.round(canvas.height / 60))}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "bottom";

    for (const p of particles) {
      const color = p.rejected ? rejectedColor : cssColor(MORPH_VAR[p.morphology] ?? "--fragment");
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = p.id === selectedId ? lw * 3 : lw * 1.5;
      if (p.rejected) ctx.setLineDash([lw * 3, lw * 3]);
      ctx.beginPath();
      const o = p.outline;
      ctx.moveTo(o[0]! + 0.5, o[1]! + 0.5);
      for (let i = 2; i < o.length; i += 2) ctx.lineTo(o[i]! + 0.5, o[i + 1]! + 0.5);
      ctx.closePath();
      ctx.stroke();

      // procedural-blank match marker: dashed halo + "B", advisory only
      const match = blankMatches?.[p.id];
      if (match) {
        const muted = keptIds.has(p.id) || p.rejected;
        ctx.setLineDash([lw * 2, lw * 2]);
        ctx.strokeStyle = blankColor;
        ctx.globalAlpha = muted ? 0.4 : 0.95;
        ctx.lineWidth = match.highConfidence && !muted ? lw * 2.5 : lw * 1.5;
        const pad = Math.max(3, lw * 4);
        ctx.strokeRect(p.bxPx - pad, p.byPx - pad, p.bwPx + pad * 2, p.bhPx + pad * 2);
        ctx.setLineDash([]);
        ctx.fillStyle = blankColor;
        ctx.fillText(
          `B${Math.round(match.similarity * 100)}`,
          p.bxPx + p.bwPx + pad,
          Math.max(12, p.byPx + p.bhPx + pad),
        );
        ctx.globalAlpha = 1;
      }

      if (p.id === selectedId) {
        ctx.setLineDash([]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = lw;
        ctx.strokeRect(p.bxPx - 4, p.byPx - 4, p.bwPx + 8, p.bhPx + 8);
        ctx.globalAlpha = 1;
      }
      if (showLabels) {
        ctx.fillStyle = color;
        ctx.fillText(String(p.id), p.bxPx, Math.max(12, p.byPx - 2));
      }
      ctx.restore();
    }
  }, [
    source,
    entry,
    mode,
    threshold,
    showOutlines,
    showLabels,
    particles,
    selectedId,
    blankMatches,
    keptIds,
  ]);

  const hitTest = (x: number, y: number): Particle | null => {
    let best: Particle | null = null;
    let bestArea = Infinity;
    for (const p of particles) {
      if (
        x >= p.bxPx - 3 &&
        x <= p.bxPx + p.bwPx + 3 &&
        y >= p.byPx - 3 &&
        y <= p.byPx + p.bhPx + 3 &&
        p.areaPx < bestArea
      ) {
        best = p;
        bestArea = p.areaPx;
      }
    }
    return best;
  };

  const stats = useMemo(() => {
    const accepted = particles.filter((p) => !p.rejected);
    return { total: particles.length, accepted: accepted.length };
  }, [particles]);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="mr-auto min-w-0">
          <p className="truncate font-mono text-xs text-foreground">
            {entry ? entry.name : "No image selected"}
          </p>
          <p className="label-caps">
            {entry
              ? `${entry.tissue} · ${stats.accepted}/${stats.total} accepted`
              : "run an analysis to review particles"}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border-strong">
          {(["fluorescence", "binary"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "fluorescence" ? "Original" : "Binary"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 label-caps cursor-pointer">
          <input
            type="checkbox"
            checked={showOutlines}
            onChange={(e) => setShowOutlines(e.target.checked)}
            className="accent-primary"
          />
          Outlines
        </label>
        <label className="flex items-center gap-1.5 label-caps cursor-pointer">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="accent-primary"
          />
          IDs
        </label>
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost px-2 py-1"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn-ghost px-2 py-1"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-3">
        {entry ? (
          <canvas
            ref={canvasRef}
            onClick={(e) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
              const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
              const hit = hitTest(x, y);
              onSelect(hit ? hit.id : null);
            }}
            onDoubleClick={(e) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
              const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
              const hit = hitTest(x, y);
              if (hit) onToggleReject(hit.id);
            }}
            style={{ width: `${zoom * 100}%`, imageRendering: "pixelated" }}
            className="cursor-crosshair rounded-md border border-border"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Upload micrographs and run the analysis to inspect outlines here.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border px-3 py-2">
        {Object.entries(MORPH_VAR).map(([name, v]) => (
          <span key={name} className="flex items-center gap-1.5 label-caps">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `var(${v})` }} />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 label-caps">
          <span className="h-2.5 w-2.5 rounded-sm bg-rejected" />
          rejected
        </span>
        <span className="flex items-center gap-1.5 label-caps">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-accent" />
          blank match (B%)
        </span>
        <span className="ml-auto label-caps">click = select · double-click = reject/restore</span>
      </div>
    </div>
  );
}
