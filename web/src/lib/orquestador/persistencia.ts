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

/** Clave del índice parcial notificaciones_un_borrador (vacante_id NULL = distinto). */
function claveBorrador(n: { destinatario_tipo: string; destinatario_id: string; vacante_id: string | null; tipo: string }): string {
  return [n.destinatario_tipo, n.destinatario_id, n.vacante_id, n.tipo].join("\u0000");
}

/**
 * Siempre en 'borrador': un humano (AT) la aprueba antes de enviarla.
 * El texto es una plantilla determinista; el agente de feedback personalizado
 * (dominio IA) puede reescribirla antes de la aprobación.
 *
 * Respeta el índice único parcial `notificaciones_un_borrador`: si ya hay un
 * borrador idéntico (mismo destinatario/vacante/tipo) no se crea otro; el aviso
 * pendiente basta (cero ghosting sin spam). Se filtra en la aplicación porque el
 * índice es PARCIAL (where estatus='borrador') y PostgREST no infiere ese
 * predicado en un upsert/on-conflict. `vacante_id` NULL nunca deduplica (NULLS
 * DISTINCT). Sin transacción hay una carrera teórica; en ese caso el índice
 * seguiría protegiendo la unicidad a nivel BD.
 */
export async function crearNotificaciones(
  db: SupabaseClient,
  actor: Actor,
  nuevas: NuevaNotificacion[],
): Promise<Notificacion[]> {
  if (nuevas.length === 0) return [];
  const filas = nuevas.map((n) => ({ canal: "correo" as CanalNotificacion, ...n, estatus: "borrador" as const }));

  // Borradores ya existentes que colisionarían (solo para filas con vacante_id).
  const vacanteIds = [...new Set(filas.map((f) => f.vacante_id).filter((id): id is string => id !== null))];
  const existentes = new Set<string>();
  if (vacanteIds.length > 0) {
    const previos = revisar<{ destinatario_tipo: DestinatarioTipo; destinatario_id: string; vacante_id: string | null; tipo: TipoNotificacion }[]>(
      await db
        .from("notificaciones")
        .select("destinatario_tipo, destinatario_id, vacante_id, tipo")
        .eq("estatus", "borrador")
        .in("vacante_id", vacanteIds),
      "borradores existentes",
    );
    for (const p of previos) existentes.add(claveBorrador(p));
  }

  // Descarta duplicados contra la BD y dentro del propio lote.
  const vistos = new Set<string>();
  const aInsertar = filas.filter((f) => {
    if (f.vacante_id === null) return true; // NULLS DISTINCT: nunca colisiona.
    const k = claveBorrador(f);
    if (existentes.has(k) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  if (aInsertar.length === 0) return [];

  const creadas = revisar<Notificacion[]>(
    await db.from("notificaciones").insert(aInsertar).select(),
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
