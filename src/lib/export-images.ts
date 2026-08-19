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

const PAD = 12;
const LINE = 18;

export function safeFileStem(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  return (stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "image");
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

  const summaryHeight = PAD * 2 + LINE * 5;
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height + summaryHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

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

  // count summary
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, imageData.height, canvas.width, summaryHeight);
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  ctx.font = '13px "JetBrains Mono", monospace';
  let y = imageData.height + PAD;
  const lines = [
    `Image: ${entry.name}`,
    `Total MPs: ${accepted.length}`,
    ...counts.map(([m, n]) => `${label(m)}: ${n}`),
  ];
  for (const line of lines) {
    ctx.fillText(line, PAD, y);
    y += LINE;
  }

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

function label(m: string): string {
  return m === "fibre" ? "Fibres" : m === "sphere" ? "Spheres" : m === "pellet" ? "Pellets" : "Fragments";
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
