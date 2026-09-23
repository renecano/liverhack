"use client";

import { useEffect, useState } from "react";
import type { SugerenciaGuardada } from "@/lib/ia/sugeridor";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "listo"; sugerencias: SugerenciaGuardada[]; consideradas?: number }
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

const ESTATUS: Record<SugerenciaGuardada["estatus"], string> = {
  sugerida: "bg-stone-100 text-stone-700",
  aceptada: "bg-green-100 text-green-900",
  descartada: "bg-stone-200 text-stone-500 line-through",
};

async function leerGuardadas(candidatoVacanteId: string, consideradas?: number): Promise<Estado> {
  try {
    const r = await fetch(`/api/ia/sugerencias?candidato_vacante_id=${candidatoVacanteId}`);
    const j = await r.json();
    return r.ok ? { tipo: "listo", sugerencias: j.sugerencias, consideradas } : { tipo: "error", mensaje: j.error ?? "Error" };
  } catch {
    return { tipo: "error", mensaje: "No se pudo contactar al servidor" };
  }
}

// Reubicación de un candidato no seleccionado. Al abrir muestra lo guardado;
// "Volver a sugerir" recalcula y reemplaza las 'sugerida'. Solo sugiere: no mueve
// al candidato ni envía nada.
export function PanelSugerencias({ candidatoVacanteId }: { candidatoVacanteId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [sugiriendo, setSugiriendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerGuardadas(candidatoVacanteId).then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [candidatoVacanteId]);

  async function sugerir() {
    setSugiriendo(true);
    try {
      const r = await fetch("/api/ia/sugerencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_vacante_id: candidatoVacanteId }),
      });
      const j = await r.json();
      if (r.ok) setEstado(await leerGuardadas(candidatoVacanteId, j.consideradas));
      else setEstado({ tipo: "error", mensaje: j.error ?? "Error", detalles: j.detalles });
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo contactar al servidor" });
    } finally {
      setSugiriendo(false);
    }
  }

  const sugerencias = estado.tipo === "listo" ? estado.sugerencias : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">Otras vacantes para su perfil</p>
        <button
          onClick={sugerir}
          disabled={sugiriendo || estado.tipo === "cargando"}
          className="whitespace-nowrap rounded-sm bg-[var(--lh-accent)] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60"
        >
          {sugiriendo ? "Buscando…" : sugerencias.length ? "Volver a sugerir" : "Sugerir vacantes"}
        </button>
        {estado.tipo === "listo" && estado.consideradas !== undefined && (
          <span className="text-[11px] text-[var(--lh-muted)]">{estado.consideradas} vacantes evaluadas</span>
        )}
      </div>

      {estado.tipo === "cargando" && <p className="text-xs text-[var(--lh-muted)]">Cargando sugerencias guardadas…</p>}
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
      {estado.tipo === "listo" && sugerencias.length === 0 && (
        <p className="text-xs text-[var(--lh-muted)]">
          Sin sugerencias guardadas. La IA compara el perfil anonimizado con las vacantes abiertas (sin la suya) y propone
          hasta 3; puede no encontrar ninguna que encaje.
        </p>
      )}
      {sugerencias.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sugerencias.map((s) => (
            <li key={s.vacante_id_sugerida} className="rounded-sm border border-[var(--lh-rule)] bg-white p-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{s.vacante_titulo}</p>
                <span className="num shrink-0 text-lg font-medium text-[var(--lh-accent)]">{s.score ?? "—"}</span>
              </div>
              <div className="mb-2 mt-1 h-1 rounded-full bg-stone-200">
                <div className="h-1 rounded-full bg-[var(--lh-ink)]" style={{ width: `${s.score ?? 0}%` }} />
              </div>
              <p className="leading-snug text-[var(--lh-ink-2)]">{s.motivo}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`rounded-sm px-1.5 py-0.5 ${ESTATUS[s.estatus]}`}>{s.estatus}</span>
                {s.campo_ficha && (
                  <span className="num text-[var(--lh-muted)]">↳ fuente: ficha · {CAMPO[s.campo_ficha] ?? s.campo_ficha}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
