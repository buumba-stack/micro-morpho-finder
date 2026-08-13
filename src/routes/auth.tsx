import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getAuthClient, useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { MICROFLUOR_VERSION } from "@/lib/app-version";

declare const __MICROFLUOR_PREPUBLICATION__: boolean | undefined;
const PREPUB =
  typeof __MICROFLUOR_PREPUBLICATION__ === "boolean" ? __MICROFLUOR_PREPUBLICATION__ : true;

// Pre-publication mode keeps /auth working as the desktop sign-in bridge but
// avoids describing unpublished functionality.
const DESC = PREPUB
  ? "Account sign-in for MicroFluor research software."
  : "Sign in to MicroFluor to use the GPT-5 AI review and dataset chat. Local particle analysis works without an account.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · MicroFluor AI" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Sign in · MicroFluor AI" },
      { property: "og:description", content: DESC },
      { name: "twitter:title", content: "Sign in · MicroFluor AI" },
      { name: "twitter:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { account, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!loading && account) void navigate({ to: "/" });
  }, [account, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = await getAuthClient();
      if (!client) throw new Error("Account service unavailable. Try again later.");
      if (mode === "signup") {
        const { error: err } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (err) throw err;
        setNotice("Account created. Check your inbox if confirmation is required, then sign in.");
        setMode("signin");
      } else {
        const { error: err } = await client.auth.signInWithPassword({ email, password });
        if (err) throw err;
        void navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      void navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">MicroFluor account</h1>
        <p className="text-xs leading-snug text-muted-foreground">
          {PREPUB
            ? "Sign in to link your MicroFluor research software account. The web application is not publicly available during pre-publication."
            : "An account is required only for AI review and dataset chat. Image analysis, editing, blanks and exports run entirely on your machine without signing in. New accounts include 5 free AI reviews."}
        </p>
      </header>

      <button className="btn-primary" disabled={busy} onClick={() => void google()}>
        Continue with Google
      </button>

      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-border" />
        <span className="label-caps">or email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="flex flex-col gap-2" onSubmit={submit}>
        <input
          className="field field-focus"
          type="email"
          required
          autoComplete="email"
          placeholder="you@lab.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="field field-focus"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="Password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        className="btn-ghost"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError("");
          setNotice("");
        }}
      >
        {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
      </button>

      {error && <p className="font-mono text-[11px] text-fibre">{error}</p>}
      {notice && <p className="font-mono text-[11px] text-sphere">{notice}</p>}

      <p className="text-center font-mono text-[11px] text-muted-foreground">
        MicroFluor v{MICROFLUOR_VERSION} · © Buumba Hampuwo
      </p>
    </main>
  );
}
