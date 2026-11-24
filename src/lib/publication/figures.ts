/** Figure builders for publication export. Display/export only. */
import type { ImageEntry } from "@/lib/study-types";
import { MORPHOLOGIES } from "@/lib/particle-analysis";
import {
  esc, mmToPx, nearestNeighbourDataUrl, niceBar, OKABE_ITO, pt, scaleBarSvg, svgDoc,
  type Figure, type FigureWidthMm,
} from "./figure";

type Src = CanvasImageSource & { width: number; height: number };

export interface PairImage {
  src: Src;
  cx: number; cy: number;
  /** field size in this source's own pixels */
  sw: number; sh: number;
  outline?: ArrayLike<number> | null | undefined;
}

const OUTLINE = "rgba(255,90,90,0.9)";

function placeImage(img: PairImage, x: number, y: number, boxW: number, boxH: number, clipId: string) {
  const cw = Math.max(1, Math.ceil(img.sw)), ch = Math.max(1, Math.ceil(img.sh));
  const x0 = img.cx - cw / 2, y0 = img.cy - ch / 2;
  const k = boxW / img.sw; // figure px per native px (identical per µm for both images)
  // Pre-enlarged to its final size at 300 dpi; embedded 1:1 (no SVG scaling).
  const dw = Math.max(1, Math.round(cw * k)), dh = Math.max(1, Math.round(ch * k));
  const ox = Math.round(x + (boxW - dw) / 2), oy = Math.round(y + (boxH - dh) / 2);
  const url = nearestNeighbourDataUrl(img.src, x0, y0, cw, ch, dw, dh);
  let out = `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${boxW}" height="${boxH}"/></clipPath><g clip-path="url(#${clipId})"><image x="${ox}" y="${oy}" width="${dw}" height="${dh}" preserveAspectRatio="none" image-rendering="pixelated" style="image-rendering:pixelated" xlink:href="${url}"/>`;
  const o = img.outline;
  if (o && o.length >= 4) {
    let d = "";
    for (let i = 0; i < o.length; i += 2) d += `${i ? "L" : "M"}${(ox + (o[i]! + 0.5 - x0) * (dw / cw)).toFixed(2)} ${(oy + (o[i + 1]! + 0.5 - y0) * (dh / ch)).toFixed(2)}`;
    out += `<path d="${d}Z" fill="none" stroke="${OUTLINE}" stroke-width="${Math.max(pt(0.75), k * 0.6).toFixed(2)}" stroke-linejoin="round"/>`;
  }
  return { svg: out + `</g><rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="none" stroke="#999999" stroke-width="${pt(0.4)}"/>`, note: `${fx(dw / cw)}× (${cw} × ${ch} native px → ${dw} × ${dh} px at 300 dpi, nearest-neighbour)` };
}

const fx = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Candidate/reference pair at the same physical scale and field of view. */
export function matchPairFigure(opts: {
  widthMm: FigureWidthMm; fieldUm: { w: number; h: number };
  candidate: PairImage; reference: PairImage | null;
  scoreLine?: string | undefined;
}): Figure {
  const W = mmToPx(opts.widthMm);
  const m = pt(6), gap = pt(8);
  const boxW = (W - 2 * m - gap) / 2;
  const boxH = boxW * (opts.fieldUm.h / opts.fieldUm.w);
  const pxPerUm = boxW / opts.fieldUm.w;
  const bar = niceBar(Math.max(opts.fieldUm.w, opts.fieldUm.h));
  const top = m + pt(9);
  let body = "";
  const notes: [string, string][] = [];
  const cols: [string, PairImage | null][] = [["Candidate", opts.candidate], ["Reference", opts.reference]];
  cols.forEach(([label, img], i) => {
    const x = m + i * (boxW + gap);
    body += `<text x="${x}" y="${m + pt(7)}" font-size="${pt(8)}" font-weight="bold" fill="#222222">${label}</text>`;
    const placed = img ? placeImage(img, x, top, boxW, boxH, `clip${i}`) : null;
    if (placed) notes.push([`${label} enlargement in file`, placed.note]);
    body += placed ? placed.svg : `<rect x="${x}" y="${top}" width="${boxW}" height="${boxH}" fill="#f2f2f2"/><text x="${x + boxW / 2}" y="${top + boxH / 2}" font-size="${pt(7)}" text-anchor="middle" fill="#666666">No image stored</text>`;
    body += scaleBarSvg(x, top + boxH + pt(4), pxPerUm, bar);
  });
  let h = top + boxH + pt(4) + pt(11);
  if (opts.scoreLine) {
    h += pt(3);
    body += `<text x="${W / 2}" y="${h + pt(8)}" font-size="${pt(8)}" text-anchor="middle" fill="#222222">${esc(opts.scoreLine)}</text>`;
    h += pt(10);
  }
  return { ...svgDoc(W, Math.ceil(h + m), opts.widthMm, body), notes };
}

