"use server";

// Agenda de entrevistas del AT y conexión con Google Calendar (acciones reales).

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { sesion } from "@/lib/auth/sesion";
import { agendarEnCalendar } from "@/lib/acciones/calendar";
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

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // <input type="datetime-local">
const Entrada = z.object({
  candidato_vacante_id: z.guid(),
  tipo: z.enum(["competencias", "panel"]),
  inicio: z.string().regex(LOCAL, "Fecha y hora inválidas"),
  duracion_min: z.coerce.number().int().min(15).max(240),
  entrevistadores: z.array(z.guid()).min(1, "Elige al menos un entrevistador").max(6),
});

// México (CDMX) no tiene horario de verano desde 2022: UTC-6 fijo.
const OFFSET_MX = "-06:00";
function sumarMinutos(local: string, minutos: number): string {
  const d = new Date(`${local}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutos);
  return d.toISOString().slice(0, 16);
}

export type ResultadoAgendar =
  | { ok: true; entrevistaId: string; modo: "real"; htmlLink: string | null }
  | { ok: true; entrevistaId: string; modo: "interno"; aviso: string | null }
  | { ok: false; error: string };

const AVISO_INTERNO: Record<string, string | null> = {
  actions_mode: null, // modo demo/mock: agenda interna esperada, sin aviso
  sin_credenciales: null,
  sin_conexion: "Se guardó en LivHire. Conecta Google Calendar para crear también el evento en tu calendario.",
};

/**
 * Agenda una entrevista con sus entrevistadores. La fila se crea con la sesión (RLS: solo
 * AT/admin escriben entrevistas). Luego intenta el evento real en Google Calendar; si no se
 * puede, la entrevista queda en modo interno con su fecha y se explica por qué.
 */
export async function agendarEntrevista(entrada: z.input<typeof Entrada>): Promise<ResultadoAgendar> {
  const s = await sesion();
  if (!s) return { ok: false, error: "Inicia sesión" };
  if (s.usuario.rol !== "at" && s.usuario.rol !== "admin") return { ok: false, error: "Solo Atracción de Talento agenda entrevistas." };
  const p = Entrada.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const e = p.data;
  const actor = { id: s.usuario.id, rol: s.usuario.rol };

  // Candidato en una vacante visible y activa.
  const { data: cv } = await s.supabase
    .from("candidato_vacante")
    .select("candidato_id, vacante_id, estatus, candidatos(nombre), vacantes(titulo, estatus)")
    .eq("id", e.candidato_vacante_id)
    .maybeSingle();
  const uno = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  const candidato = uno(cv?.candidatos as { nombre: string } | { nombre: string }[] | null);
  const vacante = uno(cv?.vacantes as { titulo: string; estatus: string } | { titulo: string; estatus: string }[] | null);
  if (!cv || !candidato || !vacante) return { ok: false, error: "No encontré a ese candidato en tus vacantes." };
  if (!["abierta", "en_proceso"].includes(vacante.estatus)) return { ok: false, error: "La vacante ya no está activa." };

  // Entrevistadores válidos (usuarios activos con rol entrevistador).
  const ids = [...new Set(e.entrevistadores)];
  const { data: personas } = await s.supabase.from("usuarios").select("id, nombre, email, rol, activo").in("id", ids);
  const entrevistadores = (personas ?? []).filter((u) => u.rol === "entrevistador" && u.activo);
  if (entrevistadores.length !== ids.length) return { ok: false, error: "Algún entrevistador no es válido." };

  const fin = sumarMinutos(e.inicio, e.duracion_min);
  const { data: fila, error } = await s.supabase
    .from("entrevistas")
    .insert({ vacante_id: cv.vacante_id, candidato_id: cv.candidato_id, fecha: `${e.inicio}:00${OFFSET_MX}`, tipo: e.tipo, estatus: "programada" })
    .select("id")
    .single();
  if (error || !fila) return { ok: false, error: "No se pudo guardar la entrevista." };
  const entrevistaId = fila.id as string;
  const part = await s.supabase.from("entrevista_participantes").insert(entrevistadores.map((u) => ({ entrevista_id: entrevistaId, entrevistador_id: u.id })));
  if (part.error) {
    await s.supabase.from("entrevistas").delete().eq("id", entrevistaId);
    return { ok: false, error: "No se pudieron asignar los entrevistadores." };
  }

  // Evento en Google Calendar (real o interno). Nunca rompe el agendado.
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cal = await agendarEnCalendar({
    organizadorId: s.usuario.id,
    titulo: `Entrevista de ${e.tipo}: ${candidato.nombre} · ${vacante.titulo}`,
    descripcion: [
      `Entrevista de ${e.tipo} para ${vacante.titulo}.`,
      `Panel: ${entrevistadores.map((u) => u.nombre).join(", ")}.`,
      `Scorecard en vivo (LivHire): ${origen}/entrevistador/${entrevistaId}`,
    ].join("\n"),
    inicio: e.inicio,
    fin,
    invitados: entrevistadores.map((u) => ({ email: u.email as string, nombre: u.nombre as string })),
  });
  if (cal.ok && cal.modo === "real") {
    await s.supabase.from("entrevistas").update({ calendar_event_id: cal.eventId }).eq("id", entrevistaId);
  }

  await registrarAuditSeguro({
    actor,
    accion: "agendar_entrevista",
    entidad: "entrevistas",
    entidad_id: entrevistaId,
    detalle: {
      vacante_id: cv.vacante_id,
      candidato_id: cv.candidato_id,
      tipo: e.tipo,
      inicio: `${e.inicio}${OFFSET_MX}`,
      duracion_min: e.duracion_min,
      entrevistadores: entrevistadores.map((u) => u.id),
      modo: cal.modo,
      ...(cal.ok && cal.modo === "real" ? { event_id: cal.eventId, html_link: cal.htmlLink } : {}),
      ...(cal.ok && cal.modo === "interno" ? { motivo_interno: cal.motivo } : {}),
    },
  });

  revalidatePath("/at/entrevistas");
  revalidatePath("/entrevistador");
  if (cal.ok && cal.modo === "real") return { ok: true, entrevistaId, modo: "real", htmlLink: cal.htmlLink };
  if (cal.ok) return { ok: true, entrevistaId, modo: "interno", aviso: AVISO_INTERNO[cal.motivo] ?? null };
  return { ok: true, entrevistaId, modo: "interno", aviso: `Se guardó en LivHire, pero no en Google Calendar: ${cal.error}` };
}
