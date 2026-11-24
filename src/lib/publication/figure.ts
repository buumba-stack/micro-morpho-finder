/**
 * Publication figure export (display/export only). Builds SVG figures and
 * rasterises them to 300 dpi PNG. Reads existing result data only; never
 * touches analysis, stored data or library format.
 */
import { MICROFLUOR_SEMVER } from "@/lib/app-version";
import type { ImageEntry } from "@/lib/study-types";
import { downloadBlob } from "@/lib/export-images";

export const DPI = 300;
export type FigureWidthMm = 85 | 170;
export type FigureFormat = "svg" | "png";
export const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);
/** Point size → figure px at 300 dpi. */
export const pt = (n: number) => (n / 72) * DPI;
export const FONT = "Helvetica, Arial, sans-serif";

/** Okabe–Ito colour-blind-safe palette. */
export const OKABE_ITO = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"] as const;

export interface Figure { svg: string; width: number; height: number; widthMm: number; /** extra provenance lines, e.g. in-file enlargement */ notes?: [string, string][] }

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svgDoc(width: number, height: number, widthMm: number, body: string): Figure {
  const heightMm = (height / width) * widthMm;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthMm}mm" height="${heightMm.toFixed(2)}mm" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width, height, widthMm };
}

export function niceBar(umAcross: number): number {
  const target = umAcross / 4;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return steps.reduce((best, s) => (s <= target ? s : best), steps[0]!);
}

/** Scale bar (line + label) whose left edge is at x, top at y. */
export function scaleBarSvg(x: number, y: number, pxPerUm: number, um: number, color = "#222222"): string {
  const len = um * pxPerUm;
  const th = Math.max(2, pt(1.5));
  return `<rect x="${x}" y="${y}" width="${len}" height="${th}" fill="${color}"/><text x="${x}" y="${y + th + pt(7)}" font-size="${pt(7)}" text-anchor="start" fill="${color}">${um} µm</text>`;
}

type Src = CanvasImageSource & { width: number; height: number };

/**
 * Copies the native-pixel region (centred at cx,cy, cw×ch whole pixels) and
 * enlarges it with nearest-neighbour to outW×outH. Output is bounded by the
 * figure size (≤ 170 mm at 300 dpi), so no oversized canvas is created.
 */
export function nearestNeighbourDataUrl(src: Src, x0: number, y0: number, cw: number, ch: number, outW: number, outH: number): string {
  const small = document.createElement("canvas");
  small.width = cw; small.height = ch;
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingEnabled = false;
  const ix = Math.max(0, x0), iy = Math.max(0, y0);
  const ix2 = Math.min(src.width, x0 + cw), iy2 = Math.min(src.height, y0 + ch);
  if (ix2 > ix && iy2 > iy) sctx.drawImage(src, ix, iy, ix2 - ix, iy2 - iy, ix - x0, iy - y0, ix2 - ix, iy2 - iy);
  const big = document.createElement("canvas");
  big.width = Math.max(1, Math.round(outW)); big.height = Math.max(1, Math.round(outH));
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, big.width, big.height);
  return big.toDataURL("image/png");
}

// ---- PNG with 300 dpi pHYs chunk ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function withDpi(png: Uint8Array, dpi = DPI): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(13);
  const dv = new DataView(data.buffer);
  data.set([0x70, 0x48, 0x59, 0x73]); // "pHYs"
  dv.setUint32(4, ppm); dv.setUint32(8, ppm); data[12] = 1;
  const chunk = new Uint8Array(4 + 13 + 4);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9); chunk.set(data.subarray(0, 13), 4); cv.setUint32(17, crc32(data.subarray(0, 13)));
  const ihdrEnd = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd)); out.set(chunk, ihdrEnd); out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

async function rasterise(fig: Figure): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([fig.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Figure render failed")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = fig.width; c.height = fig.height;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png"));
    const bytes = withDpi(new Uint8Array(await blob.arrayBuffer()));
    return new Blob([bytes.slice().buffer], { type: "image/png" });
  } finally { URL.revokeObjectURL(url); }
}

export interface ProvenanceExtras {
  candidateId?: string | number | undefined;
  referenceId?: string | undefined;
  similarity?: number | undefined;
  featuresAgreeing?: string | undefined;
  displayFactor?: string | undefined;
  figure?: string | undefined;
}

/** Sidecar text from existing entry provenance only. */
export function provenanceText(entry: ImageEntry | undefined, x: ProvenanceExtras, fig: Figure, format: FigureFormat): string {
  const s = entry?.runSettings ?? entry?.settings;
  const na = (v: unknown) => (v === undefined || v === null || v === "" ? "n/a" : String(v));
  const lines: [string, unknown][] = [
    ["MicroFluor version", MICROFLUOR_SEMVER],
    ["Figure", x.figure],
    ["Format", `${format.toUpperCase()}${format === "png" ? ` (${DPI} dpi)` : ""}`],
    ["Width", `${fig.widthMm} mm (${fig.width} px at ${DPI} dpi)`],
    ["Image file name", entry?.name],
    ["Image SHA-256", entry?.imageHash],
    ["µm per pixel", s?.umPerPx],
    ["Threshold", s?.threshold],
    ["Min area (µm²)", s?.minArea],
    ["Max area (µm²)", s && Number.isFinite(s.maxArea) ? s.maxArea : s ? "unlimited" : undefined],
    ["Circularity", s ? `${s.minCircularity}–${s.maxCircularity}` : undefined],
    ["Exclude on edges", s?.excludeEdges],
    ["Analysis run ID", entry?.run?.analysis_run_id],
    ["Candidate ID", x.candidateId],
    ["Matched reference ID", x.referenceId],
    ["Similarity score", x.similarity !== undefined ? `${Math.round(x.similarity * 100)}%` : undefined],
    ["Features agreeing", x.featuresAgreeing],
    ["Display factor", x.displayFactor],
    ...(fig.notes ?? []),
    ["Exported at", new Date().toISOString()],
  ];
  return lines.map(([k, v]) => `${k}: ${na(v)}`).join("\n") + "\n";
}

export const safeName = (s: string) => s.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);

export async function exportFigure(fig: Figure, format: FigureFormat, baseName: string, sidecar: string) {
  const name = `${safeName(baseName)}_${fig.widthMm}mm`;
  const blob = format === "svg" ? new Blob([fig.svg], { type: "image/svg+xml" }) : await rasterise(fig);
  downloadBlob(`${name}.${format}`, blob);
  await new Promise((r) => setTimeout(r, 300));
  downloadBlob(`${name}.txt`, new Blob([sidecar], { type: "text/plain;charset=utf-8" }));
}
