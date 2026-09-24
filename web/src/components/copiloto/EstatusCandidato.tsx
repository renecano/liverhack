"use client";

import { useEffect, useState } from "react";
import { Search, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ETAPAS, NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import type { EtapaProceso } from "@/lib/supabase/types";

type Fila = {
  id: string;
  etapa: EtapaProceso;
  estatus: string;
  fit_score: number | null;
  es_referido: boolean;
  candidatos: { nombre: string } | { nombre: string }[] | null;
  vacantes: { titulo: string } | { titulo: string }[] | null;
};

const uno = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

const ESTATUS: Record<string, string> = {
  activo: "bg-sky-50 text-sky-700 ring-sky-600/15",
  finalista: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  contratado: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  pool: "bg-stone-100 text-stone-600 ring-stone-600/10",
  descartado: "bg-rose-50 text-rose-700 ring-rose-600/15",
};

/** Consulta rápida de estatus. Lee con la sesión del navegador: RLS decide qué candidatos ve cada rol. */
export function EstatusCandidato() {
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const termino = q.trim();

  useEffect(() => {
    if (termino.length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const { data, error } = await createClient()
        .from("candidato_vacante")
        .select("id, etapa, estatus, fit_score, es_referido, candidatos!inner(nombre), vacantes!inner(titulo)")
        .ilike("candidatos.nombre", `%${termino.replace(/[%_]/g, "")}%`)
        .limit(8);
      if (!vivo) return;
      setError(error ? "No se pudo consultar el estatus." : null);
      setFilas((data as Fila[] | null) ?? []);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termino]);

  const visibles = termino.length >= 2 ? filas : null;

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <label className="flex items-center gap-2 rounded-2xl border border-stone-900/10 bg-white px-3.5 py-2.5 shadow-sm focus-within:border-liv/50 focus-within:ring-4 focus-within:ring-liv/10">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del candidato…"
            aria-label="Buscar candidato"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-stone-400"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {!visibles && <p className="px-1 pt-2 text-[12.5px] text-stone-400">Escribe al menos 2 letras. Verás etapa, estatus y compatibilidad de cada proceso.</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-[12.5px] text-rose-700">{error}</p>}
        {visibles && visibles.length === 0 && !error && <p className="px-1 pt-2 text-[12.5px] text-stone-400">Sin coincidencias visibles para tu rol.</p>}
        {visibles?.map((f, i) => {
          const idx = ETAPAS.indexOf(f.etapa);
          return (
            <article key={f.id} className="animate-rise rounded-2xl border border-stone-900/[0.06] bg-white p-3 shadow-sm" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                    {uno(f.candidatos)?.nombre}
                    {f.es_referido && <Star className="h-3.5 w-3.5 fill-liv text-liv" aria-label="Referido" />}
                  </p>
                  <p className="truncate text-[12px] text-stone-500">{uno(f.vacantes)?.titulo}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${ESTATUS[f.estatus] ?? ESTATUS.pool}`}>{f.estatus}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1" aria-label={`Etapa: ${NOMBRE_ETAPA[f.etapa]}`}>
                {ETAPAS.map((e, j) => (
                  <span key={e} className={`h-1 flex-1 rounded-full ${j < idx ? "bg-liv/50" : j === idx ? "bg-liv" : "bg-stone-200"}`} />
                ))}
              </div>
              <p className="mt-1.5 flex justify-between text-[11.5px] text-stone-500">
                <span>{NOMBRE_ETAPA[f.etapa]}</span>
                <span className="tabular">Fit {f.fit_score ?? "—"}</span>
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
