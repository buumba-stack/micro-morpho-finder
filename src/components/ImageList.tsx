import { isEntryStale, type ImageEntry } from "@/lib/study-types";

interface Props {
  entries: ImageEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const statusDot: Record<string, string> = {
  pending: "bg-muted-foreground",
  running: "bg-accent animate-pulse",
  done: "bg-primary",
  error: "bg-destructive",
};

export function ImageList({ entries, selectedId, onSelect, onRemove }: Props) {
  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Images</h3>
        <span className="label-caps">{entries.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {entries.map((e) => {
          const accepted = e.analysis?.particles.filter((p) => !p.rejected).length ?? 0;
          const stale = isEntryStale(e);
          const blankFlags = Object.keys(e.blankMatches ?? {}).length;
          return (
            <li key={e.id}>
              <button
                onClick={() => onSelect(e.id)}
                className={`group flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors ${
                  e.id === selectedId ? "bg-secondary" : "hover:bg-muted/60"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[e.status]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px]">{e.name}</span>
                  <span className="label-caps">
                    {e.tissue}
                    {e.status === "done" ? ` · ${accepted} particles` : ""}
                    {e.status === "done" ? ` · thr ${e.runSettings?.threshold ?? "—"}` : ""}
                    {e.status === "done" && e.runSettings
                      ? ` · ${e.runSettings.umPerPx} µm/px`
                      : ""}
                    {e.revision ? ` · rev ${e.revision}` : ""}
                    {e.status === "error" ? " · failed" : ""}
                  </span>
                  {e.updatedAt && (
                    <span className="label-caps block text-primary">
                      updated {new Date(e.updatedAt).toLocaleTimeString()}
                    </span>
                  )}
                </span>
                {e.draft && (
                  <span className="shrink-0 rounded bg-primary/20 px-1 font-mono text-[10px] text-primary">
                    update pending
                  </span>
                )}
                {blankFlags > 0 && (
                  <span className="shrink-0 rounded border border-accent/50 px-1 font-mono text-[10px] text-accent">
                    B{blankFlags}
                  </span>
                )}
                {stale && (
                  <span className="shrink-0 rounded bg-accent/20 px-1 font-mono text-[10px] text-accent">
                    edited
                  </span>
                )}

                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onRemove(e.id);
                  }}
                  className="shrink-0 rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  ✕
                </span>
              </button>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No images added yet.
          </li>
        )}
      </ul>
    </div>
  );
}
