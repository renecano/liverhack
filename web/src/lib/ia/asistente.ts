import "server-only";
import { z } from "zod";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import { conLimite, clasificarError, detalleSeguro } from "./seguro";
import { priorizar, type EntradaPrioridad, type Item } from "./prioridad-hm";
import { normalizar } from "./semaforo";
import { registrarAuditSeguro, type Actor } from "./servicio";
import { temasProhibidos } from "./temas-prohibidos";

// Agente 8 de docs/04: asistente del HM ("¿qué tengo que hacer hoy?").
// Solo lee y guía; no ejecuta acciones. El ORDEN de prioridad lo decide el código
// (no el LLM); el modelo solo redacta, y se valida que respete ese orden y no
// invente datos. Si el modelo falla o tarda, responde un texto de respaldo con los
// mismos datos: el HM nunca se queda sin respuesta.

export const VERSION_PROMPT_ASISTENTE = "asistente-hm-v2";
// Baja pero no 0: texto breve y natural; el contenido lo acota la validación.
const TEMPERATURA_ASISTENTE = 0.2;
const LIMITE_ASISTENTE_MS = 15_000;
const MAX_PALABRAS = 160;
// El orden lo calcula priorizar() (prioridad-hm.ts), compartido con el mcp-server.
// Mínimo de pendientes que la respuesta debe cubrir (los más urgentes, en orden).
const MIN_CITADOS = 3;

export { priorizar };

export interface EntradaAsistente extends EntradaPrioridad {
  pregunta: string;
  actor: Actor;
  prueba?: boolean;
}

export interface ResultadoAsistente {
  respuesta: string;
  enlaces: { titulo: string; href: string }[];
  generado_por: "ia" | "respaldo";
}

const Salida = z.object({ respuesta: z.string(), items_citados: z.array(z.string()) });

const SISTEMA = `Eres el asistente del Hiring Manager en LivHire (El Puerto de Liverpool).
Respondes su pregunta usando SOLO la lista de pendientes que te doy, que YA está ordenada por prioridad.

Reglas:
- Español, tono ejecutivo, directo y breve (máximo ${MAX_PALABRAS} palabras). Trato de "tú".
- Respeta el orden de la lista: empieza por item-1 y cubre como mínimo los ${MIN_CITADOS} primeros (o todos si hay menos), uno por frase. No reordenes ni inventes pendientes.
- Menciona cada pendiente por su nombre exacto (el título) y di qué hacer en una frase.
- No inventes cifras, fechas ni nombres: usa solo los datos de cada item.
- Solo guías: no digas que ya hiciste, aprobaste, decidiste o enviaste algo.
- En "items_citados" pon los ids de los items que mencionaste, en el mismo orden.
- Si la pregunta no es sobre pendientes del proceso, dilo en una frase y resume igual los pendientes.`;

function validar(crudo: z.infer<typeof Salida>, items: Item[], hechos: string) {
  const errores: string[] = [];
  const r = crudo.respuesta.trim();
  const nr = normalizar(r);
  const ids = items.map((i) => i.id);

  if (!r) errores.push("La respuesta está vacía");
  const palabras = r.split(/\s+/).filter(Boolean).length;
  if (palabras > MAX_PALABRAS) errores.push(`La respuesta tiene ${palabras} palabras; máximo ${MAX_PALABRAS}`);

  const citados = crudo.items_citados;
  if (citados.some((c) => !ids.includes(c))) errores.push(`items_citados solo puede usar: ${ids.join(", ")}`);
  if (new Set(citados).size !== citados.length) errores.push("items_citados tiene repetidos");
  const posiciones = citados.map((c) => ids.indexOf(c));
  if (posiciones.some((p, i) => i > 0 && p < posiciones[i - 1])) errores.push("Respeta el orden de prioridad (item-1 primero)");
  if (items.length && citados[0] !== "item-1") errores.push("Empieza por item-1, el pendiente más urgente");
  const minimo = Math.min(MIN_CITADOS, items.length);
  const faltan = ids.slice(0, minimo).filter((id) => !citados.includes(id));
  if (faltan.length) errores.push(`Cubre al menos los ${minimo} pendientes más urgentes; faltan: ${faltan.join(", ")}`);
  for (const c of citados) {
    const it = items.find((x) => x.id === c);
    if (it && !nr.includes(normalizar(it.titulo))) errores.push(`Menciona "${it.titulo}" por su nombre exacto`);
  }

  // Sin cifras inventadas: cada número de la respuesta debe estar en los datos.
  const numeros = r.match(/\d+/g) ?? [];
  const inventados = numeros.filter((n) => !new RegExp(`\\b${n}\\b`).test(hechos));
  if (inventados.length) errores.push(`No inventes cifras: ${[...new Set(inventados)].join(", ")} no está en los datos`);

  if (/\b(ya\s+)?(aprob[eé]|decid[ií]|envi[eé]|registr[eé]|he\s+(aprobado|decidido|enviado|registrado))\b/.test(nr)) {
    errores.push("Solo guías: no afirmes haber ejecutado acciones");
  }
  const temas = temasProhibidos(r);
  if (temas.length) errores.push(`Toca un tema prohibido (${temas.join(", ")})`);

  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: { respuesta: r, citados } };
}

