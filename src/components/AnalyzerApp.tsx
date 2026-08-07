import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  analyzeImageData,
  decodeToImageData,
  type AnalysisSettings,
} from "@/lib/particle-analysis";
import type { ImageEntry, RunProgress } from "@/lib/study-types";
import { SetupPanel } from "@/components/SetupPanel";
import { ImageList } from "@/components/ImageList";
import { ImageViewer } from "@/components/ImageViewer";
import { ParticleTable } from "@/components/ParticleTable";
import { SummaryPanel } from "@/components/SummaryPanel";
import { AiPanel } from "@/components/AiPanel";
import { BlankLibraryPanel } from "@/components/BlankLibraryPanel";
import { useBlankLibrary } from "@/hooks/useBlankLibrary";
import type { AiReview } from "@/lib/ai-client";

export function AnalyzerApp() {
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedParticle, setSelectedParticle] = useState<number | null>(null);
  const [progress, setProgress] = useState<RunProgress>({ running: false, done: 0, total: 0 });
  const [runSignature, setRunSignature] = useState<string>("");
  const [aiReviews, setAiReviews] = useState<Record<string, AiReview[]>>({});
  const [view, setView] = useState<"analysis" | "blanks">("analysis");
  const blanks = useBlankLibrary();


  const setReviews = useCallback((imageId: string, list: AiReview[]) => {
    setAiReviews((prev) => ({ ...prev, [imageId]: list }));
  }, []);

  const applyExclusions = useCallback((imageId: string, ids: number[]) => {
    const flagged = new Set(ids);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === imageId && e.analysis
          ? {
              ...e,
              analysis: {
                ...e.analysis,
                particles: e.analysis.particles.map((p) =>
                  flagged.has(p.id) ? { ...p, rejected: true } : p,
                ),
              },
            }
          : e,
      ),
    );
  }, []);

  const blankConfirmed = useMemo(() => countConfirmed(blanks.library), [blanks.library]);
  const signature = JSON.stringify(settings);

  const pendingCount = entries.filter((e) => e.status !== "done").length;
  const staleSettings = runSignature !== "" && runSignature !== signature;

  const patchSettings = useCallback((patch: Partial<AnalysisSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const addFiles = useCallback((files: File[], tissue: string) => {
    setEntries((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        name: file.name,
        tissue,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const run = useCallback(async () => {
    const targets = staleSettings ? entries : entries.filter((e) => e.status !== "done");
    const list = targets.length ? targets : entries;
    setProgress({ running: true, done: 0, total: list.length });

    for (let i = 0; i < list.length; i++) {
      const entry = list[i]!;
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "running" } : e)),
      );
      try {
        const { imageData } = await decodeToImageData(entry.file);
        const analysis = analyzeImageData(imageData, settings);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, status: "done", analysis, error: undefined } : e,
          ),
        );
      } catch (err) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? { ...e, status: "error", error: err instanceof Error ? err.message : "decode failed" }
              : e,
          ),
        );
      }
      setProgress({ running: true, done: i + 1, total: list.length });
      await new Promise((r) => setTimeout(r, 0));
    }

    setRunSignature(signature);
    setProgress({ running: false, done: list.length, total: list.length });
  }, [entries, settings, signature, staleSettings]);

  const toggleReject = useCallback(
    (particleId: number) => {
      if (!selectedImage) return;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedImage && e.analysis
            ? {
                ...e,
                analysis: {
                  ...e.analysis,
                  particles: e.analysis.particles.map((p) =>
                    p.id === particleId ? { ...p, rejected: !p.rejected } : p,
                  ),
                },
              }
            : e,
        ),
      );
    },
    [selectedImage],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const current = useMemo(
    () => entries.find((e) => e.id === selectedImage),
    [entries, selectedImage],
  );

  useEffect(() => {
    if (!selectedImage && entries.length) setSelectedImage(entries[0]!.id);
    if (selectedImage && !entries.some((e) => e.id === selectedImage)) {
      setSelectedImage(entries[0]?.id ?? null);
    }
  }, [entries, selectedImage]);

  useEffect(() => setSelectedParticle(null), [selectedImage]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            MicroFluor <span className="text-primary">·</span> Microplastic Morphology Analyzer
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            ImageJ-equivalent particle analysis for fluorescence photomicrographs: 8-bit conversion,
            fixed threshold, binary particle detection, then Area, Perimeter, Feret's diameter,
            bounding rectangle, aspect ratio and circularity per particle — classified as fibre,
            sphere, pellet or fragment. Everything runs locally in your browser; images are never
            uploaded.
          </p>
        </div>
        <dl className="flex gap-5 font-mono text-xs text-muted-foreground">
          <div>
            <dt className="label-caps">Scale</dt>
            <dd className="text-foreground">{settings.umPerPx} µm/px</dd>
          </div>
          <div>
            <dt className="label-caps">Threshold</dt>
            <dd className="text-foreground">{settings.threshold}</dd>
          </div>
          <div>
            <dt className="label-caps">Images</dt>
            <dd className="text-foreground">{entries.length}</dd>
          </div>
        </dl>
      </header>

      <nav className="flex gap-1 border-b border-border">
        {(
          [
            ["analysis", "Analysis"],
            ["blanks", `Blank library${blankConfirmed ? ` · ${blankConfirmed} confirmed` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {staleSettings && !progress.running && view === "analysis" && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
          Settings changed since the last run — re-analyze to apply the new scale/threshold/filters.
        </p>
      )}

      {view === "blanks" && <BlankLibraryPanel settings={settings} api={blanks} />}

      <div
        className={`${view === "analysis" ? "grid" : "hidden"} min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]`}
      >

        <div className="flex min-h-0 flex-col gap-4">
          <SetupPanel
            settings={settings}
            onChange={patchSettings}
            onAddFiles={addFiles}
            onRun={run}
            onClear={() => setEntries([])}
            progress={progress}
            imageCount={entries.length}
            pendingCount={staleSettings ? entries.length : pendingCount}
          />
        </div>

        <div className="flex min-h-[70vh] flex-col gap-4">
          <ImageViewer
            entry={current}
            threshold={settings.threshold}
            selectedId={selectedParticle}
            onSelect={setSelectedParticle}
            onToggleReject={toggleReject}
          />
          <SummaryPanel entries={entries} />
          <AiPanel
            entry={current}
            entries={entries}
            settings={settings}
            reviews={aiReviews}
            onReviews={setReviews}
            onSelectParticle={setSelectedParticle}
            onApplyExclusions={applyExclusions}
          />
        </div>


        <div className="flex min-h-0 flex-col gap-4">
          <ImageList
            entries={entries}
            selectedId={selectedImage}
            onSelect={setSelectedImage}
            onRemove={removeEntry}
          />
          <div className="min-h-[45vh] flex flex-col">
            <ParticleTable
              particles={current?.analysis?.particles ?? []}
              selectedId={selectedParticle}
              onSelect={setSelectedParticle}
              onToggleReject={toggleReject}
            />
          </div>
        </div>
      </div>

      <footer className="label-caps pb-2">
        Classification: fibre AR ≤ 0.33 or ≥ 3 · sphere circ &gt; 0.90 · pellet 0.60 &lt; circ ≤ 0.90
        · fragment circ ≤ 0.60 · circularity = 4π·area/perimeter² · aspect ratio = width/height
      </footer>
    </main>
  );
}
