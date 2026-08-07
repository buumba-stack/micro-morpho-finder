import type { ImageEntry } from "@/lib/study-types";
import type { Particle } from "@/lib/particle-analysis";
import { decodeToImageData } from "@/lib/particle-analysis";

/**
 * Renders a zoomed crop of each particle (with its detected outline drawn on
 * top) as a PNG data URL so GPT-5 can visually verify the classification.
 */
export async function buildParticleCrops(
  entry: ImageEntry,
  particles: Particle[],
  maxSide = 256,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (typeof document === "undefined" || !particles.length) return out;

  const { imageData } = await decodeToImageData(entry.file);
  const src = document.createElement("canvas");
  src.width = imageData.width;
  src.height = imageData.height;
  src.getContext("2d")?.putImageData(imageData, 0, 0);

  const crop = document.createElement("canvas");
  const ctx = crop.getContext("2d");
  if (!ctx) return out;

  for (const p of particles) {
    const pad = Math.max(6, Math.round(Math.max(p.bwPx, p.bhPx) * 0.4));
    const x = Math.max(0, Math.round(p.bxPx) - pad);
    const y = Math.max(0, Math.round(p.byPx) - pad);
    const w = Math.min(imageData.width - x, Math.round(p.bwPx) + pad * 2);
    const h = Math.min(imageData.height - y, Math.round(p.bhPx) + pad * 2);
    if (w <= 0 || h <= 0) continue;

    const scale = Math.min(4, Math.max(1, maxSide / Math.max(w, h)));
    crop.width = Math.round(w * scale);
    crop.height = Math.round(h * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, crop.width, crop.height);
    ctx.drawImage(src, x, y, w, h, 0, 0, crop.width, crop.height);

    const o = p.outline;
    if (o.length >= 4) {
      ctx.beginPath();
      ctx.moveTo((o[0]! - x) * scale, (o[1]! - y) * scale);
      for (let i = 2; i < o.length; i += 2) {
        ctx.lineTo((o[i]! - x) * scale, (o[i + 1]! - y) * scale);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,80,80,0.9)";
      ctx.lineWidth = Math.max(1, scale * 0.6);
      ctx.stroke();
    }

    out.set(p.id, crop.toDataURL("image/png"));
  }

  return out;
}
