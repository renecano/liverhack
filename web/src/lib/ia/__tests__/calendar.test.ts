// Google Calendar con degradación (lib/acciones/calendar.ts). Supabase, el OAuth de Google y
// la Calendar API se simulan con fetch global: nada sale a la red.
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { agendarEnCalendar, motivoGoogle, tokenInvalido } from "@/lib/acciones/calendar";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.prueba";
process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-prueba";

interface Peticion { host: string; ruta: string; metodo: string; query: URLSearchParams; cuerpo: string }
const llamadas: Peticion[] = [];
let manejador: (p: Peticion) => Response = () => json({ message: "sin manejador" }, 500);
const HOSTS_PERMITIDOS = new Set(["supabase.prueba", "oauth2.googleapis.com", "www.googleapis.com"]);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const cuerpo = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : req ? await req.clone().text() : "";
  const p = { host: url.host, ruta: url.pathname, metodo: (init?.method ?? req?.method ?? "GET").toUpperCase(), query: url.searchParams, cuerpo };
  llamadas.push(p);
  if (!HOSTS_PERMITIDOS.has(p.host)) throw new Error(`Llamada inesperada a ${p.host}`);
  return manejador(p);
}) as typeof fetch;
// googleapis (gaxios) no usa el fetch global en Node: usa node-fetch salvo que exista
// window.fetch. Se le da el mismo fetch simulado para que NADA salga a Google.
(globalThis as unknown as { window: { fetch: typeof fetch } }).window = { fetch: globalThis.fetch };

const AT = "11111111-1111-1111-1111-111111111102";
const evento = {
  organizadorId: AT,
  titulo: "Entrevista de panel: Ana · Gerente",
  descripcion: "Scorecard: http://x/entrevistador/1",
  inicio: "2026-09-25T11:00",
  fin: "2026-09-25T11:45",
  invitados: [{ email: "sofia@ejemplo.com", nombre: "Sofia" }],
};
const conexion = { usuario_id: AT, google_email: "at@gmail.com", refresh_token: "1//refresh", access_token: null, expira_en: null, actualizado_en: "2026-09-24T00:00:00Z" };

// Supabase: google_conexiones existe y el AT está conectado (salvo que el caso diga otra cosa).
function supabase(p: Peticion, opciones: { sinTabla?: boolean } = {}): Response | null {
  if (p.host !== "supabase.prueba") return null;
  if (opciones.sinTabla) return json({ code: "PGRST205", message: "Could not find the table 'public.google_conexiones'" }, 404);
  if (p.metodo === "GET") return json([conexion]);
  return json([], 200); // PATCH (token renovado) / DELETE (olvidar conexión)
}

function conCredenciales() {
  process.env.ACTIONS_MODE = "real";
  process.env.GOOGLE_CLIENT_ID = "id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secreto";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/google/callback";
}

beforeEach(() => {
  llamadas.length = 0;
  delete process.env.GOOGLE_CALENDAR_SEND_UPDATES;
});

describe("agendarEnCalendar: modo interno sin romper", () => {
  it("ACTIONS_MODE != real → interno, sin tocar la red", async () => {
    process.env.ACTIONS_MODE = "mock";
    assert.deepEqual(await agendarEnCalendar(evento), { ok: true, modo: "interno", motivo: "actions_mode" });
    assert.equal(llamadas.length, 0);
  });
  it("sin credenciales de Google → interno", async () => {
    process.env.ACTIONS_MODE = "real";
    delete process.env.GOOGLE_CLIENT_ID;
    assert.deepEqual(await agendarEnCalendar(evento), { ok: true, modo: "interno", motivo: "sin_credenciales" });
  });
  it("falta la tabla google_conexiones → interno (sin_tabla)", async () => {
    conCredenciales();
    manejador = (p) => supabase(p, { sinTabla: true }) ?? json({}, 500);
    assert.deepEqual(await agendarEnCalendar(evento), { ok: true, modo: "interno", motivo: "sin_tabla" });
  });
});

describe("agendarEnCalendar: real", () => {
  it("refresca el token, crea el evento con invitados (sin enviar correos) y persiste el token", async () => {
    conCredenciales();
    manejador = (p) =>
      supabase(p) ??
      (p.host === "oauth2.googleapis.com" ? json({ access_token: "ya29.nuevo", expires_in: 3600, token_type: "Bearer" }) : null) ??
      (p.ruta.endsWith("/calendars/primary/events") ? json({ id: "evt123", htmlLink: "https://www.google.com/calendar/event?eid=abc" }) : json({}, 404));
    const r = await agendarEnCalendar(evento);
    assert.deepEqual(r, { ok: true, modo: "real", eventId: "evt123", htmlLink: "https://www.google.com/calendar/event?eid=abc" });
    const insert = llamadas.find((p) => p.ruta.endsWith("/calendars/primary/events"))!;
    assert.equal(insert.query.get("sendUpdates"), "none");
    const cuerpo = JSON.parse(insert.cuerpo);
    assert.deepEqual(cuerpo.attendees, [{ email: "sofia@ejemplo.com", displayName: "Sofia" }]);
    assert.equal(cuerpo.start.timeZone, "America/Mexico_City");
    assert.equal(cuerpo.start.dateTime, "2026-09-25T11:00:00");
    await new Promise((res) => setTimeout(res, 20)); // el token renovado se guarda en segundo plano
    assert.ok(llamadas.some((p) => p.host === "supabase.prueba" && p.metodo === "PATCH"), "persiste el access_token renovado");
  });
  it("refresh_token revocado (invalid_grant) → interno, pide reconectar y olvida la conexión", async () => {
    conCredenciales();
    manejador = (p) => supabase(p) ?? (p.host === "oauth2.googleapis.com" ? json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400) : json({}, 404));
    const r = await agendarEnCalendar(evento);
    assert.equal(r.ok, false);
    assert.equal(r.modo, "interno");
    if (!r.ok) {
      assert.equal(r.reconectar, true);
      assert.match(r.error, /Vuelve a conectar/);
    }
    assert.ok(llamadas.some((p) => p.host === "supabase.prueba" && p.metodo === "DELETE"), "borra la conexión muerta");
  });
  it("Google responde 403 → interno con motivo claro, sin borrar la conexión", async () => {
    conCredenciales();
    manejador = (p) =>
      supabase(p) ??
      (p.host === "oauth2.googleapis.com" ? json({ access_token: "ya29.x", expires_in: 3600 }) : null) ??
      json({ error: { code: 403, message: "Request had insufficient authentication scopes." } }, 403);
    const r = await agendarEnCalendar(evento);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reconectar, false);
      assert.match(r.error, /no autorizó crear eventos/);
    }
    assert.ok(!llamadas.some((p) => p.metodo === "DELETE"));
  });
});

describe("motivoGoogle / tokenInvalido", () => {
  it("traduce errores de Google a mensajes para el AT", () => {
    assert.match(motivoGoogle({ response: { status: 429 } }), /limitó/);
    assert.match(motivoGoogle(new Error("Google no respondió en 12 s (timeout)")), /a tiempo/);
    assert.match(motivoGoogle(new Error("getaddrinfo ENOTFOUND www.googleapis.com")), /a tiempo/);
    assert.match(motivoGoogle(new Error("otra cosa")), /no respondió como se esperaba/);
    assert.equal(tokenInvalido({ response: { status: 400, data: { error: "invalid_grant" } } }), true);
    assert.equal(tokenInvalido({ response: { status: 403 } }), false);
  });
});
