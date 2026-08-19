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

const PAD_X = 28;
const PAD_Y = 20;
const FONT_SIZE = 26;
const SEP = "  |  ";

export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  return (stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "image");
}

function label(m: string): string {
  return m === "fibre" ? "Fibres" : m === "sphere" ? "Spheres" : m === "pellet" ? "Pellets" : "Fragments";
}

function truncateFilename(ctx: CanvasRenderingContext2D, name: string, maxWidth: number): string {
  if (ctx.measureText(name).width <= maxWidth) return name;
  let low = 0;
  let high = name.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = name.slice(0, mid) + "..." + name.slice(name.lastIndexOf(".") > mid ? name.lastIndexOf(".") : 0);
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const extIdx = name.lastIndexOf(".");
  const ext = extIdx > 0 ? name.slice(extIdx) : "";
  const stem = name.slice(0, Math.max(0, low - 1));
  return stem + "..." + ext;
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

  ctx.font = `${FONT_SIZE}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const summaryParts = [
    `Image: ${entry.name}`,
    `Total MPs: ${accepted.length}`,
    ...counts.map(([m, n]) => `${label(m)}: ${n}`),
  ];
  const fullSummary = summaryParts.join(SEP);
  const textWidth = ctx.measureText(fullSummary).width;
  const availableWidth = Math.max(imageData.width, textWidth + PAD_X * 2);

  const summaryHeight = PAD_Y * 2 + FONT_SIZE;
  canvas.width = availableWidth;
  canvas.height = imageData.height + summaryHeight;

  ctx.putImageData(imageData, 0, 0);

  // same outline geometry and colours as the reviewed viewer
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

  // single horizontal summary strip
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, imageData.height, canvas.width, summaryHeight);
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "middle";
  ctx.font = `${FONT_SIZE}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  const maxTextWidth = availableWidth - PAD_X * 2;
  const displayName = truncateFilename(ctx, entry.name, maxTextWidth / 3);
  const displayParts = [
    `Image: ${displayName}`,
    `Total MPs: ${accepted.length}`,
    ...counts.map(([m, n]) => `${label(m)}: ${n}`),
  ];
  const displaySummary = displayParts.join(SEP);
  const finalTextWidth = ctx.measureText(displaySummary).width;
  const x = finalTextWidth <= maxTextWidth ? PAD_X : Math.max(PAD_X, (availableWidth - finalTextWidth) / 2);
  const y = imageData.height + summaryHeight / 2;
  ctx.fillText(displaySummary, x, y);

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
