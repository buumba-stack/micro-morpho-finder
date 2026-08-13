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

/** Password links must land on a real https page — the desktop app runs from file://. */
const RESET_URL = "https://fishmicroplasticfinder.com/reset-password";

export function OwnerSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
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

  const sendPasswordLink = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!email) throw new Error("Enter your account email first.");
      const client = await getAuthClient();
      if (!client) throw new Error("Account service unavailable. Try again later.");
      const { error: err } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_URL,
      });
      if (err) throw err;
      setNotice("Email sent. Open the link, set a password, then sign in here.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setBusy(false);
    }
  };


  return (
    <form className="flex w-full flex-col gap-2" onSubmit={submit}>
      <span className="font-sans text-sm font-semibold text-foreground">MicroFluor account</span>
      <label className="flex flex-col gap-1 text-muted-foreground">
        <span>Email</span>
        <input
          className="field field-focus w-full px-2 py-1"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-muted-foreground">
        <span>Password</span>
        <input
          className="field field-focus w-full px-2 py-1"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-2">
        <button className="btn-primary px-3 py-1" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button
          className="btn-ghost px-2 py-1"
          type="button"
          disabled={busy}
          onClick={() => void sendPasswordLink()}
        >
          Set or reset password
        </button>
      </div>
      {error && <span className="text-fibre">{error}</span>}
      {notice && <span className="text-sphere">{notice}</span>}
    </form>

  );
}
