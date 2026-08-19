/**
 * Single source of truth for the morphology outline colours used by the image
 * viewer and by the final-image export, so both always agree.
 */
export const MORPH_VAR: Record<string, string> = {
  fibre: "--fibre",
  sphere: "--sphere",
  pellet: "--pellet",
  fragment: "--fragment",
};

export function cssColor(name: string): string {
  if (typeof window === "undefined") return "#fff";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff";
}

export function morphologyColor(morphology: string): string {
  return cssColor(MORPH_VAR[morphology] ?? "--fragment");
}
