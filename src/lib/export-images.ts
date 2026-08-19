/**
 * Final accepted-image export.
 *
 * Purely presentational: it consumes the already-committed analysis result of
 * an image (particles, their morphology and their accepted/rejected state) and
 * paints the original micrograph plus the accepted outlines onto an export
 * canvas, with a small count summary underneath. No segmentation, measurement,
 * classification, matching, network or AI work happens here.
 */

import { decodeToImageData, MORPHOLOGIES, type Morphology } from "./particle-analysis";
import { morphologyColor } from "./morphology-colors";
import type { ImageEntry } from "./study-types";

const FONT_STACK = 'Helvetica, Arial, sans-serif';
const SEP = "   |   ";

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  return (stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "image");
}

function label(m: string): string {
  return m === "fibre" ? "Fibres" : m === "sphere" ? "Spheres" : m === "pellet" ? "Pellets" : "Fragments";
}

/** Shortens only the filename stem, keeping the extension, until it fits. */
function fitFilename(ctx: CanvasRenderingContext2D, name: string, budget: number): string {
  if (ctx.measureText(name).width <= budget) return name;
  const extIdx = name.lastIndexOf(".");
  const ext = extIdx > 0 ? name.slice(extIdx) : "";
  const stem = extIdx > 0 ? name.slice(0, extIdx) : name;
  for (let keep = stem.length - 1; keep > 0; keep--) {
    const candidate = `${stem.slice(0, keep)}...${ext}`;
    if (ctx.measureText(candidate).width <= budget) return candidate;
  }
  return `...${ext}`;
}

/** Renders one final PNG for an analysed image. Returns null when unavailable. */
export async function renderFinalAcceptedImage(entry: ImageEntry): Promise<Blob | null> {
  const analysis = entry.analysis;
  if (!analysis) return null;

  const { imageData } = await decodeToImageData(entry.file);
  const accepted = analysis.particles.filter((p) => p.rejected !== true);
  const counts = MORPHOLOGIES.map(
    (m) => [m, accepted.filter((p) => p.morphology === (m as Morphology)).length] as const,
  );

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // typography scales with the micrograph so the footer stays readable at any resolution
  const footerFont = Math.round(clamp(imageData.width * 0.02, 24, 34));
  const padX = Math.round(footerFont * 1.4);
  const padY = Math.round(footerFont * 0.8);
  const footerHeight = padY * 2 + Math.round(footerFont * 1.2);
  const numberFont = Math.round(clamp(imageData.width * 0.015, 16, 26));

  const countParts = [
    `Total MPs: ${accepted.length}`,
    ...counts.map(([m, n]) => `${label(m)}: ${n}`),
  ];

  ctx.font = `500 ${footerFont}px ${FONT_STACK}`;
  const countsText = countParts.join(SEP);
  const countsWidth = ctx.measureText(countsText).width;
  const prefixWidth = ctx.measureText(`Image: `).width + ctx.measureText(SEP).width;
  const fullWidth = prefixWidth + ctx.measureText(entry.name).width + countsWidth;
  const canvasWidth = Math.max(imageData.width, Math.min(fullWidth + padX * 2, imageData.width));

  canvas.width = canvasWidth;
  canvas.height = imageData.height + footerHeight;

  // original micrograph pixels, untouched
  ctx.putImageData(imageData, 0, 0);

  // accepted-particle outlines, same geometry and colours as the reviewed viewer
  const lw = Math.max(1, Math.round(Math.max(imageData.width, imageData.height) / 700));
  ctx.lineJoin = "round";
  ctx.lineWidth = lw * 1.5;
  for (const p of accepted) {
    ctx.strokeStyle = morphologyColor(p.morphology);
    ctx.beginPath();
    const o = p.outline;
    ctx.moveTo(o[0]! + 0.5, o[1]! + 0.5);
    for (let i = 2; i < o.length; i += 2) ctx.lineTo(o[i]! + 0.5, o[i + 1]! + 0.5);
    ctx.closePath();
    ctx.stroke();
  }

  // accepted-particle numbers, placed just outside the bounding box with a dark halo
  ctx.font = `500 ${numberFont}px ${FONT_STACK}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, numberFont / 6);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffffff";
  for (const p of accepted) {
    const text = String(p.id);
    const w = ctx.measureText(text).width;
    let x = p.bxPx + p.bwPx + Math.round(numberFont * 0.25);
    let y = p.byPx - Math.round(numberFont * 0.25);
    if (x + w > imageData.width - 2) x = Math.max(2, p.bxPx - w - Math.round(numberFont * 0.25));
    if (y - numberFont < 2) y = Math.min(imageData.height - 2, p.byPx + p.bhPx + numberFont);
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  // clean white horizontal information strip
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, imageData.height, canvas.width, footerHeight);
  ctx.fillStyle = "#d4d4d4";
  ctx.fillRect(0, imageData.height, canvas.width, Math.max(1, Math.round(lw)));

  ctx.font = `500 ${footerFont}px ${FONT_STACK}`;
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const budget = canvas.width - padX * 2;
  const nameBudget = Math.max(footerFont * 3, budget - countsWidth - prefixWidth);
  const displayName = fitFilename(ctx, entry.name, nameBudget);
  const line = `Image: ${displayName}${SEP}${countsText}`;
  const lineWidth = ctx.measureText(line).width;
  const x = lineWidth <= budget ? padX : Math.max(padX, (canvas.width - lineWidth) / 2);
  ctx.fillText(line, x, imageData.height + footerHeight / 2);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exports one PNG per analysed image. Returns how many files were written. */
export async function exportFinalAcceptedImages(entries: ImageEntry[]): Promise<number> {
  let n = 0;
  for (const entry of entries) {
    if (!entry.analysis) continue;
    const blob = await renderFinalAcceptedImage(entry);
    if (!blob) continue;
    downloadBlob(`${safeFileStem(entry.name)}_MicroFluor_final.png`, blob);
    n += 1;
    // let the browser/Electron process each save before queuing the next
    await new Promise((r) => setTimeout(r, 150));
  }
  return n;
}
