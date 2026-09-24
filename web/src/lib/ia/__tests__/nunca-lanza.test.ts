// Prueba del contrato "nunca lanza" de sugerirVacantes y personalizarBorrador.
// OpenAI y Supabase se simulan reemplazando `fetch` global (sin tocar el código
// de producción). Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { personalizarBorrador, sugerirVacantes } from "../index";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.prueba";
process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-prueba";
process.env.OPENAI_API_KEY = "sk-prueba";

// --- fetch simulado ---------------------------------------------------------
interface Peticion {
  host: string;
  ruta: string; // p. ej. "candidato_vacante" o "chat/completions"
  metodo: string;
  select: string;
  cuerpo: string;
  objeto: boolean; // pidió un solo objeto (vnd.pgrst.object)
  signal?: AbortSignal | null;
}
type Manejador = (p: Peticion) => Response | Promise<Response>;

const llamadas: Peticion[] = [];
let manejador: Manejador = () => json({ message: "sin manejador" }, 500);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const headers = new Headers(init?.headers ?? req?.headers);
  const cuerpo = typeof init?.body === "string" ? init.body : req ? await req.clone().text() : "";
  const p: Peticion = {
    host: url.host,
    ruta: url.pathname.replace(/^\/rest\/v1\//, "").replace(/^\/v1\//, ""),
    metodo: (init?.method ?? req?.method ?? "GET").toUpperCase(),
    select: url.searchParams.get("select") ?? "",
    cuerpo,
    objeto: (headers.get("accept") ?? "").includes("vnd.pgrst.object"),
    signal: init?.signal ?? req?.signal,
  };
  llamadas.push(p);
  return manejador(p);
}) as typeof fetch;

// --- utilidades -----------------------------------------------------------------
const rechazos: unknown[] = [];
process.on("unhandledRejection", (e) => rechazos.push(e));

const CID = "11111111-aaaa-4aaa-8aaa-000000000001";
const CVID = "22222222-aaaa-4aaa-8aaa-000000000002";
const VID = "33333333-aaaa-4aaa-8aaa-000000000003";
const V2 = "33333333-aaaa-4aaa-8aaa-000000000004";
const NID = "44444444-aaaa-4aaa-8aaa-000000000005";
const NN1 = "55555555-aaaa-4aaa-8aaa-000000000006";

const esSupabase = (p: Peticion) => p.host === "supabase.prueba";
const tabla = (p: Peticion, t: string) => esSupabase(p) && p.ruta === t;
const auditorias = () => llamadas.filter((p) => tabla(p, "audit_log") && p.metodo === "POST").map((p) => JSON.parse(p.cuerpo));
const escrituras = (t: string) => llamadas.filter((p) => tabla(p, t) && p.metodo !== "GET");
const colgada = (p: Peticion) =>
  new Promise<Response>((_, rechazar) => {
    p.signal?.addEventListener("abort", () => rechazar(new DOMException("Abortado", "AbortError")));
  });

function chat(contenido: unknown) {
  return json({
    id: "chatcmpl-prueba",
    object: "chat.completion",
    created: 0,
    model: "gpt-4.1-prueba",
    choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: JSON.stringify(contenido), refusal: null } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });
}

// Mensaje que pasa todas las validaciones del agente 5.
function mensajeValido() {
  const frases = [
    "Gracias por el tiempo y el interés que dedicaste al proceso de Gerente de Pruebas.",
    "Valoramos mucho tu coordinacion multiarea, que se notó en cada conversación.",
  ];
  let texto = `Hola, {{nombre}}:\n\n${frases.join(" ")}`;
  while (texto.split(/\s+/).length < 140) texto += " Te deseamos mucho éxito en tus próximos proyectos profesionales.";
  return `${texto}\n\nEquipo de Atracción de Talento de Liverpool`;
}

// Base de datos simulada para personalizarBorrador.
function bdNotificacion(estatus = "borrador", update: unknown[] = [{ id: NID }]): Manejador {
  return (p) => {
    if (tabla(p, "audit_log")) return json([], 201);
    if (tabla(p, "notificaciones") && p.metodo === "GET") {
      return json([{ id: NID, destinatario_tipo: "candidato", destinatario_id: CID, vacante_id: VID, tipo: "resultado", estatus, contenido: "Hola Ana, gracias por participar." }]);
    }
    if (tabla(p, "notificaciones") && p.metodo === "PATCH") return json(update);
    if (tabla(p, "candidatos")) return json([{ nombre: "Ana Prueba" }]);
    if (tabla(p, "candidato_vacante")) {
      return json([{ estatus: "descartado", ficha: { descripcion: "Perfil de pruebas.", fortalezas: ["Coordinacion multiarea", "Comunicacion ejecutiva"] } }]);
    }
    if (tabla(p, "vacantes")) return json([{ titulo: "Gerente de Pruebas" }]);
    if (tabla(p, "decisiones") || tabla(p, "entrevistas") || tabla(p, "sugerencias_vacante")) return json([]);
    return json({ message: `ruta no simulada: ${p.ruta}` }, 500);
  };
}

