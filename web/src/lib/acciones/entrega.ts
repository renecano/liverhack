import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Notificacion } from "@/lib/supabase/types";

// Estado de entrega de cada notificación, leído de audit_log (enviar_notificacion /
// enviar_notificacion_fallo): la tabla notificaciones no guarda modo ni message_id.

export type Entrega =
  | { resultado: "enviada"; modo: "real" | "simulado" | "portal"; mensaje_id: string | null; ts: string }
  | { resultado: "fallo"; error: string; ts: string };

/**
 * Último intento de entrega por notificación. Recibe notificaciones ya leídas con el
 * cliente de sesión (RLS), así que solo expone datos de avisos que el usuario ya ve.
 * Nunca lanza: si la lectura falla, la UI muestra solo el estatus.
 */
export async function entregasDe(notificaciones: Pick<Notificacion, "id" | "estatus">[]): Promise<Record<string, Entrega>> {
  const ids = notificaciones.filter((n) => n.estatus !== "borrador").map((n) => n.id);
  if (!ids.length) return {};
  try {
    const { data, error } = await createAdminClient()
      .from("audit_log")
      .select("entidad_id, accion, detalle, ts")
      .eq("entidad", "notificaciones")
      .in("entidad_id", ids)
      .in("accion", ["enviar_notificacion", "enviar_notificacion_fallo"])
      .order("ts", { ascending: false });
    if (error) return {};
    const entregas: Record<string, Entrega> = {};
    for (const fila of data ?? []) {
      const id = fila.entidad_id as string;
      if (entregas[id]) continue; // ya tenemos el más reciente
      const d = (fila.detalle ?? {}) as Record<string, unknown>;
      entregas[id] =
        fila.accion === "enviar_notificacion"
          ? {
              resultado: "enviada",
              modo: d.modo === "real" || d.modo === "simulado" ? d.modo : "portal",
              mensaje_id: typeof d.mensaje_id === "string" ? d.mensaje_id : null,
              ts: fila.ts as string,
            }
          : { resultado: "fallo", error: String(d.error ?? d.motivo ?? "desconocido"), ts: fila.ts as string };
    }
    return entregas;
  } catch {
    return {};
  }
}
