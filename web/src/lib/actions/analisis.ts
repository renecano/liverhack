"use server";

// Liv como copiloto de análisis del AT: consejo sobre los candidatos elegidos. Solo lee
// (sesión/RLS) y devuelve el análisis; no toma ni registra decisiones.

import { z } from "zod";
import { sesion } from "@/lib/auth/sesion";
import { analizarCandidatos, type EntrevistaResumen, type ResultadoAnalisis } from "@/lib/ia/analisis";
import { obtenerCandidatos } from "@/lib/ia/consultas";

const Ids = z.array(z.guid()).min(1).max(6);

export async function analizarConLiv(ids: string[]): Promise<{ ok: true; analisis: ResultadoAnalisis } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s) return { ok: false, error: "Inicia sesión" };
  if (s.usuario.rol !== "at" && s.usuario.rol !== "admin") return { ok: false, error: "El análisis de Liv es para Atracción de Talento." };
  const p = Ids.safeParse([...new Set(ids)]);
  if (!p.success) return { ok: false, error: "Elige de 1 a 6 candidatos." };

  try {
    const cands = await obtenerCandidatos(s.supabase, p.data);
    if (!cands.length) return { ok: false, error: "No encontré a esos candidatos." };

    // Veredictos de sus entrevistas (RLS), por candidato_vacante.
    const { data } = await s.supabase
      .from("feedback_entrevista")
      .select("candidato_id, veredicto, notas, entrevistas(vacante_id)")
      .in("candidato_id", cands.map((c) => c.candidato_id));
    const entrevistas: Record<string, EntrevistaResumen[]> = {};
    type Fila = { candidato_id: string; veredicto: string | null; notas: string | null; entrevistas: { vacante_id: string } | { vacante_id: string }[] | null };
    for (const f of (data ?? []) as Fila[]) {
      const e = Array.isArray(f.entrevistas) ? f.entrevistas[0] : f.entrevistas;
      const c = cands.find((x) => x.candidato_id === f.candidato_id && x.vacante_id === e?.vacante_id);
      if (c) (entrevistas[c.id] ??= []).push({ veredicto: f.veredicto, notas: f.notas });
    }

    const analisis = await analizarCandidatos(cands, entrevistas, { id: s.usuario.id, rol: s.usuario.rol });
    return { ok: true, analisis };
  } catch (e) {
    console.error("[analisis-liv]", e);
    return { ok: false, error: "Liv no pudo analizar a los candidatos en este momento." };
  }
}
