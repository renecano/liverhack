import type { NoNegociableVista } from "@/lib/ia/consultas";

const COLOR = {
  cumple: "bg-[var(--lh-ok)]",
  parcial: "bg-[var(--lh-warn)]",
  no_cumple: "bg-[var(--lh-bad)]",
} as const;
export const ETIQUETA = { cumple: "Cumple", parcial: "Parcial", no_cumple: "No cumple" } as const;

export function Punto({ estado }: { estado: NoNegociableVista["estado"] }) {
  return (
    <span
      className={`inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white ${estado ? COLOR[estado] : "bg-stone-300"}`}
      aria-label={estado ? ETIQUETA[estado] : "Sin evaluar"}
    />
  );
}

// Semáforo compacto de los 3 no negociables (verde/amarillo/rojo).
export function Semaforo({ items }: { items: NoNegociableVista[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {items.map((n) => (
        <span key={n.id} title={`${n.texto}\n${n.estado ? ETIQUETA[n.estado] : "Sin evaluar"}${n.evidencia ? ` — ${n.evidencia}` : ""}`}>
          <Punto estado={n.estado} />
        </span>
      ))}
    </div>
  );
}

// Detalle con evidencia y cita de origen de cada no negociable.
export function SemaforoDetalle({ items }: { items: NoNegociableVista[] }) {
  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.id} className="flex gap-2.5">
          <span className="mt-1"><Punto estado={n.estado} /></span>
          <div className="min-w-0 text-[13px] leading-snug">
            <p className="font-medium">
              {n.texto}{" "}
              <span className="font-normal text-[var(--lh-muted)]">· {n.estado ? ETIQUETA[n.estado] : "Sin evaluar"}</span>
            </p>
            {n.evidencia && <p className="text-[var(--lh-ink-2)]">{n.evidencia}</p>}
            {n.cita && <p className="num text-[11px] text-[var(--lh-muted)]">↳ {n.cita}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
