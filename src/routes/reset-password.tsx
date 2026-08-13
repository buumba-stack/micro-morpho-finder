import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAuthClient } from "@/hooks/useAuth";

const DESC = "Set a new password for your MicroFluor account.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set password · MicroFluor" },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Set password · MicroFluor" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Set password · MicroFluor" },
      { name: "twitter:description", content: DESC },
    ],
  }),
  component: ResetPasswordPage,
});

/**
 * Dedicated authentication utility route: no reviewer gate, no access key,
 * no analyzer. It only turns a one-time recovery link into a password on the
 * *existing* account (updateUser, never signUp).
 */
function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    // Read the link parameters before the Supabase client consumes the URL.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const linkError = hash.get("error_description") ?? query.get("error_description");
    const code = query.get("code");
    const tokenHash = query.get("token_hash");

    void (async () => {
      const client = await getAuthClient();
      if (!client || !active) {
        if (active) {
          setChecking(false);
          setError("Account service unavailable. Try again later.");
        }
        return;
      }

      const { data: sub } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
          setReady(true);
          setError("");
          setChecking(false);
        }
      });
      unsub = () => sub.subscription.unsubscribe();

      if (linkError) {
        setError(`${linkError}. Request a new reset email from MicroFluor.`);
        setChecking(false);
        return;
      }

      try {
        // Implicit flow (hash tokens) is handled automatically by the client;
        // PKCE (?code) and token_hash links are exchanged explicitly.
        if (code) await client.auth.exchangeCodeForSession(code);
        else if (tokenHash) await client.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
      } catch (err) {
        console.error("recovery exchange failed", err);
      }

      const { data } = await client.auth.getSession();
      if (!active) return;
      if (data.session) {
        setReady(true);
      } else {
        setError("This reset link is invalid, expired or already used. Request a new one.");
      }
      setChecking(false);
    })();

    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const client = await getAuthClient();
      if (!client) throw new Error("Account service unavailable. Try again later.");
      // Updates the password of the already-authenticated recovery user.
      const { error: err } = await client.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="font-sans text-lg font-semibold text-foreground">MicroFluor</h1>
      {done ? (
        <>
          <h2 className="font-sans text-base font-semibold text-foreground">Password updated</h2>
          <p className="text-xs text-muted-foreground">
            You can return to MicroFluor and sign in using your email and new password.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-sans text-base font-semibold text-foreground">Set password</h2>
          {checking && <p className="text-xs text-muted-foreground">Checking reset link…</p>}
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>New password</span>
              <input
                className="field field-focus"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>Confirm password</span>
              <input
                className="field field-focus"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button className="btn-primary" type="submit" disabled={busy || !ready}>
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        </>
      )}
      {error && <p className="font-mono text-[11px] text-fibre">{error}</p>}
      <p className="text-center font-mono text-[11px] text-muted-foreground">
        MicroFluor © 2026 Buumba Hampuwo. All Rights Reserved.
      </p>
    </main>
  );
}
