import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSettings } from "@/lib/particle-analysis";
import type { ImageEntry } from "@/lib/study-types";
import { buildParticleCrops } from "@/lib/particle-crops";
import { datasetDigest } from "@/lib/dataset-digest";
import { isOnline, requestQc, streamChat, type AiReview } from "@/lib/ai-client";

const BATCH = 12;

const VERDICT_CLASS: Record<string, string> = {
  keep: "text-sphere",
  exclude: "text-fibre",
  uncertain: "text-pellet",
};

interface Props {
  entry: ImageEntry | undefined;
  entries: ImageEntry[];
  settings: AnalysisSettings;
  reviews: Record<string, AiReview[]>;
  onReviews: (imageId: string, reviews: AiReview[]) => void;
  onSelectParticle: (id: number) => void;
  onSelectImage: (imageId: string) => void;
  onApplyExclusions: (imageId: string, ids: number[]) => void;
  /** writes every "exclude" verdict into the batch-processed results */
  onAcceptReviews: () => void;
}

type Msg = { role: "user" | "assistant"; content: string };

export function AiPanel({
  entry,
  entries,
  settings,
  reviews,
  onReviews,
  onSelectParticle,
  onSelectImage,
  onApplyExclusions,
  onAcceptReviews,
}: Props) {
  const [tab, setTab] = useState<"qc" | "chat">("qc");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const particles = entry?.analysis?.particles ?? [];
  const current = entry ? (reviews[entry.id] ?? []) : [];
  const excludeIds = current.filter((r) => r.verdict === "exclude").map((r) => r.id);
  const batchReady = entries.filter((e) => e.analysis && !e.draft);
  const pendingUpdates = entries.filter((e) => e.draft).length;

  /** Reviews shown in the panel: batch-processed images only, in batch order. */
  const reviewed = batchReady
    .map((e) => ({ entry: e, list: reviews[e.id] ?? [] }))
    .filter((g) => g.list.length > 0);
  const reviewedTotal = reviewed.reduce((s, g) => s + g.list.length, 0);
  const flaggedTotal = reviewed.reduce(
    (s, g) => s + g.list.filter((r) => r.verdict === "exclude").length,
    0,
  );
  const selectedHasDraft = Boolean(entry?.draft);


  const digest = useMemo(() => datasetDigest(entries, settings), [entries, settings]);

  useEffect(() => {
    if (tab === "chat") inputRef.current?.focus();
  }, [tab, streaming]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const reviewEntry = useCallback(
    async (target: ImageEntry, label: string) => {
      if (!target.analysis) return;
      const all: AiReview[] = [];
      const targets = target.analysis.particles;
      for (let i = 0; i < targets.length; i += BATCH) {
        const chunk = targets.slice(i, i + BATCH);
        setStatus(
          `${label} — ${i + 1}-${Math.min(i + BATCH, targets.length)} of ${targets.length}…`,
        );
        const crops = await buildParticleCrops(target, chunk);
        const got = await requestQc({
          file: target.name,
          tissue: target.tissue,
          umPerPx: target.runSettings?.umPerPx ?? settings.umPerPx,
          threshold: target.runSettings?.threshold ?? settings.threshold,
          particles: chunk.map((p) => ({
            id: p.id,
            area: p.area,
            perimeter: p.perimeter,
            width: p.width,
            height: p.height,
            feret: p.feret,
            minFeret: p.minFeret,
            aspectRatio: p.aspectRatio,
            circularity: p.circularity,
            morphology: p.morphology,
            touchesBorder: p.touchesBorder,
            ...(crops.get(p.id) ? { crop: crops.get(p.id)! } : {}),
            ...(target.blankMatches?.[p.id]
              ? {
                  blankSimilarity: target.blankMatches[p.id]!.similarity,
                  blankReference: target.blankMatches[p.id]!.matches[0]?.referenceId ?? "",
                  ...(target.blankMatches[p.id]!.matches[0]?.crop
                    ? { blankCrop: target.blankMatches[p.id]!.matches[0]!.crop }
                    : {}),
                }
              : {}),
          })),
        });
        all.push(...got);
        onReviews(target.id, [...all]);
      }
      return all.length;
    },
    [onReviews, settings],
  );

  const runQc = useCallback(async () => {
    if (!entry || !entry.analysis || entry.draft) return;
    if (!isOnline()) {
      setError("AI review needs an internet connection.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const n = await reviewEntry(entry, `Reviewing ${entry.name}`);
      setStatus(`Reviewed ${n ?? 0} particle${n === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI review failed");
    } finally {
      setBusy(false);
    }
  }, [entry, reviewEntry]);

  /** Final pass over the whole updated batch, image by image. */
  const runQcAll = useCallback(async () => {
    const list = entries.filter((e) => e.analysis && !e.draft);
    if (!list.length) return;
    if (!isOnline()) {
      setError("AI review needs an internet connection.");
      return;
    }
    setBusy(true);
    setError("");
    let total = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const n = await reviewEntry(list[i]!, `Image ${i + 1}/${list.length} · ${list[i]!.name}`);
        total += n ?? 0;
      }
      setStatus(`Final review complete — ${total} particles across ${list.length} images.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI review failed");
    } finally {
      setBusy(false);
    }
  }, [entries, reviewEntry]);


  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    if (!isOnline()) {
      setError("AI chat needs an internet connection.");
      return;
    }
    setError("");
    setDraft("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      let acc = "";
      await streamChat({ messages: next, dataset: digest }, (chunk) => {
        acc += chunk;
        setMessages([...next, { role: "assistant", content: acc }]);
      });
      if (!acc) setMessages([...next, { role: "assistant", content: "(no answer returned)" }]);
    } catch (err) {
      setMessages(next);
      setError(err instanceof Error ? err.message : "AI chat failed");
    } finally {
      setStreaming(false);
    }
  }, [draft, digest, messages, streaming]);

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex gap-1">
          {(["qc", "chat"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t === "qc" ? "AI review" : "Ask the data"}
            </button>
          ))}
        </div>
        <span className="label-caps">GPT-5 · online only</span>
      </div>

      {error && (
        <p className="border-b border-border bg-fibre/10 px-3 py-2 font-mono text-[11px] text-fibre">
          {error}
        </p>
      )}

      {tab === "qc" ? (
        <div className="flex min-h-0 flex-col gap-2 p-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Sends each particle's measurements plus a zoomed crop with its detected outline to
            GPT-5, which confirms the fibre/sphere/pellet/fragment call and flags overlapping
            particles, incomplete outlines, border contact and fluorescence unlike the positive
            controls. Blank matches are sent along as visual evidence; uncertain objects are always
            kept.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={busy || !particles.length || selectedHasDraft}
              onClick={runQc}
            >
              {busy
                ? "Reviewing…"
                : `AI review this batch image (${particles.length} particle${particles.length === 1 ? "" : "s"})`}
            </button>
            <button
              className="btn-ghost"
              disabled={busy || !excludeIds.length || !entry || selectedHasDraft}
              onClick={() => entry && onApplyExclusions(entry.id, excludeIds)}
            >
              Reject {excludeIds.length} flagged
            </button>
          </div>
          {selectedHasDraft && (
            <p className="font-mono text-[11px] text-accent">
              This image has a pending update. Click “Update batch” first — the AI review only runs
              on batch-processed data.
            </p>
          )}
          <button
            className="btn-primary"
            disabled={busy || !batchReady.length || pendingUpdates > 0}
            onClick={runQcAll}
          >
            {busy
              ? "Reviewing…"
              : `Final AI review of all ${batchReady.length} analysed image${batchReady.length === 1 ? "" : "s"}`}
          </button>
          {pendingUpdates > 0 && (
            <p className="font-mono text-[11px] text-accent">
              {pendingUpdates} re-analysed image{pendingUpdates === 1 ? "" : "s"} still need “Update
              batch” before the final review.
            </p>
          )}

          {status && <p className="font-mono text-[11px] text-muted-foreground">{status}</p>}

          <div className="min-h-0 flex-1 overflow-auto">
            {reviewed.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No AI review yet for the batch-processed images.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {reviewedTotal} particle{reviewedTotal === 1 ? "" : "s"} reviewed across{" "}
                    {reviewed.length} batch image{reviewed.length === 1 ? "" : "s"} ·{" "}
                    {flaggedTotal} flagged
                  </span>
                  <button
                    className="btn-primary ml-auto px-2 py-0.5"
                    disabled={busy || !flaggedTotal || pendingUpdates > 0}
                    onClick={onAcceptReviews}
                  >
                    Accept AI review — reject {flaggedTotal} flagged
                  </button>
                </div>
                {reviewed.map((g) => (
                  <div key={g.entry.id} className="flex flex-col gap-1">
                    <button
                      onClick={() => onSelectImage(g.entry.id)}
                      className="flex items-center justify-between gap-2 border-b border-border pb-1 text-left font-mono text-[11px] hover:text-primary"
                    >
                      <span className="truncate">
                        {g.entry.name} <span className="text-muted-foreground">[{g.entry.tissue}]</span>
                      </span>
                      <span className="text-muted-foreground">
                        thr {g.entry.runSettings?.threshold ?? "—"} ·{" "}
                        {g.list.filter((r) => r.verdict === "exclude").length}/{g.list.length}{" "}
                        flagged
                      </span>
                    </button>
                    <ul className="flex flex-col gap-1">
                      {g.list.map((r) => (
                        <li key={r.id}>
                          <button
                            onClick={() => {
                              onSelectImage(g.entry.id);
                              onSelectParticle(r.id);
                            }}
                            className="w-full rounded border border-border px-2 py-1.5 text-left hover:bg-secondary"
                          >
                            <span className="flex items-center justify-between gap-2 font-mono text-[11px]">
                              <span>#{r.id}</span>
                              <span className={VERDICT_CLASS[r.verdict] ?? ""}>
                                {r.verdict} · {r.morphology}
                                {r.issue !== "none" ? ` · ${r.issue}` : ""}
                              </span>
                              <span className="text-muted-foreground">
                                {Math.round((r.confidence ?? 0) * 100)}%
                              </span>
                            </span>
                            {r.note && (
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                {r.note}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={logRef} className="min-h-[180px] flex-1 overflow-auto p-3">
            {messages.length === 0 ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Ask about your results — e.g. “Compare fibre share between liver and intestine”,
                “Which images have unusually large particles?”, “Summarise mean Feret per tissue”.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((m, i) => (
                  <li
                    key={i}
                    className={
                      m.role === "user"
                        ? "rounded bg-secondary px-2 py-1.5 text-xs"
                        : "whitespace-pre-wrap px-2 py-1.5 text-xs leading-relaxed"
                    }
                  >
                    {m.content || (streaming ? "…" : "")}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 border-t border-border p-2">
            <textarea
              ref={inputRef}
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about the dataset…"
              className="field field-focus flex-1 resize-none"
            />
            <button className="btn-primary" disabled={streaming || !draft.trim()} onClick={send}>
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
