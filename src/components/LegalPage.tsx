import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to MicroFluor
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
        {children}
      </div>
    </main>
  );
}
