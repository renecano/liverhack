import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sesion } from "@/lib/auth/sesion";
import { googleConfigurado, urlAutorizacion } from "@/lib/acciones/google";

// Inicia el OAuth de Google Calendar (scope calendar.events) para el AT en sesión.
// El `state` va en una cookie httpOnly y se verifica en /api/google/callback (anti-CSRF).
const COOKIE_STATE = "lh_google_state";

export async function GET(req: Request) {
  const volver = new URL("/at/entrevistas", req.url);
  const s = await sesion();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (s.usuario.rol !== "at" && s.usuario.rol !== "admin") {
    volver.searchParams.set("google", "no_autorizado");
    return NextResponse.redirect(volver);
  }
  if (!googleConfigurado()) {
    volver.searchParams.set("google", "sin_credenciales");
    return NextResponse.redirect(volver);
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(COOKIE_STATE, `${state}.${s.usuario.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && new URL(req.url).protocol === "https:",
    path: "/api/google",
    maxAge: 600,
  });
  return NextResponse.redirect(await urlAutorizacion(state));
}
