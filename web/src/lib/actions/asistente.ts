"use server";

// Liv, el asistente del proceso (agente 8): responde preguntas libres sobre el proceso
// de quien pregunta. Solo lee y guía. Los datos salen del orquestador (resumenVacantes:
// semáforos, compuertas ESPERANDO_HM_*, quién bloquea) sobre las vacantes que la persona
// ve por RLS y le tocan por su rol (HM, AT o HRBP de la vacante; admin: todas).

import { z } from "zod";
import { sesion } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumenVacantes } from "@/lib/orquestador/resumen";
import { responderAsistente, type CandidatoVisible, type DecisionVisible, type ResultadoAsistente } from "@/lib/ia/asistente";
import type { EtapaProceso, RolUsuario } from "@/lib/supabase/types";

const Pregunta = z.string().trim().min(1).max(500);

// Columna de la vacante que define "mis vacantes" para cada rol.
const COLUMNA_ROL: Partial<Record<RolUsuario, "hm_id" | "at_id" | "hrbp_id">> = { hm: "hm_id", at: "at_id", hrbp: "hrbp_id" };
const ROLES_LIV: RolUsuario[] = ["hm", "at", "hrbp", "admin"];

type Respuesta = ({ ok: true } & ResultadoAsistente) | { ok: false; error: string };

export async function preguntarAsistente(pregunta: string): Promise<Respuesta> {
  const s = await sesion();
  if (!s) return { ok: false, error: "Inicia sesión" };
  if (!ROLES_LIV.includes(s.usuario.rol)) return { ok: false, error: "Liv responde sobre vacantes; tus entrevistas están en «Mis entrevistas»." };
  const p = Pregunta.safeParse(pregunta);
  if (!p.success) return { ok: false, error: "Escribe una pregunta (máx. 500 caracteres)" };

  try {
    // Vacantes visibles por RLS que le tocan por su rol (admin: todas las visibles).
    let q = s.supabase.from("vacantes").select("id");
    const columna = COLUMNA_ROL[s.usuario.rol];
    if (columna) q = q.eq(columna, s.usuario.id);
    const { data: visibles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (visibles ?? []).map((v) => v.id as string);

    // Solo vacantes activas (resumenVacantes excluye cubiertas/canceladas).
    const vacantes = ids.length ? await resumenVacantes({ db: createAdminClient(), ids }) : [];
    const activas = vacantes.map((v) => v.id);

    // Lecturas con la sesión: RLS decide qué candidatos, decisiones y avisos se ven.
    const [candidatosRes, decisionesRes, borradoresRes, perfil] = await Promise.all([
      activas.length
        ? s.supabase
            .from("candidato_vacante")
            .select("vacante_id, estatus, etapa, fit_score, es_referido, candidatos(nombre), vacantes(titulo)")
            .in("vacante_id", activas)
        : Promise.resolve({ data: [] as unknown[] }),
      activas.length
        ? s.supabase
            .from("decisiones")
            .select("decision, ts, candidatos(nombre), vacantes(titulo)")
            .in("vacante_id", activas)
            .order("ts", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as unknown[] }),
      activas.length
        ? s.supabase
            .from("notificaciones")
            .select("id", { count: "exact", head: true })
            .eq("estatus", "borrador")
            .eq("destinatario_tipo", "candidato")
            .in("vacante_id", activas)
        : Promise.resolve({ count: 0 }),
      s.supabase.from("usuarios").select("nombre").eq("id", s.usuario.id).maybeSingle(),
    ]);

    type Uno<T> = T | T[] | null;
    const uno = <T,>(x: Uno<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
    type FilaCand = { vacante_id: string; estatus: string; etapa: EtapaProceso; fit_score: number | null; es_referido: boolean; candidatos: Uno<{ nombre: string }>; vacantes: Uno<{ titulo: string }> };
    type FilaDec = { decision: string; ts: string; candidatos: Uno<{ nombre: string }>; vacantes: Uno<{ titulo: string }> };
    const candidatos: CandidatoVisible[] = ((candidatosRes.data ?? []) as FilaCand[])
      .filter((c) => c.estatus !== "descartado")
      .map((c) => ({
        nombre: uno(c.candidatos)?.nombre ?? "—",
        vacante: uno(c.vacantes)?.titulo ?? "—",
        estatus: c.estatus,
        etapa: c.etapa,
        fit_score: c.fit_score,
        es_referido: c.es_referido,
      }));
    const decisiones: DecisionVisible[] = ((decisionesRes.data ?? []) as FilaDec[]).map((d) => ({
      fecha: d.ts.slice(0, 10),
      decision: d.decision,
      candidato: uno(d.candidatos)?.nombre ?? "—",
      vacante: uno(d.vacantes)?.titulo ?? "—",
    }));

    // Candidatos por decidir en las compuertas de finalista.
    const porDecidir: Record<string, number> = {};
    const enDecision = new Set(vacantes.filter((v) => v.estado === "ESPERANDO_HM_DECIDE_FINALISTA").map((v) => v.id));
    for (const c of (candidatosRes.data ?? []) as FilaCand[]) {
      if (enDecision.has(c.vacante_id) && (c.estatus === "activo" || c.estatus === "finalista")) porDecidir[c.vacante_id] = (porDecidir[c.vacante_id] ?? 0) + 1;
    }

    const r = await responderAsistente({
      pregunta: p.data,
      vacantes,
      porDecidir,
      borradoresPendientes: ("count" in borradoresRes ? borradoresRes.count : 0) ?? 0,
      candidatos,
      decisiones,
      yo: { id: s.usuario.id, rol: s.usuario.rol },
      nombre: (perfil.data?.nombre as string | undefined)?.split(/\s+/)[0],
      actor: { id: s.usuario.id, rol: s.usuario.rol },
    });
    return { ok: true, ...r };
  } catch (e) {
    console.error("[asistente]", e);
    return { ok: false, error: "No pude leer tu proceso en este momento. Intenta de nuevo." };
  }
}
