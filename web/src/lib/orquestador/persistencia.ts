// Escrituras transversales del orquestador y del sla-engine: audit_log (append-only),
// notificaciones en borrador (cero ghosting) y lectura del estado vigente.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditLog,
  CanalNotificacion,
  DestinatarioTipo,
  Notificacion,
  RolUsuario,
  TipoNotificacion,
  Vacante,
} from "@/lib/supabase/types";
import { ESTADOS, estadoDerivado, type EstadoProceso } from "./estados";

/** Quién ejecuta la acción. id/rol null = el sistema (jobs, sla-engine). */
export interface Actor {
  id: string | null;
  rol: RolUsuario | null;
}

export const ACTOR_SISTEMA: Actor = { id: null, rol: null };

export const ACCION_CAMBIO_ESTADO = "cambio_estado";

/**
 * Lanza si la respuesta de Supabase trae error; devuelve data con el tipo de fila
 * indicado (el cliente no usa tipos generados, así que `T` es el contrato de docs/02).
 */
export function revisar<T>(
  res: { data: unknown; error: { message: string } | null },
  contexto: string,
): T {
  if (res.error) throw new Error(`${contexto}: ${res.error.message}`);
  return res.data as T;
}

export async function registrarAudit(
  db: SupabaseClient,
  actor: Actor,
  accion: string,
  entidad: string,
  entidadId: string | null,
  detalle: Record<string, unknown> = {},
  decisionId: string | null = null,
): Promise<AuditLog> {
  return revisar(
    await db
      .from("audit_log")
      .insert({
        actor_id: actor.id,
        actor_rol: actor.rol,
        accion,
        entidad,
        entidad_id: entidadId,
        detalle,
        decision_id: decisionId,
      })
      .select()
      .single(),
    `audit_log (${accion})`,
  );
}

export interface NuevaNotificacion {
  destinatario_tipo: DestinatarioTipo;
  destinatario_id: string;
  vacante_id: string | null;
  tipo: TipoNotificacion;
  canal?: CanalNotificacion;
  contenido: string;
}

/**
 * Siempre en 'borrador': un humano (AT) la aprueba antes de enviarla.
 * El texto es una plantilla determinista; el agente de feedback personalizado
 * (dominio IA) puede reescribirla antes de la aprobación.
 */
export async function crearNotificaciones(
  db: SupabaseClient,
  actor: Actor,
  nuevas: NuevaNotificacion[],
): Promise<Notificacion[]> {
  if (nuevas.length === 0) return [];
  const creadas = revisar<Notificacion[]>(
    await db
      .from("notificaciones")
      .insert(nuevas.map((n) => ({ canal: "correo", ...n, estatus: "borrador" })))
      .select(),
    "notificaciones",
  );
  for (const n of creadas) {
    await registrarAudit(db, actor, "generar_notificacion_borrador", "notificaciones", n.id, {
      tipo: n.tipo,
      destinatario_tipo: n.destinatario_tipo,
      destinatario_id: n.destinatario_id,
      vacante_id: n.vacante_id,
    });
  }
  return creadas;
}

/** Estado vigente del orquestador por vacante: último `cambio_estado` en audit_log. */
export async function leerEstados(
  db: SupabaseClient,
  vacantes: Pick<Vacante, "id" | "etapa_actual" | "estatus">[],
): Promise<Map<string, EstadoProceso>> {
  const estados = new Map<string, EstadoProceso>();
  if (vacantes.length === 0) return estados;

  const eventos = revisar<Pick<AuditLog, "entidad_id" | "detalle">[]>(
    await db
      .from("audit_log")
      .select("entidad_id, detalle, ts")
      .eq("entidad", "vacantes")
      .eq("accion", ACCION_CAMBIO_ESTADO)
      .in("entidad_id", vacantes.map((v) => v.id))
      .order("ts", { ascending: false }),
    "leer estados",
  );
  for (const e of eventos) {
    const estado = e.detalle?.estado_nuevo as EstadoProceso | undefined;
    if (e.entidad_id && estado && ESTADOS.includes(estado) && !estados.has(e.entidad_id)) {
      estados.set(e.entidad_id, estado);
    }
  }
  for (const v of vacantes) {
    // Sin eventos se deriva; y la columna manda si alguien cerró/canceló la vacante
    // por fuera del orquestador.
    const cerrada = v.estatus === "cancelada" || v.estatus === "cubierta";
    if (cerrada || !estados.has(v.id)) {
      estados.set(v.id, estadoDerivado(v.etapa_actual, v.estatus));
    }
  }
  return estados;
}
