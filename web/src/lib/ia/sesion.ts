import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@/lib/supabase/types";
import type { Actor } from "./servicio";

// Sesión para las rutas API del dominio IA. Es una réplica de `sesion()` de
// lib/actions/proceso.ts (Persona A), que no está exportada: mismo cliente de
// sesión (@/lib/supabase/server, respeta RLS), misma tabla `usuarios` y mismo
// chequeo de `activo`. Diferencia: responde 401/403 en JSON en vez de redirigir
// (las rutas las llama fetch, no el navegador).
// TODO(Persona A): si exporta su sesion(), usar la suya y borrar esta copia.

export type SesionIA =
  | { ok: true; supabase: SupabaseClient; actor: Actor & { id: string; rol: RolUsuario } }
  | { ok: false; respuesta: Response };

export async function sesionIA(rolesPermitidos: readonly RolUsuario[]): Promise<SesionIA> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, respuesta: Response.json({ error: "Inicia sesión", codigo: "NO_AUTENTICADO" }, { status: 401 }) };
  const { data: usuario } = await supabase.from("usuarios").select("id, rol, activo").eq("id", user.id).maybeSingle();
  if (!usuario?.activo) {
    return { ok: false, respuesta: Response.json({ error: "Inicia sesión", codigo: "NO_AUTENTICADO" }, { status: 401 }) };
  }
  if (!rolesPermitidos.includes(usuario.rol as RolUsuario)) {
    return { ok: false, respuesta: Response.json({ error: "Tu rol no tiene acceso a esta acción", codigo: "NO_AUTORIZADO" }, { status: 403 }) };
  }
  return { ok: true, supabase, actor: { id: usuario.id as string, rol: usuario.rol as RolUsuario } };
}

// Roles por ruta (docs/05): la lista/comparativa y la IA sobre candidatos son del
// HM y del AT; la carga y la aprobación de notificaciones, del AT. admin, en todas.
export const ROLES = {
  verCandidatos: ["hm", "at", "admin"],
  verPreguntas: ["hm", "at", "entrevistador", "admin"],
  generarIA: ["hm", "at", "admin"],
  cargarCandidatos: ["at", "admin"],
  personalizarNotificaciones: ["at", "admin"],
} as const satisfies Record<string, readonly RolUsuario[]>;

// ¿El usuario ve este candidato_vacante? Lo decide RLS (puede_ver_vacante),
// consultando con el cliente de SESIÓN antes de usar el de servicio.
export async function veCandidatoVacante(supabase: SupabaseClient, candidatoVacanteId: string): Promise<boolean> {
  const { data } = await supabase.from("candidato_vacante").select("id").eq("id", candidatoVacanteId).maybeSingle();
  return Boolean(data);
}

export const NO_ENCONTRADO = () => Response.json({ error: "No encontrado o sin acceso", codigo: "NO_ENCONTRADO" }, { status: 404 });
