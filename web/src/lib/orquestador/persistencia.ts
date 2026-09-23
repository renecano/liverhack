// Escrituras transversales del orquestador y del sla-engine: audit_log (append-only)
// y notificaciones en borrador (cero ghosting).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditLog,
  CanalNotificacion,
  DestinatarioTipo,
  Notificacion,
  RolUsuario,
  TipoNotificacion,
} from "@/lib/supabase/types";

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
