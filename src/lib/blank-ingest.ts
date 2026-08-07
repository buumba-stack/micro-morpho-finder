/**
 * Browser-side ingestion of a procedural-blank image: runs the same
 * deterministic detector used for samples, then derives appearance features and
 * crops for every detected object so the user can annotate them.
 */

import {
  analyzeImageData,
  decodeToImageData,
  type AnalysisSettings,
  type Particle,
} from "@/lib/particle-analysis";
import type { AppearanceFeatures, BlankCandidate, BlankMetadata } from "@/lib/blank-library";

export async function hashFile(file: Blob): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return `size-${file.size}`;
  }
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max };
}

/**
 * Appearance descriptor from the calibrated measurements plus the pixels inside
 * the object's bounding box. The interior mask is re-derived from the threshold,
 * which matches the detector's own segmentation.
 */
export function extractFeatures(
  imageData: ImageData,
  particle: Particle,
  threshold: number,
): AppearanceFeatures {
  const { width: w, height: h, data } = imageData;
  const x0 = Math.max(0, particle.bxPx);
  const y0 = Math.max(0, particle.byPx);
  const x1 = Math.min(w - 1, particle.bxPx + particle.bwPx - 1);
  const y1 = Math.min(h - 1, particle.byPx + particle.bhPx - 1);
  const pad = Math.max(3, Math.round(Math.max(particle.bwPx, particle.bhPx) * 0.5));

  let inSum = 0;
  let inSumSq = 0;
  let inN = 0;
  let hx = 0;
  let hy = 0;
  let satSum = 0;
  let bgSum = 0;
  let bgN = 0;

  for (let y = Math.max(0, y0 - pad); y <= Math.min(h - 1, y1 + pad); y++) {
    for (let x = Math.max(0, x0 - pad); x <= Math.min(w - 1, x1 + pad); x++) {
      const p = (y * w + x) * 4;
      const r = data[p]!;
      const g = data[p + 1]!;
      const b = data[p + 2]!;
      const gray = (r + g + b) / 3;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1 && gray >= threshold;
      if (inside) {
        inSum += gray;
        inSumSq += gray * gray;
        inN++;
        const { h: hue, s } = rgbToHsv(r, g, b);
        const rad = (hue * Math.PI) / 180;
        hx += Math.cos(rad);
        hy += Math.sin(rad);
        satSum += s;
      } else if (gray < threshold) {
        bgSum += gray;
        bgN++;
      }
    }
  }

  const meanIntensity = inN ? inSum / inN : 0;
  const variance = inN ? Math.max(0, inSumSq / inN - meanIntensity * meanIntensity) : 0;
  const background = bgN ? bgSum / bgN : 0;
  let hue = inN ? (Math.atan2(hy, hx) * 180) / Math.PI : 0;
  if (hue < 0) hue += 360;

  const bboxArea = particle.bwPx * particle.bhPx;
  const solidity = bboxArea > 0 ? Math.min(1, particle.areaPx / bboxArea) : 0;
  const elongation = particle.minFeret > 0 ? particle.feret / particle.minFeret : 1;

  return {
    logArea: Math.log10(Math.max(1e-6, particle.area)),
    elongation,
    circularity: particle.circularity,
    solidity,
    meanIntensity,
    contrast: meanIntensity - background,
    hue,
    saturation: inN ? satSum / inN : 0,
    intensitySd: Math.sqrt(variance),
  };
}

function renderCrop(
  src: HTMLCanvasElement,
  particle: Particle,
  imageData: ImageData,
  contextFactor: number,
  maxSide: number,
  drawOutline: boolean,
): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const box = Math.max(particle.bwPx, particle.bhPx);
  const pad =
    contextFactor <= 1
      ? Math.max(4, Math.round(box * 0.25))
      : Math.max(8, Math.round((box * (contextFactor - 1)) / 2));

  const x = Math.max(0, Math.round(particle.bxPx) - pad);
  const y = Math.max(0, Math.round(particle.byPx) - pad);
  const w = Math.min(imageData.width - x, Math.round(particle.bwPx) + pad * 2);
  const h = Math.min(imageData.height - y, Math.round(particle.bhPx) + pad * 2);
  if (w <= 0 || h <= 0) return "";

  const scale = Math.min(4, Math.max(1, maxSide / Math.max(w, h)));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x, y, w, h, 0, 0, canvas.width, canvas.height);

  const o = particle.outline;
  if (drawOutline && o.length >= 4) {
    ctx.beginPath();
    ctx.moveTo((o[0]! - x) * scale, (o[1]! - y) * scale);
    for (let i = 2; i < o.length; i += 2) ctx.lineTo((o[i]! - x) * scale, (o[i + 1]! - y) * scale);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,90,90,0.9)";
    ctx.lineWidth = Math.max(1, scale * 0.6);
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

export interface IngestResult {
  width: number;
  height: number;
  fileHash: string;
  candidates: BlankCandidate[];
  detected: number;
}

/**
 * Detects objects in a blank image and returns annotatable candidates.
 * Border-touching objects are kept here — a blank artefact clipped by the frame
 * is still a valid reference — so `excludeEdges` is forced off.
 */
export async function ingestBlankImage(
  file: File,
  metadata: BlankMetadata,
  baseSettings: AnalysisSettings,
  options: { maxCandidates?: number } = {},
): Promise<IngestResult> {
  const maxCandidates = options.maxCandidates ?? 60;
  const { imageData } = await decodeToImageData(file);
  const settings: AnalysisSettings = {
    ...baseSettings,
    umPerPx: metadata.umPerPx,
    threshold: metadata.threshold,
    excludeEdges: false,
  };
  const analysis = analyzeImageData(imageData, settings);
  const fileHash = await hashFile(file);

  const src = document.createElement("canvas");
  src.width = imageData.width;
  src.height = imageData.height;
  src.getContext("2d")?.putImageData(imageData, 0, 0);

  const ordered = [...analysis.particles].sort((a, b) => b.area - a.area).slice(0, maxCandidates);
  const candidates: BlankCandidate[] = ordered.map((p) => ({
    id: `${fileHash.slice(0, 8)}-${p.id}`,
    particleId: p.id,
    annotation: "unresolved",
    features: extractFeatures(imageData, p, settings.threshold),
    crop: renderCrop(src, p, imageData, 1, 200, true),
    contextCrop: renderCrop(src, p, imageData, 4, 240, false),
    area: p.area,
    perimeter: p.perimeter,
    feret: p.feret,
    minFeret: p.minFeret,
    aspectRatio: p.aspectRatio,
    circularity: p.circularity,
    touchesBorder: p.touchesBorder,
    note: "",
  }));

  return {
    width: analysis.width,
    height: analysis.height,
    fileHash,
    candidates,
    detected: analysis.particles.length,
  };
}
