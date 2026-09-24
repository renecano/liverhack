"use server";

// Agenda de entrevistas del AT y conexión con Google Calendar (acciones reales).

import { revalidatePath } from "next/cache";
import { sesion } from "@/lib/auth/sesion";
import { desconectar } from "@/lib/acciones/google";
import { registrarAuditSeguro } from "@/lib/ia/servicio";

/** Quita la conexión de Google Calendar del usuario en sesión (y revoca el token). */
export async function desconectarGoogle(): Promise<{ ok: boolean }> {
  const s = await sesion();
  if (!s || (s.usuario.rol !== "at" && s.usuario.rol !== "admin")) return { ok: false };
  await desconectar(s.usuario.id);
  await registrarAuditSeguro({
    actor: { id: s.usuario.id, rol: s.usuario.rol },
    accion: "desconectar_google_calendar",
    entidad: "usuarios",
    entidad_id: s.usuario.id,
    detalle: {},
  });
  revalidatePath("/at/entrevistas");
  return { ok: true };
}