beforeEach(() => {
  llamadas.length = 0;
});

after(async () => {
  // Deja correr cualquier promesa pendiente (llamadas abortadas) antes de revisar.
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(rechazos.length, 0, `hubo rechazos sin manejar: ${rechazos.map(String).join("; ")}`);
});

// --- sugerirVacantes ------------------------------------------------------------
describe("sugerirVacantes nunca lanza", () => {
  it("id con formato inválido → no_encontrado", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json([], 201) : json({}, 500));
    const r = await sugerirVacantes("no-es-uuid");
    assert.deepEqual([r.ok, !r.ok && r.error], [false, "no_encontrado"]);
    assert.equal(auditorias()[0].detalle.ok, false);
  });

  it("sin proceso no seleccionado → sin_proceso_no_seleccionado (y audita)", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json([], 201) : json([]));
    const r = await sugerirVacantes(CID, { prueba: true });
    assert.equal(!r.ok && r.error, "sin_proceso_no_seleccionado");
    const a = auditorias();
    assert.equal(a.length, 1);
    assert.equal(a[0].detalle.error, "sin_proceso_no_seleccionado");
    assert.equal(a[0].detalle.prueba, true);
  });

  it("error de base de datos → interno", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json([], 201) : json({ message: "bd caída", code: "XX000" }, 500));
    const r = await sugerirVacantes(CID);
    assert.equal(!r.ok && r.error, "interno");
    assert.ok(!r.ok && (r.detalle ?? "").length <= 140);
  });

  it("base de datos colgada → timeout dentro del límite", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json([], 201) : colgada(p));
    const t0 = Date.now();
    const r = await sugerirVacantes(CID, { limiteMs: 150 });
    assert.equal(!r.ok && r.error, "timeout");
    assert.ok(Date.now() - t0 < 2000);
  });

  it("salida del modelo inválida → salida_invalida, sin escribir sugerencias", async () => {
    manejador = (p) => {
      if (tabla(p, "audit_log")) return json([], 201);
      if (tabla(p, "candidato_vacante") && p.select === "id") return json([{ id: CVID }]);
      if (tabla(p, "candidato_vacante") && p.select.includes("ficha")) {
        return json([{ id: CVID, candidato_id: CID, vacante_id: VID, estatus: "descartado", ficha: { descripcion: "Perfil de pruebas.", fortalezas: ["Arquitectura"] }, cumple_no_negociables: [], candidatos: { nombre: "Ana Prueba", escolaridad: "Ingeniería" } }]);
      }
      if (tabla(p, "candidato_vacante")) return json([{ vacante_id: VID }]);
      if (tabla(p, "vacantes")) return json([{ id: V2, titulo: "Arquitecto de Pruebas", descripcion: "Diseño de sistemas.", no_negociables: [{ id: NN1, texto: "Certificacion cloud vigente", tipo: "estudios" }] }]);
      if (tabla(p, "sugerencias_vacante")) return json([]);
      if (p.ruta === "embeddings") return json({ object: "list", model: "text-embedding-3-small", data: [{ object: "embedding", index: 0, embedding: [1, 0, 0] }, { object: "embedding", index: 1, embedding: [1, 0, 0] }], usage: { prompt_tokens: 5, total_tokens: 5 } });
      if (p.ruta === "chat/completions") return chat({ vacantes: [] }); // falta la vacante → no valida
      return json({ message: `ruta no simulada: ${p.ruta}` }, 500);
    };
    const r = await sugerirVacantes(CID);
    assert.equal(!r.ok && r.error, "salida_invalida");
    assert.equal(llamadas.filter((p) => p.ruta === "chat/completions").length, 3);
    assert.equal(escrituras("sugerencias_vacante").length, 0);
    assert.equal(auditorias().at(-1).detalle.error, "salida_invalida");
  });

  it("falla también el audit_log → devuelve el error igual, sin lanzar", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json({ message: "audit caído" }, 500) : json([]));
    const r = await sugerirVacantes(CID);
    assert.equal(!r.ok && r.error, "sin_proceso_no_seleccionado");
  });

  it("se puede llamar sin await (no deja rechazos sin manejar)", async () => {
    manejador = () => json({ message: "todo falla" }, 500);
    void sugerirVacantes(CID);
    void sugerirVacantes("no-es-uuid");
    await new Promise((r) => setTimeout(r, 200));
  });
});

