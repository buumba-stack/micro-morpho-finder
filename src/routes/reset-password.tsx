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

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthClient().then((client) => {
      if (!client || !active) return;
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
      });
      void client.auth.getSession().then(({ data: s }) => {
        if (s.session) setReady(true);
      });
      return () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = await getAuthClient();
      if (!client) throw new Error("Account service unavailable. Try again later.");
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">Set a password</h1>
      {done ? (
        <p className="text-xs text-muted-foreground">
          Password updated. You can now sign in with your email and this password in the MicroFluor
          desktop application.
        </p>
      ) : (
        <>
          {!ready && (
            <p className="text-xs text-muted-foreground">
              Open this page from the link in your email to set a password.
            </p>
          )}
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <input
              className="field field-focus"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="New password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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
