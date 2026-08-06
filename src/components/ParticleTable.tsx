import type { Particle } from "@/lib/particle-analysis";

const MORPH_CLASS: Record<string, string> = {
  fibre: "text-fibre",
  sphere: "text-sphere",
  pellet: "text-pellet",
  fragment: "text-fragment",
};

interface Props {
  particles: Particle[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggleReject: (id: number) => void;
}

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export function ParticleTable({ particles, selectedId, onSelect, onToggleReject }: Props) {
  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Particle measurements</h3>
        <span className="label-caps">{particles.length} detected</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="label-caps text-left">
              {[
                "#",
                "Area µm²",
                "Perim µm",
                "W µm",
                "H µm",
                "Feret µm",
                "AR",
                "Circ",
                "Class",
                "Use",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {particles.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`cursor-pointer border-b border-border/60 transition-colors ${
                  p.id === selectedId ? "bg-secondary" : "hover:bg-muted/60"
                } ${p.rejected ? "opacity-45 line-through" : ""}`}
              >
                <td className="px-2 py-1 text-muted-foreground">{p.id}</td>
                <td className="px-2 py-1">{n(p.area)}</td>
                <td className="px-2 py-1">{n(p.perimeter)}</td>
                <td className="px-2 py-1">{n(p.width)}</td>
                <td className="px-2 py-1">{n(p.height)}</td>
                <td className="px-2 py-1">{n(p.feret)}</td>
                <td className="px-2 py-1">{n(p.aspectRatio, 3)}</td>
                <td className="px-2 py-1">{n(p.circularity, 3)}</td>
                <td className={`px-2 py-1 font-semibold ${MORPH_CLASS[p.morphology] ?? ""}`}>
                  {p.morphology}
                </td>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={!p.rejected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleReject(p.id)}
                    className="accent-primary"
                  />
                </td>
              </tr>
            ))}
            {particles.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  No particles for this image.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
