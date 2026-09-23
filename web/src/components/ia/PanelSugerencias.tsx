"use client";

import { useState } from "react";
import type { Sugerencia } from "@/lib/ia/schemas";

type Estado =
  | { tipo: "inicial" }
  | { tipo: "cargando" }
  | { tipo: "ok"; sugerencias: Sugerencia[]; persistido: boolean; consideradas: number }
  | { tipo: "error"; mensaje: string; detalles?: string[] };

const CAMPO: Record<string, string> = {
  escolaridad: "escolaridad",
  descripcion: "descripción",
  fortalezas: "fortalezas",
  areas_oportunidad: "áreas de oportunidad",
  estilo_liderazgo: "estilo de liderazgo",
  vision_estrategica: "visión estratégica",
  analisis_toma_decisiones: "análisis y toma de decisiones",
  idiomas: "idiomas",
  otros_estudios: "otros estudios",
  recomendaciones: "recomendaciones",
  evidencia_no_negociables: "evidencia de no negociables",
};

// Reubicación de un candidato no seleccionado: sugiere otras vacantes abiertas.
// Solo sugiere; no mueve al candidato ni envía nada.
export function PanelSugerencias({ candidatoVacanteId }: { candidatoVacanteId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  async function sugerir() {
    setEstado({ tipo: "cargando" });
    try {
      const r = await fetch("/api/ia/sugerencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_vacante_id: candidatoVacanteId }),
      });
      const j = await r.json();
      setEstado(
        r.ok
          ? { tipo: "ok", sugerencias: j.sugerencias, persistido: j.persistido, consideradas: j.consideradas }
          : { tipo: "error", mensaje: j.error ?? "Error", detalles: j.detalles },
      );
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo contactar al servidor" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">Otras vacantes para su perfil</p>
        <button
          onClick={sugerir}
          disabled={estado.tipo === "cargando"}
          className="whitespace-nowrap rounded-sm bg-[var(--lh-accent)] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {estado.tipo === "cargando" ? "Buscando…" : estado.tipo === "ok" ? "Volver a sugerir" : "Sugerir vacantes"}
        </button>
        {estado.tipo === "ok" && (
          <span className="text-[11px] text-[var(--lh-muted)]">
            {estado.consideradas} vacantes evaluadas
            {!estado.persistido && " · aún no se guardan (pendiente migración)"}
          </span>
        )}
      </div>

      {estado.tipo === "inicial" && (
        <p className="text-xs text-[var(--lh-muted)]">
          Compara el perfil anonimizado con las vacantes abiertas (sin la suya) y propone hasta 3. Solo es una sugerencia:
          no mueve al candidato ni envía nada.
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
      {estado.tipo === "ok" && estado.sugerencias.length === 0 && (
        <p className="text-xs text-[var(--lh-muted)]">Ninguna vacante abierta encaja lo suficiente con este perfil.</p>
      )}
      {estado.tipo === "ok" && estado.sugerencias.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {estado.sugerencias.map((s) => (
            <li key={s.vacante_id_sugerida} className="rounded-sm border border-[var(--lh-rule)] bg-white p-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{s.vacante_titulo}</p>
                <span className="num shrink-0 text-lg font-medium text-[var(--lh-accent)]">{s.score}</span>
              </div>
              <div className="mb-2 mt-1 h-1 rounded-full bg-stone-200">
                <div className="h-1 rounded-full bg-[var(--lh-ink)]" style={{ width: `${s.score}%` }} />
              </div>
              <p className="leading-snug text-[var(--lh-ink-2)]">{s.motivo}</p>
              <p className="num mt-1 text-[11px] text-[var(--lh-muted)]">↳ fuente: ficha · {CAMPO[s.campo_ficha] ?? s.campo_ficha}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
