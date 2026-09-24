import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sesion } from "@/lib/auth/sesion";
import type { RolUsuario } from "@/lib/supabase/types";
import type { Actor } from "./servicio";

// Acceso a las rutas API del dominio IA sobre la sesión de Persona A
// (sesion() de @/lib/auth/sesion). Aquí solo se agrega lo propio de una API:
// respuestas 401/403 en JSON (la llama fetch, no el navegador), la política de
// roles por acción y el chequeo de visibilidad vía RLS.

export type AccesoIA =
  | { ok: true; supabase: SupabaseClient; actor: Actor & { id: string; rol: RolUsuario } }
  | { ok: false; respuesta: Response };

export async function sesionIA(rolesPermitidos: readonly RolUsuario[]): Promise<AccesoIA> {
  const s = await sesion();
  if (!s) return { ok: false, respuesta: Response.json({ error: "Inicia sesión", codigo: "NO_AUTENTICADO" }, { status: 401 }) };
  if (!rolesPermitidos.includes(s.usuario.rol)) {
    return { ok: false, respuesta: Response.json({ error: "Tu rol no tiene acceso a esta acción", codigo: "NO_AUTORIZADO" }, { status: 403 }) };
  }
  return { ok: true, supabase: s.supabase, actor: { id: s.usuario.id, rol: s.usuario.rol } };
}

// Roles por acción (docs/05). Personalizar notificaciones usa los mismos roles que
// aprobarLoteNotificaciones (Persona A): el botón vive en su centro de notificaciones.
export const ROLES = {
  verCandidatos: ["hm", "at", "admin"],
  verPreguntas: ["hm", "at", "entrevistador", "admin"],
  generarIA: ["hm", "at", "admin"],
  cargarCandidatos: ["at", "admin"],
  personalizarNotificaciones: ["hm", "hrbp", "at", "admin"],
} as const satisfies Record<string, readonly RolUsuario[]>;

// ¿El usuario ve este candidato_vacante? Lo decide RLS (puede_ver_vacante),
// consultando con el cliente de SESIÓN antes de usar el de servicio.
export async function veCandidatoVacante(supabase: SupabaseClient, candidatoVacanteId: string): Promise<boolean> {
  const { data } = await supabase.from("candidato_vacante").select("id").eq("id", candidatoVacanteId).maybeSingle();
  return Boolean(data);
}

export const NO_ENCONTRADO = () => Response.json({ error: "No encontrado o sin acceso", codigo: "NO_ENCONTRADO" }, { status: 404 });