/** Current viewer image (as drawn, with outlines) plus legend and scale bar. */
export function viewerFigure(opts: {
  widthMm: FigureWidthMm; canvas: HTMLCanvasElement; umPerPx: number;
  legend: { label: string; color: string; dash?: string }[];
}): Figure {
  const W = mmToPx(opts.widthMm);
  const m = pt(6);
  const iw = W - 2 * m;
  const cwPx = opts.canvas.width, chPx = opts.canvas.height;
  const ow = Math.round(iw), oh = Math.max(1, Math.round(iw * (chPx / cwPx)));
  const ih = oh;
  // Resampled once with nearest-neighbour to its final 300 dpi size; embedded 1:1.
  const url = ow === cwPx && oh === chPx ? opts.canvas.toDataURL("image/png") : nearestNeighbourDataUrl(opts.canvas, 0, 0, cwPx, chPx, ow, oh);
  const resample = ow === cwPx ? `not resampled (${cwPx} px)` : `resampled from ${cwPx} × ${chPx} px to ${ow} × ${oh} px (${fx(ow / cwPx)}×), nearest-neighbour`;
  let body = `<image x="${m}" y="${m}" width="${ow}" height="${oh}" preserveAspectRatio="none" image-rendering="pixelated" style="image-rendering:pixelated" xlink:href="${url}"/>`;
  const pxPerUm = ow / (opts.canvas.width * opts.umPerPx);
  const y = m + ih + pt(4);
  if (opts.umPerPx > 0) body += scaleBarSvg(m, y, pxPerUm, niceBar(opts.canvas.width * opts.umPerPx));
  // legend, right aligned row(s)
  let lx = m + iw * 0.3, ly = y + pt(4);
  for (const l of opts.legend) {
    const w = pt(14) + l.label.length * pt(4.2);
    if (lx + w > W - m) { lx = m + iw * 0.3; ly += pt(10); }
    body += `<line x1="${lx}" y1="${ly}" x2="${lx + pt(10)}" y2="${ly}" stroke="${l.color}" stroke-width="${pt(2)}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ""}/><text x="${lx + pt(12)}" y="${ly + pt(2.5)}" font-size="${pt(7)}" fill="#222222">${esc(l.label)}</text>`;
    lx += w;
  }
  return { ...svgDoc(W, Math.ceil(Math.max(ly, y + pt(10)) + pt(6) + m), opts.widthMm, body), notes: [["Micrograph in file", resample]] };
}

// ---------------- Results charts (per sample) ----------------

export const ecd = (areaUm2: number) => 2 * Math.sqrt(areaUm2 / Math.PI);

