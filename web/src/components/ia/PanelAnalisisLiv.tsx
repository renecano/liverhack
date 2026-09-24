"use client";

import Image from "next/image";
import { useState } from "react";
import { Info, Quote, RefreshCw, Sparkles } from "lucide-react";
import { analizarConLiv } from "@/lib/actions/analisis";
import type { ResultadoAnalisis } from "@/lib/ia/analisis";

const NOMBRE_FUENTE: Record<string, string> = {
  no_negociables: "Semáforo de no negociables",
  ficha: "Ficha",
  compatibilidad: "Compatibilidad",
  evaluaciones: "Evaluaciones",
  entrevistas: "Entrevistas",
};

type Estado = { tipo: "inicio" } | { tipo: "cargando" } | { tipo: "ok"; a: ResultadoAnalisis } | { tipo: "error"; mensaje: string };

/**
 * Liv como copiloto de análisis del AT: consejo sobre los candidatos (fortalezas relativas,
 * riesgos, cobertura de no negociables), cada punto con su fuente. Se pide a demanda.
 * La decisión es del AT: este panel no toma ni registra decisiones.
 */
export function PanelAnalisisLiv({ ids }: { ids: string[] }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  const varios = ids.length > 1;

  async function pedir() {
    setEstado({ tipo: "cargando" });
    try {
      const r = await analizarConLiv(ids);
      setEstado(r.ok ? { tipo: "ok", a: r.analisis } : { tipo: "error", mensaje: r.error });
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo contactar a Liv." });
    }
  }

  return (
    <section className="surface relative overflow-hidden rounded-3xl p-5" aria-labelledby="liv-analisis">
      <div aria-hidden className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-liv/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-liv-50 to-white ring-1 ring-liv/20">
            <Image src="/Mascota.gif" alt="" width={44} height={44} unoptimized className="scale-[2.3] object-contain" />
          </span>
          <div className="leading-tight">
            <h2 id="liv-analisis" className="text-[16px] font-semibold tracking-[-0.01em]">
              Análisis de Liv {varios ? "de los candidatos comparados" : "del candidato"}
            </h2>
            <p className="text-[12.5px] text-stone-500">Fortalezas relativas, riesgos y cobertura de no negociables</p>
          </div>
        </div>
        {estado.tipo !== "cargando" && (
          <button
            onClick={pedir}
            className="press btn-liv inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            {estado.tipo === "ok" ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {estado.tipo === "ok" ? "Volver a analizar" : "Pedir análisis a Liv"}
          </button>
        )}
      </div>

      <p className="relative mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-900 ring-1 ring-amber-600/15">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Sugerencia para tu decisión; la decisión es tuya.</strong> Liv solo resume los datos registrados (ficha, semáforo,
          evaluaciones y entrevistas) y cita de dónde sale cada punto. No toma ni registra decisiones.
        </span>
      </p>

      {estado.tipo === "cargando" && (
        <p role="status" className="relative mt-4 flex items-center gap-2 text-[13px] text-stone-500">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-liv border-t-transparent" />
          Liv está revisando fichas, semáforos y entrevistas…
        </p>
      )}
      {estado.tipo === "error" && <p className="relative mt-4 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">{estado.mensaje}</p>}

      {estado.tipo === "ok" && (
        <div className="relative mt-4 space-y-4">
          <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-stone-900/5">
            <p className="text-[14px] leading-relaxed text-stone-800">{estado.a.resumen}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-700">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">No negociables</span>
              {estado.a.no_negociables}
            </p>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {estado.a.candidatos.map((c) => (
              <article key={c.id} className="rounded-2xl bg-white/80 p-4 ring-1 ring-stone-900/5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">{c.nombre}</h3>
                  <span className="tabular text-[11.5px] text-stone-500" title="Cumple · parcial · no cumple (código, no IA)">
                    <span className="text-emerald-700">✓{c.cobertura.cumple}</span> · <span className="text-amber-700">~{c.cobertura.parcial}</span> ·{" "}
                    <span className="text-rose-700">✗{c.cobertura.no_cumple}</span> de {c.cobertura.total}
                  </span>
                </div>
                <Puntos titulo="Fortalezas" tono="text-emerald-700" puntos={c.fortalezas} />
                <Puntos titulo="Riesgos a validar" tono="text-rose-700" puntos={c.riesgos} />
              </article>
            ))}
          </div>

          <p className="text-[11.5px] text-stone-400">
            Basado en: {estado.a.fuentes.map((f) => NOMBRE_FUENTE[f] ?? f).join(" · ")}
            {estado.a.generado_por === "respaldo" ? " · resumen directo de los datos (Liv no respondió a tiempo)" : " · evaluación ciega (sin nombres ni datos personales)"}
          </p>
        </div>
      )}
    </section>
  );
}

function Puntos({ titulo, tono, puntos }: { titulo: string; tono: string; puntos: ResultadoAnalisis["candidatos"][number]["fortalezas"] }) {
  if (!puntos.length) return null;
  return (
    <div className="mt-3">
      <p className={`text-[11px] font-semibold uppercase tracking-[.12em] ${tono}`}>{titulo}</p>
      <ul className="mt-1.5 space-y-2">
        {puntos.map((p, i) => (
          <li key={i} className="text-[13px] leading-snug text-stone-700">
            {p.texto}
            <span className="mt-0.5 flex gap-1 font-mono text-[10.5px] leading-snug text-stone-400">
              <Quote className="mt-0.5 h-3 w-3 shrink-0" />
              {NOMBRE_FUENTE[p.fuente] ?? p.fuente}: «{p.evidencia}»
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
