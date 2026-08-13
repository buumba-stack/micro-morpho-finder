/**
 * Public browser shell used while MicroFluor is in pre-publication mode.
 *
 * In the web build this module REPLACES `@/components/AnalyzerApp` through a
 * build-time alias (see vite.config.ts), so no analyzer code is delivered to
 * the browser. The desktop build (desktop/vite.config.ts) has no such alias
 * and keeps the full analyzer.
 *
 * Deliberately minimal: no methodology, thresholds, screenshots or downloads.
 */
export function AnalyzerApp() {
  return <PrePublicationNotice />;
}

export function PrePublicationNotice() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">MicroFluor</h1>
      <p className="label-caps">Pre-publication research software</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The web application is not currently available for public access. Access will be provided
        following the appropriate research release.
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">© MicroFluor</p>
    </main>
  );
}
