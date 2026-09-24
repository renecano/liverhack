import "server-only";
import type { Auth } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";

// OAuth de Google Calendar (acciones reales, docs/01). Un usuario (el AT) conecta su
// cuenta; el refresh_token se guarda en google_conexiones (solo service_role) y el
// servidor lo usa para crear eventos. google-auth-library refresca el access_token
// cuando expira y aquí se persiste el nuevo. Configuración y pasos: web/src/lib/acciones/README-calendar.md.

export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const TABLA = "google_conexiones";

/** ¿Hay credenciales de OAuth en el entorno? */
export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

type OAuth2Client = Auth.OAuth2Client;

// googleapis se importa bajo demanda: es pesado y solo se usa en estas acciones.
export async function clienteOAuth(): Promise<OAuth2Client> {
  const { google } = await import("googleapis");
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

/** URL de consentimiento. offline + consent para recibir refresh_token. */
export async function urlAutorizacion(state: string): Promise<string> {
  const c = await clienteOAuth();
  return c.generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true, scope: SCOPES, state });
}

export type EstadoConexion =
  | { estado: "sin_credenciales" }
  | { estado: "sin_tabla" }
  | { estado: "no_conectado" }
  | { estado: "conectado"; email: string | null; desde: string };

// PostgREST: la tabla aún no existe en el hosted (falta correr la migración).
const faltaTabla = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /google_conexiones/.test(e.message ?? "")));

export async function estadoConexion(usuarioId: string): Promise<EstadoConexion> {
  if (!googleConfigurado()) return { estado: "sin_credenciales" };
  const { data, error } = await createAdminClient().from(TABLA).select("google_email, actualizado_en").eq("usuario_id", usuarioId).maybeSingle();
  if (faltaTabla(error)) return { estado: "sin_tabla" };
  if (error || !data) return { estado: "no_conectado" };
  return { estado: "conectado", email: data.google_email as string | null, desde: data.actualizado_en as string };
}

/** Intercambia el código del callback por tokens y los guarda para el usuario. */
export async function guardarConexion(usuarioId: string, code: string): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const c = await clienteOAuth();
  const { tokens } = await c.getToken(code);
  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await c.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload()?.email ?? null;
  }
  const db = createAdminClient();
  let refresh = tokens.refresh_token ?? null;
  if (!refresh) {
    // Google solo manda refresh_token la primera vez; si ya había conexión, se conserva.
    const previa = await db.from(TABLA).select("refresh_token").eq("usuario_id", usuarioId).maybeSingle();
    if (faltaTabla(previa.error)) return { ok: false, error: "sin_tabla" };
    refresh = (previa.data?.refresh_token as string | undefined) ?? null;
  }
  if (!refresh) return { ok: false, error: "sin_refresh_token" };
  const { error } = await db.from(TABLA).upsert({
    usuario_id: usuarioId,
    google_email: email,
    refresh_token: refresh,
    access_token: tokens.access_token ?? null,
    expira_en: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? null,
    actualizado_en: new Date().toISOString(),
  });
  if (faltaTabla(error)) return { ok: false, error: "sin_tabla" };
  if (error) return { ok: false, error: error.message };
  return { ok: true, email };
}

/**
 * Cliente OAuth listo para llamar APIs en nombre del usuario, o null si no conectó.
 * Si el access_token expiró, la librería lo refresca con el refresh_token y aquí se
 * guarda el nuevo (evento "tokens"). Un refresh_token revocado falla con invalid_grant.
 */
export async function clienteDeUsuario(usuarioId: string): Promise<OAuth2Client | null> {
  const db = createAdminClient();
  const { data, error } = await db.from(TABLA).select("refresh_token, access_token, expira_en").eq("usuario_id", usuarioId).maybeSingle();
  if (error || !data) return null;
  const c = await clienteOAuth();
  const cred: Auth.Credentials = {
    refresh_token: data.refresh_token as string,
    access_token: (data.access_token as string | null) ?? undefined,
    expiry_date: data.expira_en ? new Date(data.expira_en as string).getTime() : undefined,
  };
  c.setCredentials(cred);
  c.on("tokens", (t) => {
    void db
      .from(TABLA)
      .update({
        access_token: t.access_token ?? null,
        expira_en: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
        ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .eq("usuario_id", usuarioId)
      .then(({ error: e }) => e && console.error("[google] no se pudo guardar el token renovado:", e.message));
  });
  return c;
}

/** Borra la conexión local sin llamar a Google (p. ej. el refresh_token ya fue revocado). */
export async function olvidarConexion(usuarioId: string): Promise<void> {
  await createAdminClient().from(TABLA).delete().eq("usuario_id", usuarioId);
}

/** Borra la conexión (y revoca el token en Google si se puede). */
export async function desconectar(usuarioId: string): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from(TABLA).select("refresh_token").eq("usuario_id", usuarioId).maybeSingle();
  if (data?.refresh_token) {
    try {
      const c = await clienteOAuth();
      await c.revokeToken(data.refresh_token as string);
    } catch {
      // Si Google no responde, igual se borra localmente.
    }
  }
  await db.from(TABLA).delete().eq("usuario_id", usuarioId);
}
