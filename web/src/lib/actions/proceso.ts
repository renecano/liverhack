"use server";

// Server actions del dominio Proceso. Autentican con la sesión (cliente de servidor,
// respeta RLS) y ejecutan el orquestador con el cliente de servicio: el orquestador es
// la autoridad que escribe audit_log, notificaciones y etapas (RLS no deja al HM
// escribir notificaciones ni vacante_etapas directamente).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/acciones/email";
import type { Notificacion, TipoDecision, TipoNotificacion } from "@/lib/supabase/types";
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
import { sesion } from "@/lib/auth/sesion";
import { sugerirVacantes } from "@/lib/ia";

export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; codigo: string; error: string };

const id = z.guid();

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
    if (data.sugerencias_solicitadas) {
      // "Reemparejar": sugerirVacantes tarda 6-9 s. after() responde al HM de inmediato
      // y calcula las sugerencias en segundo plano, sin afectar la decisión.
      const { candidatoId: cid, vacanteId: vid } = input.data;
      const decisionId = data.decision.id;
      after(() => dispararSugerencias(cid, vid, decisionId, { id: s.usuario.id, rol: "hm" }));
    }
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Segundo plano de "reemparejar": audita el disparo y llama al sugeridor (dominio IA).
 * sugerirVacantes nunca lanza ({ ok } | { ok: false, error }); igual se protege todo
 * con try/catch para que nada de esto pueda afectar la decisión ya registrada.
 */
