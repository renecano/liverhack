"use server";

// Asistente del HM (agente 8): "¿qué tengo que hacer hoy?". Solo lee y guía.
// Los datos salen del orquestador (resumenVacantes: semáforos, compuertas
// ESPERANDO_HM_*, quién bloquea) sobre las vacantes que el HM ve por RLS.

import { z } from "zod";
import { sesion } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumenVacantes } from "@/lib/orquestador/resumen";
import { responderAsistenteHM, type ResultadoAsistente } from "@/lib/ia/asistente";

const Pregunta = z.string().trim().min(1).max(500);

export async function preguntarAsistenteHM(
  pregunta: string,
): Promise<({ ok: true } & ResultadoAsistente) | { ok: false; error: string }> {
  const s = await sesion();
  if (!s) return { ok: false, error: "Inicia sesión" };
  if (s.usuario.rol !== "hm" && s.usuario.rol !== "admin") return { ok: false, error: "El asistente es para Hiring Managers" };
  const p = Pregunta.safeParse(pregunta);
  if (!p.success) return { ok: false, error: "Escribe una pregunta (máx. 500 caracteres)" };

  try {
    // Vacantes del HM visibles por RLS (admin: todas las visibles).
    let q = s.supabase.from("vacantes").select("id");
    if (s.usuario.rol === "hm") q = q.eq("hm_id", s.usuario.id);
    const { data: visibles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (visibles ?? []).map((v) => v.id as string);

    const vacantes = ids.length ? await resumenVacantes({ db: createAdminClient(), ids }) : [];

    // Candidatos por decidir en las compuertas de finalista (con la sesión: RLS).
    const porDecidir: Record<string, number> = {};
    const enDecision = vacantes.filter((v) => v.estado === "ESPERANDO_HM_DECIDE_FINALISTA").map((v) => v.id);
    if (enDecision.length) {
      const { data } = await s.supabase
        .from("candidato_vacante")
        .select("vacante_id")
        .in("vacante_id", enDecision)
        .in("estatus", ["activo", "finalista"]);
      for (const r of data ?? []) porDecidir[r.vacante_id as string] = (porDecidir[r.vacante_id as string] ?? 0) + 1;
    }

    // Avisos a candidatos en borrador para sus vacantes (cero ghosting).
    const { count: borradoresPendientes } = ids.length
      ? await s.supabase
          .from("notificaciones")
          .select("id", { count: "exact", head: true })
          .eq("estatus", "borrador")
          .eq("destinatario_tipo", "candidato")
          .in("vacante_id", ids)
      : { count: 0 };

    const r = await responderAsistenteHM({
      pregunta: p.data,
      vacantes,
      porDecidir,
      borradoresPendientes: borradoresPendientes ?? 0,
      actor: { id: s.usuario.id, rol: s.usuario.rol },
    });
    return { ok: true, ...r };
  } catch (e) {
    console.error("[asistente-hm]", e);
    return { ok: false, error: "No pude leer tus pendientes en este momento. Intenta de nuevo." };
  }
}
