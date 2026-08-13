/**
 * Public pre-publication notice shown to unauthorized visitors.
 *
 * Rendered by `ReviewerGate` above the reviewer access-key field. Deliberately
 * minimal: no methodology, thresholds, screenshots or downloads.
 */
export function PrePublicationNotice() {
  return (
    <section className="flex flex-col gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">MicroFluor</h1>
      <p className="label-caps">Pre-publication research software</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The web application is not currently available for public access. Access will be provided
        following the appropriate research release.
      </p>
    </section>
  );
}
