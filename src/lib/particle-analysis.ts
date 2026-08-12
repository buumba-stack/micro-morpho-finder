/**
 * Fluorescence micrograph particle analysis.
 *
 * Reimplements the ImageJ 1.54f workflow described in the study protocol:
 *   8-bit grayscale -> fixed threshold -> binary -> Analyze Particles
 * with Area, Perimeter, Shape Descriptors, Feret's Diameter and Bounding
 * Rectangle recorded per accepted particle.
 */

export type Morphology = "fibre" | "sphere" | "pellet" | "fragment";

export interface Particle {
  id: number;
  /** raw pixel count */
  areaPx: number;
  /** calibrated area (unit^2) */
  area: number;
  /** traced boundary length (unit) */
  perimeter: number;
  /** bounding rectangle, calibrated */
  bx: number;
  by: number;
  width: number;
  height: number;
  /** bounding rectangle in pixels (for overlay drawing) */
  bxPx: number;
  byPx: number;
  bwPx: number;
  bhPx: number;
  feret: number;
  minFeret: number;
  feretAngle: number;
  aspectRatio: number;
  circularity: number;
  cxPx: number;
  cyPx: number;
  morphology: Morphology;
  touchesBorder: boolean;
  /** closed outline in pixel coords, flattened [x0,y0,x1,y1,...] */
  outline: Int16Array;
  /** user rejection during visual QC */
  rejected: boolean;
}

export interface AnalysisSettings {
  /** micrometres per pixel */
  umPerPx: number;
  /** fixed grayscale threshold (0-255); pixels >= threshold are particle */
  threshold: number;
  /** ImageJ "Size" filter, calibrated units^2 */
  minArea: number;
  maxArea: number;
  /** ImageJ "Circularity" filter */
  minCircularity: number;
  maxCircularity: number;
  /** ImageJ "Exclude on edges" */
  excludeEdges: boolean;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  umPerPx: 1,
  threshold: 100,
  minArea: 5,
  maxArea: Infinity,
  minCircularity: 0,
  maxCircularity: 1,
  excludeEdges: true,
};

export interface ImageAnalysis {
  width: number;
  height: number;
  particles: Particle[];
  /** particles dropped by the automatic exclusion rules */
  excludedEdge: number;
  excludedSize: number;
  excludedCircularity: number;
}

export const MORPHOLOGIES: Morphology[] = ["fibre", "sphere", "pellet", "fragment"];

export function classifyMorphology(
  aspectRatio: number,
  circularity: number,
  feret: number,
  minFeret: number,
): Morphology {
  if (aspectRatio <= 0.33 || aspectRatio >= 3) {
    return "fibre";
  }
  if (circularity > 0.90) {
    return "sphere";
  }
  const feretRatio =
    feret > 0 && minFeret > 0
      ? minFeret / feret
      : 0;
  const nearSquareBoundingBox =
    aspectRatio >= 0.85 &&
    aspectRatio <= 1.18;
  const nearEqualFeretDiameters =
    feretRatio >= 0.85;
  if (
    circularity > 0.60 &&
    nearSquareBoundingBox &&
    nearEqualFeretDiameters
  ) {
    return "sphere";
  }
  if (circularity > 0.60) {
    return "pellet";
  }
  return "fragment";
}


/** ImageJ's unweighted RGB -> 8-bit conversion. */
function toGray(data: Uint8ClampedArray, n: number): Uint8Array {
  const gray = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = (data[p]! + data[p + 1]! + data[p + 2]!) / 3;
  }
  return gray;
}

/** Otsu threshold, used only to seed the manual slider. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!] = hist[gray[i]!]! + 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/**
 * Morphology-only helper: pixel area of the hole-filled silhouette of one
 * connected component. Works on a TEMPORARY copy; the label/binary data and
 * every reported measurement stay untouched.
 */