// --- personalizarBorrador -------------------------------------------------------
describe("personalizarBorrador nunca lanza", () => {
  it("la notificación ya no es borrador → no_es_borrador, sin llamar al modelo", async () => {
    manejador = bdNotificacion("enviada");
    const r = await personalizarBorrador(NID);
    assert.equal(!r.ok && r.error, "no_es_borrador");
    assert.equal(llamadas.filter((p) => p.ruta === "chat/completions").length, 0);
  });

  it("error de base de datos → interno", async () => {
    manejador = (p) => (tabla(p, "audit_log") ? json([], 201) : json({ message: "bd caída" }, 500));
    const r = await personalizarBorrador(NID);
    assert.equal(!r.ok && r.error, "interno");
  });

  it("OpenAI responde error → interno, sin actualizar la fila", async () => {
    const bd = bdNotificacion();
    manejador = (p) => (p.ruta === "chat/completions" ? json({ error: { message: "petición inválida", type: "invalid_request_error" } }, 400) : bd(p));
    const r = await personalizarBorrador(NID);
    assert.equal(!r.ok && r.error, "interno");
    assert.equal(escrituras("notificaciones").length, 0);
  });

  it("salida inválida 3 veces → salida_invalida, sin actualizar la fila", async () => {
    const bd = bdNotificacion();
    manejador = (p) => (p.ruta === "chat/completions" ? chat({ mensaje: "Hola, {{nombre}}: muy corto.", fortalezas_usadas: [] }) : bd(p));
    const r = await personalizarBorrador(NID);
    assert.equal(!r.ok && r.error, "salida_invalida");
    assert.equal(llamadas.filter((p) => p.ruta === "chat/completions").length, 3);
    assert.equal(escrituras("notificaciones").length, 0);
    const a = auditorias().at(-1);
    assert.equal(a.detalle.error, "salida_invalida");
    assert.ok(!JSON.stringify(a).includes("Ana"), "el audit no debe llevar el nombre");
  });

  it("modelo colgado → timeout y nunca escribe después", async () => {
    const bd = bdNotificacion();
    manejador = (p) => (p.ruta === "chat/completions" ? colgada(p) : bd(p));
    const t0 = Date.now();
    const r = await personalizarBorrador(NID, { limiteMs: 200 });
    assert.equal(!r.ok && r.error, "timeout");
    assert.ok(Date.now() - t0 < 2000);
    await new Promise((res) => setTimeout(res, 300));
    assert.equal(escrituras("notificaciones").length, 0);
  });

  it("aprobada mientras se redactaba (UPDATE afecta 0 filas) → no_es_borrador", async () => {
    const bd = bdNotificacion("borrador", []);
    manejador = (p) => (p.ruta === "chat/completions" ? chat({ mensaje: mensajeValido(), fortalezas_usadas: ["Coordinacion multiarea"] }) : bd(p));
    const r = await personalizarBorrador(NID);
    assert.equal(!r.ok && r.error, "no_es_borrador");
    assert.equal(escrituras("notificaciones").length, 1);
  });

  it("camino feliz → ok, actualiza con el nombre ya sustituido", async () => {
    const bd = bdNotificacion();
    manejador = (p) => (p.ruta === "chat/completions" ? chat({ mensaje: mensajeValido(), fortalezas_usadas: ["Coordinacion multiarea"] }) : bd(p));
    const r = await personalizarBorrador(NID);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.actualizado);
    const patch = JSON.parse(escrituras("notificaciones")[0].cuerpo);
    assert.ok(patch.contenido.startsWith("Hola, Ana:"));
    assert.ok(!patch.contenido.includes("{{nombre}}"));
  });

  it("se puede llamar sin await (no deja rechazos sin manejar)", async () => {
    manejador = () => json({ message: "todo falla" }, 500);
    void personalizarBorrador(NID);
    void personalizarBorrador("no-es-uuid");
    await new Promise((r) => setTimeout(r, 200));
  });
});
