import type { Morphology } from "./particle-analysis";
import { MORPHOLOGIES } from "./particle-analysis";
import { MICROFLUOR_VERSION } from "./app-version";

export interface ExportRow {
  file: string;
  tissue: string;
  particle: number;
  area: number;
  perimeter: number;
  width: number;
  height: number;
  feret: number;
  minFeret: number;
  feretAngle: number;
  aspectRatio: number;
  circularity: number;
  morphology: Morphology;
  status: "accepted" | "rejected";
  /** provenance — metadata only, never used in any measurement */
  microfluorVersion: string;
  analysisRunId: string;
  analysisTimestamp: string;
}

const num = (v: number, digits = 4) =>
  Number.isFinite(v) ? v.toFixed(digits) : "";

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function particlesCsv(rows: ExportRow[]): string {
  const header = [
    "Image",
    "Tissue",
    "Particle",
    "Area (um^2)",
    "Perimeter (um)",
    "Width (um)",
    "Height (um)",
    "Feret (um)",
    "MinFeret (um)",
    "FeretAngle (deg)",
    "AspectRatio",
    "Circularity",
    "Morphology",
    "Status",
    "microfluor_version",
    "analysis_run_id",
    "analysis_timestamp",
  ];
  const lines = rows.map((r) =>
    [
      csvCell(r.file),
      csvCell(r.tissue),
      String(r.particle),
      num(r.area, 3),
      num(r.perimeter, 3),
      num(r.width, 3),
      num(r.height, 3),
      num(r.feret, 3),
      num(r.minFeret, 3),
      num(r.feretAngle, 1),
      num(r.aspectRatio, 4),
      num(r.circularity, 4),
      r.morphology,
      r.status,
      csvCell(r.microfluorVersion),
      csvCell(r.analysisRunId),
      csvCell(r.analysisTimestamp),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}


export function summaryCsv(rows: ExportRow[], groupBy: "file" | "tissue"): string {
  const accepted = rows.filter((r) => r.status === "accepted");
  const groups = new Map<string, ExportRow[]>();
  for (const r of accepted) {
    const key = groupBy === "file" ? r.file : r.tissue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const header = [
    groupBy === "file" ? "Image" : "Tissue",
    "Total particles",
    ...MORPHOLOGIES.map((m) => `${m} count`),
    ...MORPHOLOGIES.map((m) => `${m} %`),
    "Mean area (um^2)",
    "Mean Feret (um)",
    "Mean circularity",
    "Mean aspect ratio",
    "microfluor_version",
    "analysis_run_id",
    "analysis_timestamp",
  ];
  const lines = [...groups.entries()].map(([key, list]) => {
    const total = list.length;
    const counts = MORPHOLOGIES.map((m) => list.filter((r) => r.morphology === m).length);
    const mean = (f: (r: ExportRow) => number) =>
      total ? list.reduce((s, r) => s + f(r), 0) / total : 0;
    const runIds = [...new Set(list.map((r) => r.analysisRunId).filter(Boolean))];
    const stamps = list.map((r) => r.analysisTimestamp).filter(Boolean).sort();
    return [
      csvCell(key),
      String(total),
      ...counts.map(String),
      ...counts.map((c) => num(total ? (100 * c) / total : 0, 2)),
      num(mean((r) => r.area), 3),
      num(mean((r) => r.feret), 3),
      num(mean((r) => r.circularity), 4),
      num(mean((r) => r.aspectRatio), 4),
      csvCell(MICROFLUOR_VERSION),
      csvCell(runIds.length === 1 ? runIds[0]! : runIds.join(" ")),
      csvCell(stamps.length ? stamps[stamps.length - 1]! : ""),
    ].join(",");

  });
  return [header.join(","), ...lines].join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