function filledAreaPx(
  labels: Int32Array,
  w: number,
  h: number,
  label: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  areaPx: number,
): number {
  const x0 = minX - 1;
  const y0 = minY - 1;
  const bw = maxX - minX + 3;
  const bh = maxY - minY + 3;
  const seen = new Uint8Array(bw * bh);
  const stack: number[] = [0];
  seen[0] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const lx = p % bw;
    const ly = (p - lx) / bw;
    const steps = [
      [lx + 1, ly],
      [lx - 1, ly],
      [lx, ly + 1],
      [lx, ly - 1],
    ] as const;
    for (const [nx, ny] of steps) {
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const li = ny * bw + nx;
      if (seen[li]) continue;
      const gx = x0 + nx;
      const gy = y0 + ny;
      const inside = gx >= 0 && gy >= 0 && gx < w && gy < h;
      if (inside && labels[gy * w + gx] === label) continue;
      seen[li] = 1;
      stack.push(li);
    }
  }
  let holes = 0;
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      if (seen[ly * bw + lx]) continue;
      const gx = x0 + lx;
      const gy = y0 + ly;
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
      if (labels[gy * w + gx] !== label) holes++;
    }
  }
  return areaPx + holes;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Moore-neighbour boundary tracing (8-connected, clockwise). */
function traceOutline(
  labels: Int32Array,
  w: number,
  h: number,
  label: number,
  sx: number,
  sy: number,
): number[] {
  const pts: number[] = [];
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label;

  let cx = sx;
  let cy = sy;
  let search = 5; // start looking from NW of the top-left seed pixel
  const limit = 8 * (w + h) + 16;
  let firstDir = -1;
  let steps = 0;

  while (steps++ < limit) {
    pts.push(cx, cy);
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const d = (search + k) % 8;
      const nx = cx + DIRS[d]![0];
      const ny = cy + DIRS[d]![1];
      if (at(nx, ny)) {
        if (firstDir < 0) firstDir = d;
        cx = nx;
        cy = ny;
        search = (d + 6) % 8;
        moved = true;
        break;
      }
    }
    if (!moved) break; // isolated single pixel
    if (cx === sx && cy === sy) break;
  }
  return pts;
}

function convexHull(pts: number[]): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts.slice();
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const dx = pts[2 * a]! - pts[2 * b]!;
    return dx !== 0 ? dx : pts[2 * a + 1]! - pts[2 * b + 1]!;
  });
  const cross = (o: number, a: number, b: number) =>
    (pts[2 * a]! - pts[2 * o]!) * (pts[2 * b + 1]! - pts[2 * o + 1]!) -
    (pts[2 * a + 1]! - pts[2 * o + 1]!) * (pts[2 * b]! - pts[2 * o]!);

  const build = (order: number[]) => {
    const st: number[] = [];
    for (const i of order) {
      while (st.length >= 2 && cross(st[st.length - 2]!, st[st.length - 1]!, i) <= 0) st.pop();
      st.push(i);
    }
    return st;
  };
  const lower = build(idx);
  const upper = build(idx.slice().reverse());
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const out: number[] = [];
  for (const i of hull) out.push(pts[2 * i]!, pts[2 * i + 1]!);
  return out;
}

function feretMetrics(hull: number[]): { max: number; min: number; angle: number } {
  const n = hull.length / 2;
  if (n === 0) return { max: 0, min: 0, angle: 0 };
  if (n === 1) return { max: 1, min: 1, angle: 0 };

  let max = 0;
  let angle = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = hull[2 * j]! - hull[2 * i]!;
      const dy = hull[2 * j + 1]! - hull[2 * i + 1]!;
      const d = Math.hypot(dx, dy);
      if (d > max) {
        max = d;
        angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
      }
    }
  }
  // rotating calipers: min width over hull edges
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = hull[2 * j]! - hull[2 * i]!;
    const ey = hull[2 * j + 1]! - hull[2 * i + 1]!;
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    let far = 0;
    for (let k = 0; k < n; k++) {
      const px = hull[2 * k]! - hull[2 * i]!;
      const py = hull[2 * k + 1]! - hull[2 * i + 1]!;
      far = Math.max(far, Math.abs((px * ey - py * ex) / len));
    }
    min = Math.min(min, far);
  }
  if (!Number.isFinite(min)) min = max;
  if (angle < 0) angle += 180;
  return { max: max + 1, min: min + 1, angle };
}

