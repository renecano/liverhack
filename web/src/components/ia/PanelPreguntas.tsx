"use client";

import { useState } from "react";
import type { Pregunta, TipoEntrevista } from "@/lib/ia/schemas";
import { PreguntasEntrevista } from "./PreguntasEntrevista";

type Estado =
  | { tipo: "inicial" }
  | { tipo: "cargando" }
  | { tipo: "ok"; preguntas: Pregunta[]; persistido: boolean; intentos: number }
  | { tipo: "error"; mensaje: string; detalles?: string[] };

// Genera/regenera preguntas desde la lista de candidatos y muestra el resultado.
export function PanelPreguntas({
  candidatoVacanteId,
  noNegociables,
}: {
  candidatoVacanteId: string;
  noNegociables: { id: string; texto: string }[];
}) {
  const [tipo, setTipo] = useState<TipoEntrevista>("competencias");
  const [porTipo, setPorTipo] = useState<Partial<Record<TipoEntrevista, Estado>>>({});
  const estado = porTipo[tipo] ?? { tipo: "inicial" };

  async function generar() {
    const t = tipo;
    setPorTipo((s) => ({ ...s, [t]: { tipo: "cargando" } }));
    try {
      const r = await fetch("/api/ia/preguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_vacante_id: candidatoVacanteId, tipo: t }),
      });
      const j = await r.json();
      setPorTipo((s) => ({
        ...s,
        [t]: r.ok
          ? { tipo: "ok", preguntas: j.preguntas, persistido: j.persistido, intentos: j.intentos }
          : { tipo: "error", mensaje: j.error ?? "Error", detalles: j.detalles },
      }));
    } catch {
      setPorTipo((s) => ({ ...s, [t]: { tipo: "error", mensaje: "No se pudo contactar al servidor" } }));
    }
  }

  const generado = estado.tipo === "ok";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">Preguntas de entrevista</p>
        <div className="flex overflow-hidden rounded-sm border border-[var(--lh-rule)] text-xs" role="group" aria-label="Tipo de entrevista">
          {(["competencias", "panel"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
              className={`px-3 py-1 capitalize ${tipo === t ? "bg-[var(--lh-ink)] text-white" : "bg-white hover:bg-stone-100"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={generar}
          disabled={estado.tipo === "cargando"}
          className="whitespace-nowrap rounded-sm bg-[var(--lh-accent)] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {estado.tipo === "cargando" ? "Generando…" : generado ? "Regenerar" : "Generar preguntas"}
        </button>
        {estado.tipo === "ok" && (
          <span className="text-[11px] text-[var(--lh-muted)]">
            {estado.preguntas.length} preguntas · {estado.intentos} intento{estado.intentos > 1 ? "s" : ""}
            {!estado.persistido && " · aún no se guardan (pendiente migración)"}
          </span>
        )}
      </div>

      {estado.tipo === "inicial" && (
        <p className="text-xs text-[var(--lh-muted)]">
          La IA propone 6-10 preguntas desde la ficha anonimizada: valida cada no negociable (sobre todo los parciales)
          y explora las áreas de oportunidad.
        </p>
      )}
      {estado.tipo === "error" && (
        <div className="rounded-sm border border-[var(--lh-bad)] bg-red-50 p-3 text-xs">
          <p className="font-medium text-[var(--lh-bad)]">{estado.mensaje}</p>
          {estado.detalles && (
            <ul className="mt-1 list-disc pl-4 text-[var(--lh-ink-2)]">
              {estado.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {estado.tipo === "ok" && <PreguntasEntrevista preguntas={estado.preguntas} noNegociables={noNegociables} />}
    </div>
  );
}
