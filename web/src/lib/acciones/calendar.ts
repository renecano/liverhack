import "server-only";
import { clienteDeUsuario, googleConfigurado } from "./google";

// Acción real de calendario (P1) con degradación elegante a modo interno, mismo patrón
// que email.ts:
//   - real    → ACTIONS_MODE=real + credenciales de Google + el organizador conectó su cuenta
//   - interno → en cualquier otro caso: la entrevista se guarda en LivHire con su fecha
// Nunca lanza. Si Google falla (sin conexión, token inválido/revocado, sin permiso),
// devuelve ok:false con modo "interno" y un motivo legible: el agendado sigue.
// Pasos de Google Cloud y variables: README-calendar.md (misma carpeta).

export const ZONA_HORARIA = "America/Mexico_City";
const LIMITE_MS = 12_000;

export interface EventoCalendario {
  /** Usuario de LivHire cuyo Google Calendar organiza el evento (el AT que agenda). */
  organizadorId: string;
  titulo: string;
  descripcion: string;
  /** Fecha y hora local de México, "YYYY-MM-DDTHH:mm" (sin zona). */
  inicio: string;
  fin: string;
  invitados: { email: string; nombre?: string }[];
}

export type MotivoInterno = "actions_mode" | "sin_credenciales" | "sin_conexion";
export type ResultadoCalendario =
  | { ok: true; modo: "real"; eventId: string; htmlLink: string | null }
  | { ok: true; modo: "interno"; motivo: MotivoInterno }
  | { ok: false; modo: "interno"; error: string; detalle: string };

/** ¿Se intentará crear el evento real? (para mostrarlo en la UI antes de agendar). */
export function calendarioReal(): boolean {
  return process.env.ACTIONS_MODE === "real" && googleConfigurado();
}

// Correos de invitación: por defecto NO se envían (los usuarios demo tienen correos
// que parecen reales). GOOGLE_CALENDAR_SEND_UPDATES=all los activa.
function enviarInvitaciones(): "all" | "none" {
  return process.env.GOOGLE_CALENDAR_SEND_UPDATES === "all" ? "all" : "none";
}

/** Traduce el error de Google a un mensaje para el AT. */
export function motivoGoogle(err: unknown): string {
  const e = err as { code?: number | string; message?: string; response?: { status?: number; data?: { error?: string | { message?: string } } } };
  const status = Number(e?.response?.status ?? e?.code);
  const datos = e?.response?.data?.error;
  const texto = `${typeof datos === "string" ? datos : (datos?.message ?? "")} ${e?.message ?? ""}`.toLowerCase();
  if (texto.includes("invalid_grant") || texto.includes("token has been expired or revoked"))
    return "Tu conexión con Google expiró o fue revocada. Vuelve a conectar Google Calendar.";
  if (status === 401) return "Google rechazó la autorización. Vuelve a conectar Google Calendar.";
  if (status === 403) return "Tu cuenta de Google no autorizó crear eventos (permiso de calendario o usuario de prueba). Revisa la conexión.";
  if (status === 429) return "Google limitó las solicitudes por ahora. Intenta de nuevo en un minuto.";
  if (texto.includes("tiempo") || texto.includes("timeout") || texto.includes("enotfound") || texto.includes("econn") || texto.includes("fetch failed"))
    return "No hubo conexión con Google a tiempo.";
  return "Google Calendar no respondió como se esperaba.";
}

export async function agendarEnCalendar(ev: EventoCalendario): Promise<ResultadoCalendario> {
  if (process.env.ACTIONS_MODE !== "real") return { ok: true, modo: "interno", motivo: "actions_mode" };
  if (!googleConfigurado()) return { ok: true, modo: "interno", motivo: "sin_credenciales" };

  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    const auth = await clienteDeUsuario(ev.organizadorId);
    if (!auth) return { ok: true, modo: "interno", motivo: "sin_conexion" };
    const { google } = await import("googleapis");
    const cal = google.calendar({ version: "v3", auth });
    const limite = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new Error(`Google no respondió en ${LIMITE_MS / 1000} s (timeout)`)), LIMITE_MS);
    });
    const r = await Promise.race([
      cal.events.insert({
        calendarId: "primary",
        sendUpdates: enviarInvitaciones(),
        requestBody: {
          summary: ev.titulo,
          description: ev.descripcion,
          start: { dateTime: `${ev.inicio}:00`, timeZone: ZONA_HORARIA },
          end: { dateTime: `${ev.fin}:00`, timeZone: ZONA_HORARIA },
          attendees: ev.invitados.map((i) => ({ email: i.email, displayName: i.nombre })),
          reminders: { useDefault: true },
        },
      }),
      limite,
    ]);
    const id = r.data.id;
    if (!id) return { ok: false, modo: "interno", error: "Google no devolvió el evento creado.", detalle: "sin id" };
    return { ok: true, modo: "real", eventId: id, htmlLink: r.data.htmlLink ?? null };
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[calendar] no se pudo crear el evento:", detalle);
    return { ok: false, modo: "interno", error: motivoGoogle(err), detalle: detalle.slice(0, 300) };
  } finally {
    clearTimeout(reloj);
  }
}
