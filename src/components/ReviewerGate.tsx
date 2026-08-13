/**
 * Public pre-publication gate for the MicroFluor web application.
 *
 * Unauthorized visitors see only the pre-publication notice plus the reviewer
 * access-key field. The full analyzer module is loaded lazily and ONLY after
 * the server has confirmed a signed anonymous reviewer token — the correct key
 * is never present in the browser bundle, and no comparison happens here.
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { PrePublicationNotice } from "@/components/PrePublicationNotice";
import {
  endReviewerSession,
  getReviewerSession,
  startReviewerSession,
  verifyReviewerSession,
} from "@/lib/reviewer-session";

const AnalyzerApp = lazy(() =>
  import("@/components/AnalyzerApp").then((m) => ({ default: m.AnalyzerApp })),
);

export function ReviewerGate() {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!getReviewerSession()) {
      setState("locked");
      return;
    }
    void verifyReviewerSession().then((ok) => {
      if (active) setState(ok ? "open" : "locked");
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await startReviewerSession(key.trim());
      setKey(""); // the plaintext key is never retained
      setState("open");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Access key not recognized.");
    } finally {
      setBusy(false);
    }
  }, [key]);

  if (state === "open") {
    return (
      <>
        <div className="flex items-center justify-end gap-3 border-b border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <span className="text-sphere">Reviewer access</span>
          <button
            className="btn-ghost px-2 py-0.5"
            onClick={() => {
              endReviewerSession();
              setState("locked");
            }}
          >
            End reviewer session
          </button>
        </div>
        <Suspense
          fallback={
            <p className="p-6 font-mono text-[11px] text-muted-foreground">
              Loading MicroFluor…
            </p>
          }
        >
          <AnalyzerApp />
        </Suspense>
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <PrePublicationNotice />

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="label-caps">Reviewer / authorized access</h2>
        <label className="font-mono text-[11px] text-muted-foreground" htmlFor="reviewer-key">
          Access key
        </label>
        <input
          id="reviewer-key"
          className="field field-focus"
          type="password"
          autoComplete="off"
          value={key}
          disabled={state === "checking"}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && key.trim().length >= 8 && !busy) void submit();
          }}
        />
        <button
          className="btn-primary"
          disabled={busy || state === "checking" || key.trim().length < 8}
          onClick={() => void submit()}
        >
          {busy ? "Checking…" : "Access MicroFluor"}
        </button>
        {error && <p className="font-mono text-[11px] text-fibre">{error}</p>}
      </section>
    </main>
  );
}

