"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareText, Sparkles } from "lucide-react";
import type { FilaCandidato } from "@/lib/ia/consultas";
import type { PreguntaGuardada } from "@/lib/ia/schemas";
import { BadgeReferido } from "@/components/ia/BadgeReferido";
import { BotonCv } from "@/components/ia/BotonCv";
import { PreguntasEntrevista } from "@/components/ia/PreguntasEntrevista";
import { SemaforoDetalle } from "@/components/ia/Semaforo";
import { Ring } from "@/components/ui/Ring";

/** Panel izquierdo de la entrevista: resumen del candidato + preguntas sugeridas por IA. */
export function FichaEntrevista({ ficha, preguntas }: { ficha: FilaCandidato | null; preguntas: PreguntaGuardada[] }) {
  const [verPreguntas, setVerPreguntas] = useState(true);
  if (!ficha) {
    return <div className="surface rounded-3xl p-6 text-[13.5px] text-stone-500">No se encontró la ficha del candidato para esta vacante.</div>;
  }
  const f = ficha.ficha;
  return (
    <div className="space-y-4">
      <section className="animate-rise surface relative overflow-hidden rounded-3xl p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-liv/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <Ring valor={ficha.fit_score} size={64} stroke={6} destacado label="Compatibilidad (Potencial Global)" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{ficha.nombre}</h1>
              {ficha.es_referido && <BadgeReferido />}
            </div>
            <p className="mt-0.5 text-[13px] text-stone-500">
              {ficha.puesto_actual ?? "—"}
              {ficha.empresa_actual ? ` · ${ficha.empresa_actual}` : ""}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[12px] text-stone-500">{ficha.escolaridad ?? ""}</span>
              {ficha.tiene_cv && <BotonCv candidatoId={ficha.candidato_id} nombre={ficha.nombre} />}
            </div>
          </div>
        </div>
        {f.descripcion && <p className="relative mt-4 text-[13.5px] leading-relaxed text-stone-700">{f.descripcion}</p>}
        <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
          <Bloque titulo="Fortalezas" items={f.fortalezas} tono="ok" />
          <Bloque titulo="Áreas de oportunidad" items={f.areas_oportunidad} tono="warn" />
        </div>
      </section>

      <section className="animate-rise surface rounded-3xl p-6 [animation-delay:80ms]">
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[.14em] text-stone-400">No negociables · evidencia y cita</p>
        <SemaforoDetalle items={ficha.no_negociables} />
      </section>

      <section className="animate-rise surface overflow-hidden rounded-3xl [animation-delay:160ms]">
        <button
          onClick={() => setVerPreguntas((v) => !v)}
          aria-expanded={verPreguntas}
          className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-stone-900/[0.015]"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-liv-50 text-liv ring-1 ring-liv/15">
              <MessageSquareText className="h-4 w-4" />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                Preguntas sugeridas <Sparkles className="h-3.5 w-3.5 text-liv" />
              </span>
              <span className="block text-[12px] text-stone-500">{preguntas.length} preguntas desde el CV y los no negociables</span>
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-500 ease-spring ${verPreguntas ? "rotate-180" : ""}`} />
        </button>
        {verPreguntas && (
          <div className="animate-rise border-t hairline p-5">
            {preguntas.length ? (
              <PreguntasEntrevista preguntas={preguntas} noNegociables={ficha.no_negociables} />
            ) : (
              <p className="text-[13px] text-stone-500">Aún no hay preguntas generadas para este candidato. El AT puede generarlas desde la lista.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Bloque({ titulo, items, tono }: { titulo: string; items?: string[]; tono: "ok" | "warn" }) {
  if (!items?.length) return null;
  return (
    <div className={`rounded-2xl p-3 ring-1 ring-inset ${tono === "ok" ? "bg-emerald-50/60 ring-emerald-600/10" : "bg-amber-50/60 ring-amber-600/15"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[.12em] ${tono === "ok" ? "text-emerald-700" : "text-amber-800"}`}>{titulo}</p>
      <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-stone-700">
        {items.slice(0, 4).map((x) => (
          <li key={x}>· {x}</li>
        ))}
      </ul>
    </div>
  );
}
