"use server";

// Server actions del dominio Proceso. Autentican con la sesión (cliente de servidor,
// respeta RLS) y ejecutan el orquestador con el cliente de servicio: el orquestador es
// la autoridad que escribe audit_log, notificaciones y etapas (RLS no deja al HM
// escribir notificaciones ni vacante_etapas directamente).

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario, TipoDecision } from "@/lib/supabase/types";
import {
  ErrorProceso,
  avanzarEtapa as avanzarEtapaOrq,
  confirmarPasoHM as confirmarPasoHMOrq,
  registrarDecision as registrarDecisionOrq,
  type ResultadoCambio,
  type ResultadoDecision,
} from "@/lib/orquestador/maquina";
import { resumenVacantes, type ResumenVacante } from "@/lib/orquestador/resumen";
import { DECISIONES } from "@/lib/orquestador/estados";

export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; codigo: string; error: string };

const id = z.guid();

async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, rol, activo")
    .eq("id", user.id)
    .maybeSingle();
  if (!usuario?.activo) return null;
  return { supabase, usuario: usuario as { id: string; rol: RolUsuario } };
}

async function puedeVerVacante(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vacanteId: string,
): Promise<boolean> {
  const { data } = await supabase.from("vacantes").select("id").eq("id", vacanteId).maybeSingle();
  return !!data;
}

function fallo(e: unknown): { ok: false; codigo: string; error: string } {
  if (e instanceof ErrorProceso) return { ok: false, codigo: e.codigo, error: e.message };
  console.error("[proceso]", e);
  return { ok: false, codigo: "ERROR", error: "Error inesperado en el orquestador" };
}

const NO_AUTENTICADO = { ok: false, codigo: "NO_AUTENTICADO", error: "Inicia sesión" } as const;
const NO_AUTORIZADO = { ok: false, codigo: "NO_AUTORIZADO", error: "Sin permiso sobre esta vacante" } as const;

/** AT / HRBP avanzan el tramo operativo. Nunca cruza una compuerta ESPERANDO_HM_*. */
export async function avanzarEtapa(vacanteId: string): Promise<Resultado<ResultadoCambio>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  if (!id.safeParse(vacanteId).success) return { ok: false, codigo: "INVALIDO", error: "vacante_id inválido" };
  if (!["at", "hrbp", "admin"].includes(s.usuario.rol) || !(await puedeVerVacante(s.supabase, vacanteId))) {
    return NO_AUTORIZADO;
  }
  try {
    const data = await avanzarEtapaOrq(vacanteId, {
      db: createAdminClient(),
      actor: { id: s.usuario.id, rol: s.usuario.rol },
    });
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

/** El HM resuelve una compuerta a nivel vacante (valida NNN, perfiles, pool). */
export async function confirmarPasoHM(
  vacanteId: string,
  justificacion: string,
): Promise<Resultado<ResultadoCambio>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  if (!id.safeParse(vacanteId).success) return { ok: false, codigo: "INVALIDO", error: "vacante_id inválido" };
  if (s.usuario.rol !== "hm") return NO_AUTORIZADO;
  try {
    const data = await confirmarPasoHMOrq(vacanteId, s.usuario.id, justificacion, {
      db: createAdminClient(),
      actor: { id: s.usuario.id, rol: "hm" },
    });
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

const decisionSchema = z.object({
  vacanteId: id,
  candidatoId: id,
  decision: z.enum(DECISIONES as [TipoDecision, ...TipoDecision[]]),
  justificacion: z.string(),
});

/** Decisión del HM sobre un candidato. El hm_id sale de la sesión, no del cliente. */
export async function registrarDecision(
  vacanteId: string,
  candidatoId: string,
  decision: TipoDecision,
  justificacion: string,
): Promise<Resultado<ResultadoDecision>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  const input = decisionSchema.safeParse({ vacanteId, candidatoId, decision, justificacion });
  if (!input.success) return { ok: false, codigo: "INVALIDO", error: input.error.message };
  if (s.usuario.rol !== "hm") return NO_AUTORIZADO;
  try {
    const data = await registrarDecisionOrq(
      input.data.vacanteId,
      input.data.candidatoId,
      s.usuario.id,
      input.data.decision,
      input.data.justificacion,
      { db: createAdminClient(), actor: { id: s.usuario.id, rol: "hm" } },
    );
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

/** Vacantes visibles para el usuario (RLS) con etapa, semáforos, cobertura y quién bloquea. */
export async function getResumenVacantes(): Promise<Resultado<ResumenVacante[]>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  const { data: visibles, error } = await s.supabase.from("vacantes").select("id");
  if (error) return fallo(error);
  try {
    const data = await resumenVacantes({
      db: createAdminClient(),
      ids: (visibles ?? []).map((v) => v.id as string),
    });
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}
