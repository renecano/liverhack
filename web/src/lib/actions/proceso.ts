"use server";

// Server actions del dominio Proceso. Autentican con la sesión (cliente de servidor,
// respeta RLS) y ejecutan el orquestador con el cliente de servicio: el orquestador es
// la autoridad que escribe audit_log, notificaciones y etapas (RLS no deja al HM
// escribir notificaciones ni vacante_etapas directamente).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Notificacion, RolUsuario, TipoDecision } from "@/lib/supabase/types";
import {
  abrirVacante as abrirVacanteOrq,
  ErrorProceso,
  avanzarEtapa as avanzarEtapaOrq,
  confirmarPasoHM as confirmarPasoHMOrq,
  registrarDecision as registrarDecisionOrq,
  type ResultadoCambio,
  type ResultadoDecision,
} from "@/lib/orquestador/maquina";
import { resumenVacantes, type ResumenVacante } from "@/lib/orquestador/resumen";
import { DECISIONES } from "@/lib/orquestador/estados";
import { registrarAudit, revisar } from "@/lib/orquestador/persistencia";

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

const abrirVacanteSchema = z.object({
  posicion_id: id,
  titulo: z.string().trim().min(3).max(160),
  descripcion: z.string().trim().max(5000).optional(),
  rango_salarial_min: z.number().int().nonnegative().nullable().optional(),
  rango_salarial_max: z.number().int().nonnegative().nullable().optional(),
  hm_id: id,
  at_id: id,
  fuente_referidos: z.boolean().optional(),
});

/** HRBP abre requisiciones mediante el orquestador; el candado vive en la BD. */
export async function abrirVacante(input: z.input<typeof abrirVacanteSchema>) {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  if (!['hrbp', 'admin'].includes(s.usuario.rol)) return NO_AUTORIZADO;
  const parsed = abrirVacanteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, codigo: 'INVALIDO', error: parsed.error.message };

  try {
    const data = await abrirVacanteOrq(
      { ...parsed.data, descripcion: parsed.data.descripcion || null, hrbp_id: s.usuario.id },
      { db: createAdminClient(), actor: { id: s.usuario.id, rol: s.usuario.rol } },
    );
    revalidatePath('/hrbp');
    return { ok: true as const, data };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Aprueba los borradores visibles y simula su envío para la demo P0. El correo
 * real queda explícitamente fuera de esta acción; cada cambio queda auditado.
 */
export async function aprobarLoteNotificaciones(ids: string[]): Promise<Resultado<{ aprobadas: number }>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  if (!['hm', 'hrbp', 'at', 'admin'].includes(s.usuario.rol)) return NO_AUTORIZADO;
  const validos = [...new Set(ids)].filter((notificacionId) => id.safeParse(notificacionId).success);
  if (validos.length === 0) return { ok: true, data: { aprobadas: 0 } };

  try {
    // La lectura con el cliente de sesión limita el lote a notificaciones visibles por RLS.
    const borradores = revisar<Notificacion[]>(
      await s.supabase.from('notificaciones').select('*').in('id', validos).eq('estatus', 'borrador'),
      'borradores visibles',
    );
    if (borradores.length === 0) return { ok: true, data: { aprobadas: 0 } };

    const db = createAdminClient();
    const aprobadas = revisar<Notificacion[]>(
      await db
        .from('notificaciones')
        .update({ estatus: 'aprobada', aprobada_por: s.usuario.id })
        .in('id', borradores.map((n) => n.id))
        .select(),
      'aprobar notificaciones',
    );
    for (const notificacion of aprobadas) {
      await registrarAudit(db, { id: s.usuario.id, rol: s.usuario.rol }, 'aprobar_notificacion_lote', 'notificaciones', notificacion.id, {
        estatus_anterior: 'borrador',
        estatus_nuevo: 'aprobada',
        envio: 'simulado_p1',
      });
    }
    const enviadas = revisar<Notificacion[]>(
      await db.from('notificaciones').update({ estatus: 'enviada' }).in('id', aprobadas.map((n) => n.id)).select(),
      'envío simulado de notificaciones',
    );
    for (const notificacion of enviadas) {
      await registrarAudit(db, { id: s.usuario.id, rol: s.usuario.rol }, 'enviar_notificacion_simulado', 'notificaciones', notificacion.id, {
        estatus_anterior: 'aprobada',
        estatus_nuevo: 'enviada',
      });
    }
    revalidatePath('/hm');
    revalidatePath('/hrbp');
    return { ok: true, data: { aprobadas: aprobadas.length } };
  } catch (e) {
    return fallo(e);
  }
}
