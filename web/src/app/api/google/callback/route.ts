import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sesion } from "@/lib/auth/sesion";
import { guardarConexion } from "@/lib/acciones/google";
import { registrarAuditSeguro } from "@/lib/ia/servicio";

// Regreso del consentimiento de Google: valida el state (cookie), intercambia el código
// por tokens y los guarda para el usuario en sesión. Vuelve a /at/entrevistas con el resultado.
const COOKIE_STATE = "lh_google_state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const volver = new URL("/at/entrevistas", req.url);
  const fin = (resultado: string) => {
    volver.searchParams.set("google", resultado);
    const r = NextResponse.redirect(volver);
    r.cookies.delete({ name: COOKIE_STATE, path: "/api/google" });
    return r;
  };

  const s = await sesion();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (url.searchParams.get("error")) return fin("cancelado"); // el usuario no dio permiso

  const guardado = (await cookies()).get(COOKIE_STATE)?.value ?? "";
  const [state, usuarioId] = guardado.split(".");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== url.searchParams.get("state") || usuarioId !== s.usuario.id) return fin("state_invalido");

  try {
    const r = await guardarConexion(s.usuario.id, code);
    await registrarAuditSeguro({
      actor: { id: s.usuario.id, rol: s.usuario.rol },
      accion: r.ok ? "conectar_google_calendar" : "conectar_google_calendar_fallo",
      entidad: "usuarios",
      entidad_id: s.usuario.id,
      detalle: r.ok ? { google_email: r.email } : { error: r.error },
    });
    return fin(r.ok ? "conectado" : r.error);
  } catch (e) {
    await registrarAuditSeguro({
      actor: { id: s.usuario.id, rol: s.usuario.rol },
      accion: "conectar_google_calendar_fallo",
      entidad: "usuarios",
      entidad_id: s.usuario.id,
      detalle: { error: e instanceof Error ? e.message : String(e) },
    });
    return fin("error");
  }
}
