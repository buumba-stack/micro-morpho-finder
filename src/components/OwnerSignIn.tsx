/**
 * In-app account sign-in used by the packaged desktop application.
 *
 * The desktop app runs from file:// and previously opened the hosted /auth page
 * in the system browser — that authenticates the *browser*, and no session can
 * be handed back to Electron. Signing in here talks to the account service
 * directly, so the session lands in the desktop app itself (AI Review + cloud
 * sync). Web builds keep using the /auth route.
 */
import { useState } from "react";
import { getAuthClient } from "@/hooks/useAuth";

export function OwnerSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = await getAuthClient();
      if (!client) throw new Error("Account service unavailable. Try again later.");
      const { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err) throw err;
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex w-full flex-wrap items-center gap-2" onSubmit={submit}>
      <span className="text-accent">Sign in to your MicroFluor account for AI and cloud sync.</span>
      <input
        className="field field-focus w-48 px-2 py-0.5"
        type="email"
        required
        autoComplete="email"
        placeholder="you@lab.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="field field-focus w-40 px-2 py-0.5"
        type="password"
        required
        minLength={8}
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn-primary px-2 py-0.5" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <span className="text-fibre">{error}</span>}
    </form>
  );
}
