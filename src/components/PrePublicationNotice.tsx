/** Public pre-publication notice shown to unauthorized visitors. */
export function PrePublicationNotice() {
  return (
    <section className="flex flex-col gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">MicroFluor</h1>
      <p className="label-caps">Pre-publication research software</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The web application is not currently available for public access. Authorized reviewers and
        testers may enter the access key provided to them.
      </p>
    </section>
  );
}