export function sampleStats(entry: ImageEntry) {
  const ps = entry.analysis?.particles ?? [];
  const accepted = ps.filter((p) => !p.rejected);
  const screenedOut = ps.filter((p) => p.rejected && (entry.blankMatches?.[p.id] || entry.contaminantMatches?.[p.id])).length;
  return {
    composition: MORPHOLOGIES.map((m) => ({ label: m, n: accepted.filter((p) => p.morphology === m).length })),
    ecds: accepted.map((p) => ecd(p.area)),
    funnel: [
      { label: "Fluorescent candidates", n: ps.length },
      { label: "After blank/contaminant screening", n: ps.length - screenedOut },
      { label: "Accepted", n: accepted.length },
    ],
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const AXIS = "#333333";

function frame(W: number, title: string) {
  return `<text x="${pt(6)}" y="${pt(12)}" font-size="${pt(8)}" font-weight="bold" fill="#222222">${esc(title)}</text>`;
}

function barChart(widthMm: FigureWidthMm, title: string, bars: { label: string; n: number; color: string }[], xLabel: string, yLabel = "Count"): Figure {
  const W = mmToPx(widthMm);
  const H = Math.round(W * (widthMm === 85 ? 0.7 : 0.45));
  const L = pt(30), R = pt(6), T = pt(20), B = pt(28);
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(1, ...bars.map((b) => b.n));
  const step = niceStep(max / 5);
  const top = Math.ceil(max / step) * step;
  let body = frame(W, title);
  for (let v = 0; v <= top; v += step) {
    const y = T + ph - (v / top) * ph;
    body += `<line x1="${L - pt(2)}" y1="${y}" x2="${L}" y2="${y}" stroke="${AXIS}" stroke-width="${pt(0.5)}"/><text x="${L - pt(3)}" y="${y + pt(2.5)}" font-size="${pt(6.5)}" text-anchor="end" fill="${AXIS}">${v}</text>`;
  }
  const bw = pw / bars.length;
  bars.forEach((b, i) => {
    const h = (b.n / top) * ph;
    const x = L + i * bw + bw * 0.12;
    body += `<rect x="${x}" y="${T + ph - h}" width="${bw * 0.76}" height="${h}" fill="${b.color}"/>`;
    body += `<text x="${x + bw * 0.38}" y="${T + ph - h - pt(2)}" font-size="${pt(6.5)}" text-anchor="middle" fill="#222222">${b.n}</text>`;
    body += `<text x="${L + i * bw + bw / 2}" y="${T + ph + pt(8)}" font-size="${pt(6.5)}" text-anchor="middle" fill="${AXIS}">${esc(b.label)}</text>`;
  });
  body += `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${AXIS}" stroke-width="${pt(0.6)}"/><line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${AXIS}" stroke-width="${pt(0.6)}"/>`;
  body += `<text x="${L + pw / 2}" y="${H - pt(6)}" font-size="${pt(7)}" text-anchor="middle" fill="${AXIS}">${esc(xLabel)}</text>`;
  body += `<text transform="translate(${pt(9)} ${T + ph / 2}) rotate(-90)" font-size="${pt(7)}" text-anchor="middle" fill="${AXIS}">${esc(yLabel)}</text>`;
  return svgDoc(W, H, widthMm, body);
}

function niceStep(x: number) {
  if (x <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function compositionFigure(entry: ImageEntry, widthMm: FigureWidthMm): Figure {
  const s = sampleStats(entry);
  return barChart(widthMm, "Class composition (accepted)", s.composition.map((c, i) => ({ label: cap(c.label), n: c.n, color: OKABE_ITO[[0, 1, 2, 5][i] ?? i]! })), "Morphology class");
}

export function sizeFigure(entry: ImageEntry, widthMm: FigureWidthMm): Figure {
  const { ecds } = sampleStats(entry);
  const max = Math.max(1, ...ecds);
  const w = niceStep(max / 8);
  const nb = Math.max(1, Math.ceil(max / w + 1e-9));
  const counts = new Array<number>(nb).fill(0);
  for (const d of ecds) counts[Math.min(nb - 1, Math.floor(d / w))]! ++;
  return barChart(widthMm, "Size distribution (accepted)", counts.map((n, i) => ({ label: `${i * w}–${(i + 1) * w}`, n, color: OKABE_ITO[4] })), "Equivalent circular diameter (µm)");
}

export function funnelFigure(entry: ImageEntry, widthMm: FigureWidthMm): Figure {
  const { funnel } = sampleStats(entry);
  const W = mmToPx(widthMm);
  const L = pt(6), T = pt(20), rowH = pt(16);
  const H = Math.ceil(T + funnel.length * rowH + pt(8));
  const max = Math.max(1, funnel[0]!.n);
  const labelW = Math.max(...funnel.map((f) => f.label.length)) * pt(7) * 0.55 + pt(6);
  const pw = W - L - labelW - pt(20);
  let body = frame(W, "Candidate screening");
  const colors = [OKABE_ITO[1], OKABE_ITO[0], OKABE_ITO[2]];
  funnel.forEach((f, i) => {
    const y = T + i * rowH;
    const bw = (f.n / max) * pw;
    body += `<text x="${L}" y="${y + rowH * 0.6}" font-size="${pt(7)}" fill="#222222">${esc(f.label)}</text>`;
    body += `<rect x="${L + labelW}" y="${y + rowH * 0.15}" width="${Math.max(0, bw)}" height="${rowH * 0.65}" fill="${colors[i]}"/>`;
    body += `<text x="${L + labelW + bw + pt(3)}" y="${y + rowH * 0.6}" font-size="${pt(7)}" fill="#222222">${f.n}</text>`;
  });
  return svgDoc(W, H, widthMm, body);
}
