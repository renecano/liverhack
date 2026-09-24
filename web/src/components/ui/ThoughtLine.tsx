import { Check, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";

export type EstadoPaso = "pendiente" | "activo" | "hecho" | "error";

export interface PasoThought {
  id: string;
  titulo: string;
  detalle?: ReactNode;
  estado: EstadoPaso;
}

/**
 * Thought Line: línea de tiempo vertical que hace visible lo que hace la IA.
 * El riel se "llena" en rosa hasta el paso activo; el paso activo respira y
 * muestra un flujo animado. Presentacional: el estado lo decide quien la usa.
 */
export function ThoughtLine({ pasos, className = "" }: { pasos: PasoThought[]; className?: string }) {
  return (
    <ol className={`relative ${className}`}>
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1;
        const siguiente = pasos[i + 1];
        const rielLleno = p.estado === "hecho" && siguiente && siguiente.estado !== "pendiente";
        return (
          <li key={p.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!ultimo && (
              <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-[2px] overflow-hidden rounded-full bg-stone-200">
                <span
                  className="block w-full origin-top rounded-full bg-gradient-to-b from-liv to-pink-400 transition-transform duration-700 ease-glide"
                  style={{ height: "100%", transform: `scaleY(${rielLleno ? 1 : p.estado === "activo" ? 0.35 : 0})` }}
                />
              </span>
            )}
            <span
              className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all duration-500 ease-spring ${
                p.estado === "hecho"
                  ? "border-liv bg-liv text-white"
                  : p.estado === "activo"
                    ? "pulse-liv border-liv bg-white text-liv"
                    : p.estado === "error"
                      ? "border-rose-500 bg-rose-500 text-white"
                      : "border-stone-200 bg-white text-stone-300"
              }`}
            >
              {p.estado === "hecho" ? (
                <Check className="h-4 w-4 animate-pop" strokeWidth={3} />
              ) : p.estado === "activo" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : p.estado === "error" ? (
                <X className="h-4 w-4" strokeWidth={3} />
              ) : (
                <span className="tabular text-[11px] font-semibold">{i + 1}</span>
              )}
            </span>
            <div className={`min-w-0 pt-1 transition-opacity duration-500 ${p.estado === "pendiente" ? "opacity-45" : "opacity-100"}`}>
              <p className={`text-[14px] font-semibold leading-tight ${p.estado === "error" ? "text-rose-700" : "text-stone-900"}`}>{p.titulo}</p>
              {p.detalle && <div className="mt-1 text-[12.5px] leading-snug text-stone-500">{p.detalle}</div>}
              {p.estado === "activo" && (
                <span aria-hidden className="mt-2 block h-1 w-40 overflow-hidden rounded-full bg-liv-100">
                  <span className="skeleton block h-full w-full opacity-70" style={{ background: "linear-gradient(90deg, transparent, #e2007a, transparent)", backgroundSize: "200% 100%" }} />
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