// Respaldo determinista: mismos datos y mismo orden, sin LLM.
function respaldo(items: Item[]): string {
  if (!items.length) return "Hoy no tienes pendientes urgentes: tus vacantes van a tiempo y ninguna espera tu decisión.";
  const lineas = items.map((it, i) => `${i + 1}. ${it.titulo} — ${it.hechos}.`);
  return `Tus pendientes, por prioridad:\n${lineas.join("\n")}`;
}

/** Responde al HM. Nunca lanza: si el modelo falla o tarda, devuelve el respaldo. */
export async function responderAsistenteHM(e: EntradaAsistente): Promise<ResultadoAsistente> {
  const t0 = Date.now();
  const items = priorizar(e);
  const enlacesDe = (its: Item[]) => its.filter((it) => it.href).map((it) => ({ titulo: it.titulo, href: it.href }));

  let resultado: ResultadoAsistente;
  let detalle: Record<string, unknown>;
  if (!items.length) {
    resultado = { respuesta: respaldo(items), enlaces: [], generado_por: "respaldo" };
    detalle = { ok: true, motivo: "sin_pendientes" };
  } else {
    const hechos = items.map((it) => `[${it.id}] "${it.titulo}": ${it.hechos}`).join("\n");
    try {
      const x = await conLimite(LIMITE_ASISTENTE_MS, (ej) =>
        generarValidado({
          modelo: MODELO_EXTRACCION,
          sistema: SISTEMA,
          usuario: `PREGUNTA DEL HM: ${e.pregunta}\n\nPENDIENTES (ya ordenados por prioridad):\n${hechos}`,
          schema: Salida,
          nombreSchema: "respuesta_asistente_hm",
          temperatura: TEMPERATURA_ASISTENTE,
          signal: ej.signal,
          validar: (crudo) => validar(crudo, items, hechos),
        }),
      );
      if ("timeout" in x) throw Object.assign(new Error("timeout"), { name: "TimeoutIA" });
      const citados = x.valor.citados.map((c) => items.find((it) => it.id === c)!).filter(Boolean);
      resultado = { respuesta: x.valor.respuesta, enlaces: enlacesDe(citados.length ? citados : items), generado_por: "ia" };
      detalle = { ok: true, modelo: x.modelo, intentos: x.intentos, errores_intentos_previos: x.erroresPrevios };
    } catch (err) {
      resultado = { respuesta: respaldo(items), enlaces: enlacesDe(items), generado_por: "respaldo" };
      detalle = { ok: false, error: clasificarError(err), detalle: detalleSeguro(err) };
    }
  }

  await registrarAuditSeguro({
    actor: e.actor,
    accion: "ia_asistente_hm",
    entidad: "usuarios",
    entidad_id: e.actor.id,
    prueba: e.prueba,
    detalle: {
      agente: "asistente_hm",
      prompt: VERSION_PROMPT_ASISTENTE,
      temperature: TEMPERATURA_ASISTENTE,
      pendientes: items.length,
      prioridades: items.map((it) => it.prioridad),
      generado_por: resultado.generado_por,
      largo_pregunta: e.pregunta.length, // no se guarda el texto de la pregunta
      duracion_ms: Date.now() - t0,
      ...detalle,
    },
  });
  return resultado;
}