export function analyzeImageData(
  imageData: ImageData,
  settings: AnalysisSettings,
): ImageAnalysis {
  const { width: w, height: h, data } = imageData;
  const n = w * h;
  const gray = toGray(data, n);
  const scale = settings.umPerPx;

  const labels = new Int32Array(n).fill(0);
  const stack = new Int32Array(n);
  const particles: Particle[] = [];
  let excludedEdge = 0;
  let excludedSize = 0;
  let excludedCircularity = 0;
  let label = 0;
  let nextId = 1;

  for (let seed = 0; seed < n; seed++) {
    if (labels[seed] !== 0 || gray[seed]! < settings.threshold) continue;
    label++;
    let sp = 0;
    stack[sp++] = seed;
    labels[seed] = label;

    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    let touchesBorder = false;

    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w;
      const y = (p - x) / w;
      count++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          const q = ny * w + nx;
          if (labels[q] === 0 && gray[q]! >= settings.threshold) {
            labels[q] = label;
            stack[sp++] = q;
          }
        }
      }
    }

    const area = count * scale * scale;
    if (area < settings.minArea || area > settings.maxArea) {
      excludedSize++;
      continue;
    }
    if (settings.excludeEdges && touchesBorder) {
      excludedEdge++;
      continue;
    }

    // `seed` is the topmost-leftmost pixel of this particle in raster order,
    // which is the required start point for boundary tracing.
    const seedX = seed % w;
    const seedY = (seed - seedX) / w;
    const outlinePts = traceOutline(labels, w, h, label, seedX, seedY);
    let perimeterPx = 0;
    const m = outlinePts.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const dx = outlinePts[2 * j]! - outlinePts[2 * i]!;
      const dy = outlinePts[2 * j + 1]! - outlinePts[2 * i + 1]!;
      perimeterPx += Math.hypot(dx, dy);
    }
    if (perimeterPx === 0) perimeterPx = 4; // single pixel

    const perimeter = perimeterPx * scale;
    let circularity = (4 * Math.PI * area) / (perimeter * perimeter);
    if (circularity > 1) circularity = 1;

    if (circularity < settings.minCircularity || circularity > settings.maxCircularity) {
      excludedCircularity++;
      continue;
    }

    const bwPx = maxX - minX + 1;
    const bhPx = maxY - minY + 1;
    const width = bwPx * scale;
    const height = bhPx * scale;
    const aspectRatio = width / height;
    const feret = feretMetrics(convexHull(outlinePts));

    // Morphology-only metric: circularity of a hole-filled temporary copy.
    // The outline traced above is the OUTER boundary, so perimeterPx already is
    // the external perimeter of the filled silhouette.
    const filledArea =
      filledAreaPx(labels, w, h, label, minX, minY, maxX, maxY, count) * scale * scale;
    let shapeCircularity = (4 * Math.PI * filledArea) / (perimeter * perimeter);
    if (shapeCircularity > 1) shapeCircularity = 1;


    particles.push({
      id: nextId++,
      areaPx: count,
      area,
      perimeter,
      bx: minX * scale,
      by: minY * scale,
      width,
      height,
      bxPx: minX,
      byPx: minY,
      bwPx,
      bhPx,
      feret: feret.max * scale,
      minFeret: feret.min * scale,
      feretAngle: feret.angle,
      aspectRatio,
      circularity,
      cxPx: sumX / count,
      cyPx: sumY / count,
      morphology: classifyMorphology(aspectRatio, circularity, feret.max * scale, feret.min * scale),
      touchesBorder,
      outline: Int16Array.from(outlinePts),
      rejected: false,
    });
  }

  return { width: w, height: h, particles, excludedEdge, excludedSize, excludedCircularity };
}

export async function decodeToImageData(
  file: File | Blob,
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { imageData, width: canvas.width, height: canvas.height };
}

/** Binary preview of the fixed threshold, as ImageJ would show it. */
export function thresholdPreview(imageData: ImageData, threshold: number): ImageData {
  const { width: w, height: h, data } = imageData;
  const out = new ImageData(w, h);
  const n = w * h;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (data[p]! + data[p + 1]! + data[p + 2]!) / 3;
    const v = g >= threshold ? 255 : 0;
    out.data[p] = v;
    out.data[p + 1] = v;
    out.data[p + 2] = v;
    out.data[p + 3] = 255;
  }
  return out;
}
