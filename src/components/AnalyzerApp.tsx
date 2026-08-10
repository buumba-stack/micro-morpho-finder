import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  analyzeImageData,
  decodeToImageData,
  type AnalysisSettings,
} from "@/lib/particle-analysis";
import { isEntryStale, type ImageEntry, type RunProgress } from "@/lib/study-types";
import { computeBlankMatches } from "@/lib/blank-matching";
import { SetupPanel } from "@/components/SetupPanel";
import { ImageList } from "@/components/ImageList";
import { ImageViewer } from "@/components/ImageViewer";
import { ParticleTable } from "@/components/ParticleTable";
import { BlankComparePanel } from "@/components/BlankComparePanel";
import { SummaryPanel } from "@/components/SummaryPanel";
import { AiPanel } from "@/components/AiPanel";
import { BlankLibraryPanel } from "@/components/BlankLibraryPanel";
import { useBlankLibrary } from "@/hooks/useBlankLibrary";
import { countConfirmed } from "@/lib/blank-library";
import { clearSession, loadSession, saveSession } from "@/lib/session-store";


import type { AiReview } from "@/lib/ai-client";

export function AnalyzerApp() {
  /** defaults applied to newly added images only */
  const [defaults, setDefaults] = useState<AnalysisSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedParticle, setSelectedParticle] = useState<number | null>(null);
  const [progress, setProgress] = useState<RunProgress>({ running: false, done: 0, total: 0 });
  const [aiReviews, setAiReviews] = useState<Record<string, AiReview[]>>({});
  const [view, setView] = useState<"analysis" | "blanks">("analysis");
  /** false until the saved batch (if any) has been restored from local storage */
  const [sessionReady, setSessionReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
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

  const current = useMemo(
    () => entries.find((e) => e.id === selectedImage),
    [entries, selectedImage],
  );

  /** the settings shown in the left panel: selected image's own, else the defaults */
  const activeSettings = current?.settings ?? defaults;
  const selectedStale = current ? isEntryStale(current) : false;
  const pendingCount = entries.filter((e) => e.status !== "done" && e.status !== "running").length;
  const staleCount = entries.filter(isEntryStale).length;

  /** Edits the selected image's settings; with no selection, edits the defaults. */
  const patchSettings = useCallback(
    (patch: Partial<AnalysisSettings>) => {
      if (!selectedImage) {
        setDefaults((s) => ({ ...s, ...patch }));
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedImage ? { ...e, settings: { ...e.settings, ...patch } } : e,
        ),
      );
    },
    [selectedImage],
  );

  const addFiles = useCallback(
    (files: File[], tissue: string) => {
      setEntries((prev) => [
        ...prev,
        ...files.map((file, i) => ({
          id: `${Date.now()}-${i}-${file.name}`,
          file,
          name: file.name,
          tissue,
          status: "pending" as const,
          settings: { ...defaults },
        })),
      ]);
    },
    [defaults],
  );

  /** Analyzes exactly one image with its own settings; never touches the others. */
  const analyzeEntry = useCallback(
    async (entry: ImageEntry) => {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: "running" } : e)));
      const settings = entry.settings;
      try {
        const { imageData } = await decodeToImageData(entry.file);
        const analysis = analyzeImageData(imageData, settings);
        const blankMatches = computeBlankMatches(
          imageData,
          analysis.particles,
          settings,
          blanks.library,
        );
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: "done",
                  analysis,
                  runSettings: { ...settings },
                  analysisId: `${Date.now()}`,
                  blankMatches,
                  blankKeep: [],
                  error: undefined,
                }
              : e,
          ),
        );
      } catch (err) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: "error",
                  error: err instanceof Error ? err.message : "decode failed",
                }
              : e,
          ),
        );
      }
      setAiReviews((prev) => {
        if (!(entry.id in prev)) return prev;
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    },
    [blanks.library],
  );

  const runList = useCallback(
    async (list: ImageEntry[]) => {
      if (!list.length) return;
      setProgress({ running: true, done: 0, total: list.length });
      for (let i = 0; i < list.length; i++) {
        await analyzeEntry(list[i]!);
        setProgress({ running: true, done: i + 1, total: list.length });
        await new Promise((r) => setTimeout(r, 0));
      }
      setProgress({ running: false, done: list.length, total: list.length });
    },
    [analyzeEntry],
  );

  /** Batch: only images that were never analyzed (or failed). Existing results stay. */
  const runPending = useCallback(
    () => runList(entries.filter((e) => e.status !== "done" && e.status !== "running")),
    [entries, runList],
  );

  const reanalyzeSelected = useCallback(() => {
    if (current) void runList([current]);
  }, [current, runList]);

  const reanalyzeStale = useCallback(
    () => runList(entries.filter(isEntryStale)),
    [entries, runList],
  );

  const applyDefaultsToSelected = useCallback(() => {
    if (!selectedImage) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === selectedImage ? { ...e, settings: { ...defaults } } : e)),
    );
  }, [defaults, selectedImage]);

  const copySelectedToDefaults = useCallback(() => {
    if (current) setDefaults({ ...current.settings });
  }, [current]);

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

  const setRejected = useCallback(
    (particleId: number, rejected: boolean) => {
      if (!selectedImage) return;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedImage && e.analysis
            ? {
                ...e,
                analysis: {
                  ...e.analysis,
                  particles: e.analysis.particles.map((p) =>
                    p.id === particleId ? { ...p, rejected } : p,
                  ),
                },
              }
            : e,
        ),
      );
    },
    [selectedImage],
  );

  /** Marks a blank-matched particle as reviewed-and-kept (flag stays visible, muted). */
  const keepDespiteBlank = useCallback(
    (particleId: number) => {
      if (!selectedImage) return;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedImage
            ? {
                ...e,
                blankKeep: [...new Set([...(e.blankKeep ?? []), particleId])],
                analysis: e.analysis
                  ? {
                      ...e.analysis,
                      particles: e.analysis.particles.map((p) =>
                        p.id === particleId ? { ...p, rejected: false } : p,
                      ),
                    }
                  : e.analysis,
              }
            : e,
        ),
      );
    },
    [selectedImage],
  );

  const excludeAsBlank = useCallback(
    (particleId: number) => {
      setRejected(particleId, true);
      if (!selectedImage) return;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedImage
            ? { ...e, blankKeep: (e.blankKeep ?? []).filter((id) => id !== particleId) }
            : e,
        ),
      );
    },
    [selectedImage, setRejected],
  );

  const excludeAllHighConfidenceBlanks = useCallback(() => {
    if (!current?.blankMatches) return;
    const ids = Object.values(current.blankMatches)
      .filter((m) => m.highConfidence && !(current.blankKeep ?? []).includes(m.particleId))
      .map((m) => m.particleId);
    if (ids.length) applyExclusions(current.id, ids);
  }, [applyExclusions, current]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
    setAiReviews({});
    setSavedAt(null);
    void clearSession();
  }, []);

  /** Restore the previously analyzed batch so results survive reloads/crashes. */
  useEffect(() => {
    let cancelled = false;
    void loadSession().then((saved) => {
      if (cancelled) return;
      if (saved?.entries.length) {
        setEntries(saved.entries);
        setDefaults(saved.defaults ?? DEFAULT_SETTINGS);
        setSavedAt(saved.savedAt);
      }
      setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Auto-save the batch (debounced) whenever results or settings change. */
  useEffect(() => {
    if (!sessionReady || progress.running) return;
    const t = setTimeout(() => {
      void saveSession(entries, defaults).then((ok) => {
        if (ok) setSavedAt(new Date().toISOString());
      });
    }, 600);
    return () => clearTimeout(t);
  }, [entries, defaults, sessionReady, progress.running]);


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
            per-image threshold, binary particle detection, then Area, Perimeter, Feret's diameter,
            bounding rectangle, aspect ratio and circularity per particle — classified as fibre,
            sphere, pellet or fragment. Each image keeps its own settings; everything runs locally
            in your browser and images are never uploaded.
          </p>
        </div>
        <dl className="flex gap-5 font-mono text-xs text-muted-foreground">
          <div>
            <dt className="label-caps">{current ? "Image scale" : "Default scale"}</dt>
            <dd className="text-foreground">{activeSettings.umPerPx} µm/px</dd>
          </div>
          <div>
            <dt className="label-caps">{current ? "Image threshold" : "Default threshold"}</dt>
            <dd className="text-foreground">{activeSettings.threshold}</dd>
          </div>
          <div>
            <dt className="label-caps">Images</dt>
            <dd className="text-foreground">{entries.length}</dd>
          </div>
          <div>
            <dt className="label-caps">Batch saved</dt>
            <dd className="text-foreground">
              {savedAt ? new Date(savedAt).toLocaleTimeString() : "—"}
            </dd>
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

      {staleCount > 0 && !progress.running && view === "analysis" && (
        <p className="flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
          <span>
            {staleCount} image{staleCount === 1 ? "" : "s"} have edited settings that are not
            applied yet. Existing results are untouched until you re-analyze.
          </span>
          <button className="btn-ghost px-2 py-0.5" onClick={reanalyzeStale}>
            Re-analyze {staleCount} changed image{staleCount === 1 ? "" : "s"}
          </button>
        </p>
      )}

      {view === "blanks" && <BlankLibraryPanel settings={defaults} api={blanks} />}

      <div
        className={`${view === "analysis" ? "grid" : "hidden"} min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]`}
      >
        <div className="flex min-h-0 flex-col gap-4">
          <SetupPanel
            settings={activeSettings}
            onChange={patchSettings}
            scope={current ? "image" : "defaults"}
            selectedName={current?.name}
            selectedAnalyzed={current?.status === "done"}
            selectedStale={selectedStale}
            onReanalyzeSelected={reanalyzeSelected}
            onApplyDefaultsToSelected={applyDefaultsToSelected}
            onCopySelectedToDefaults={copySelectedToDefaults}
            defaults={defaults}
            onAddFiles={addFiles}
            onRun={runPending}
            onClear={clearAll}
            progress={progress}
            imageCount={entries.length}
            pendingCount={pendingCount}
          />
        </div>

        <div className="flex min-h-[70vh] flex-col gap-4">
          <ImageViewer
            entry={current}
            threshold={activeSettings.threshold}
            selectedId={selectedParticle}
            onSelect={setSelectedParticle}
            onToggleReject={toggleReject}
          />
          <BlankComparePanel
            entry={current}
            selectedId={selectedParticle}
            onSelect={setSelectedParticle}
            onExclude={excludeAsBlank}
            onKeep={keepDespiteBlank}
            onExcludeAllHighConfidence={excludeAllHighConfidenceBlanks}
          />
          <SummaryPanel entries={entries} />
          <AiPanel
            entry={current}
            entries={entries}
            settings={activeSettings}
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
              blankMatches={current?.blankMatches}
              blankKeep={current?.blankKeep}
              selectedId={selectedParticle}
              onSelect={setSelectedParticle}
              onToggleReject={toggleReject}
            />
          </div>
        </div>
      </div>

      <footer className="label-caps pb-2">
        Classification: fibre AR ≤ 0.33 or ≥ 3 · sphere circ &gt; 0.90 · pellet 0.60 &lt; circ ≤
        0.90 · fragment circ ≤ 0.60 · circularity = 4π·area/perimeter² · aspect ratio = width/height
      </footer>
    </main>
  );
}