async function dispararSugerencias(
  candidatoId: string,
  vacanteId: string,
  decisionId: string,
  actor: { id: string; rol: "hm" },
): Promise<void> {
  const db = createAdminClient();
  try {
    await registrarAudit(
      db,
      actor,
      "disparar_sugerencias_vacante",
      "candidatos",
      candidatoId,
      { origen_vacante_id: vacanteId, modo: "segundo_plano" },
      decisionId,
    );
  } catch (e) {
    console.error("[proceso] no se pudo auditar el disparo de sugerencias", e);
  }
  try {
    const r = await sugerirVacantes(candidatoId, { vacanteOrigenId: vacanteId, actor });
    if (!r.ok) console.warn(`[proceso] sugerencias no generadas para ${candidatoId}: ${r.error}`);
  } catch (e) {
    console.error("[proceso] fallo inesperado al sugerir vacantes", e);
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

export interface ResumenEnvio {
  aprobadas: number;
  enviadas: number;
  /** enviadas con Resend (envío real). */
  reales: number;
  /** enviadas en modo simulado (sin RESEND_API_KEY o ACTIONS_MODE=mock). */
  simuladas: number;
  /** aprobadas pero cuyo envío de correo falló (quedan en 'aprobada'). */
  fallidas: number;
  /** motivo de cada envío fallido, para mostrarlo en la UI. */
  errores: { id: string; error: string }[];
}

function asuntoNotificacion(tipo: TipoNotificacion): string {
  switch (tipo) {
    case 'cambio_etapa': return 'LivHire · Actualización de tu proceso';
    case 'resultado': return 'LivHire · Resultado de tu proceso';
    case 'recordatorio': return 'LivHire · Recordatorio';
    case 'escalacion': return 'LivHire · Escalación de SLA';
    case 'reactivacion': return 'LivHire · Reactivación de proceso';
    default: return 'LivHire';
  }
}

/**
 * Aprueba los borradores visibles (gobernanza: un humano aprueba) y ENVÍA los ya
 * aprobados. Para cada notificación de canal 'correo' llama a enviarCorreo (real si
 * hay RESEND_API_KEY y ACTIONS_MODE!='mock'; simulado si no) y solo marca 'enviada'
 * cuando el envío tuvo éxito. Las de canal 'portal' se entregan in-app. Nada en
 * 'borrador' se envía; cada envío/fallo queda en audit_log con el modo y el id del mensaje.
 * Las que ya estaban en 'aprobada' (un envío anterior falló) se reintentan sin volver a
 * aprobarse. Un correo fallido no rompe el lote: se cuenta y se devuelve su motivo.
 */
export async function aprobarLoteNotificaciones(ids: string[]): Promise<Resultado<ResumenEnvio>> {
  const s = await sesion();
  if (!s) return NO_AUTENTICADO;
  if (!['hm', 'hrbp', 'at', 'admin'].includes(s.usuario.rol)) return NO_AUTORIZADO;
  const validos = [...new Set(ids)].filter((notificacionId) => id.safeParse(notificacionId).success);
  const vacio: ResumenEnvio = { aprobadas: 0, enviadas: 0, reales: 0, simuladas: 0, fallidas: 0, errores: [] };
  if (validos.length === 0) return { ok: true, data: vacio };

  try {
    // La lectura con el cliente de sesión limita el lote a notificaciones visibles por RLS.
    const visibles = revisar<Notificacion[]>(
      await s.supabase.from('notificaciones').select('*').in('id', validos).in('estatus', ['borrador', 'aprobada']),
      'notificaciones visibles',
    );
    if (visibles.length === 0) return { ok: true, data: vacio };
    const borradores = visibles.filter((n) => n.estatus === 'borrador');
    const reintentos = visibles.filter((n) => n.estatus === 'aprobada');

    const db = createAdminClient();
    const actor = { id: s.usuario.id, rol: s.usuario.rol };
    const recienAprobadas = borradores.length
      ? revisar<Notificacion[]>(
          await db
            .from('notificaciones')
            .update({ estatus: 'aprobada', aprobada_por: s.usuario.id })
            .in('id', borradores.map((n) => n.id))
            .eq('estatus', 'borrador')
            .select(),
          'aprobar notificaciones',
        )
      : [];
    for (const notificacion of recienAprobadas) {
      await registrarAudit(db, actor, 'aprobar_notificacion_lote', 'notificaciones', notificacion.id, {
        estatus_anterior: 'borrador',
        estatus_nuevo: 'aprobada',
      });
    }
    const aprobadas = [...recienAprobadas, ...reintentos];

    // Resolver el correo de cada destinatario (polimórfico: candidato o usuario).
    const correo = aprobadas.filter((n) => n.canal === 'correo');
    const portal = aprobadas.filter((n) => n.canal !== 'correo');
    const candIds = [...new Set(correo.filter((n) => n.destinatario_tipo === 'candidato').map((n) => n.destinatario_id))];
    const userIds = [...new Set(correo.filter((n) => n.destinatario_tipo === 'usuario').map((n) => n.destinatario_id))];
    const emailPorId = new Map<string, string>();
    if (candIds.length) {
      const cs = revisar<{ id: string; email: string }[]>(await db.from('candidatos').select('id, email').in('id', candIds), 'emails candidatos');
      cs.forEach((c) => emailPorId.set(c.id, c.email));
    }
    if (userIds.length) {
      const us = revisar<{ id: string; email: string }[]>(await db.from('usuarios').select('id, email').in('id', userIds), 'emails usuarios');
      us.forEach((u) => emailPorId.set(u.id, u.email));
    }

    const resumen: ResumenEnvio = { aprobadas: recienAprobadas.length, enviadas: 0, reales: 0, simuladas: 0, fallidas: 0, errores: [] };
    const enviadasIds: string[] = [];

    // Canal portal: entrega in-app, no requiere correo.
    for (const n of portal) {
      enviadasIds.push(n.id);
      resumen.enviadas += 1;
      await registrarAudit(db, actor, 'enviar_notificacion', 'notificaciones', n.id, {
        estatus_anterior: 'aprobada', estatus_nuevo: 'enviada', canal: 'portal', modo: 'portal',
      });
    }

    // Canal correo: envío real o simulado; solo se marca 'enviada' si tuvo éxito.
    for (const n of correo) {
      const to = emailPorId.get(n.destinatario_id);
      if (!to) {
        resumen.fallidas += 1;
        resumen.errores.push({ id: n.id, error: 'el destinatario no tiene correo registrado' });
        await registrarAudit(db, actor, 'enviar_notificacion_fallo', 'notificaciones', n.id, {
          canal: 'correo', motivo: 'sin_email_destinatario', destinatario_tipo: n.destinatario_tipo, destinatario_id: n.destinatario_id,
        });
        continue;
      }
      const r = await enviarCorreo({ to, asunto: asuntoNotificacion(n.tipo), cuerpo: n.contenido ?? '' });
      if (r.ok) {
        enviadasIds.push(n.id);
        resumen.enviadas += 1;
        if (r.modo === 'real') resumen.reales += 1; else resumen.simuladas += 1;
        await registrarAudit(db, actor, 'enviar_notificacion', 'notificaciones', n.id, {
          estatus_anterior: 'aprobada', estatus_nuevo: 'enviada', canal: 'correo', modo: r.modo, mensaje_id: r.id,
        });
      } else {
        // Queda en 'aprobada' para reintentar; el lote sigue con las demás.
        resumen.fallidas += 1;
        resumen.errores.push({ id: n.id, error: r.error ?? 'desconocido' });
        await registrarAudit(db, actor, 'enviar_notificacion_fallo', 'notificaciones', n.id, {
          canal: 'correo', modo: r.modo, error: r.error ?? 'desconocido', estatus: 'aprobada',
        });
      }
    }

    if (enviadasIds.length) {
      revisar<Notificacion[]>(
        await db.from('notificaciones').update({ estatus: 'enviada' }).in('id', enviadasIds).eq('estatus', 'aprobada').select(),
        'marcar enviadas',
      );
    }

    revalidatePath('/hm');
    revalidatePath('/hrbp');
    return { ok: true, data: resumen };
  } catch (e) {
    return fallo(e);
  }
}
