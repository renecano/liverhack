import "server-only";
import { z } from "zod";
import { INFO_ESTADO, NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import type { ResumenVacante } from "@/lib/orquestador/resumen";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import { conLimite, clasificarError, detalleSeguro } from "./seguro";
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
const MAX_ITEMS = 8;
// Mínimo de pendientes que la respuesta debe cubrir (los más urgentes, en orden).
const MIN_CITADOS = 3;

export interface EntradaAsistente {
  pregunta: string;
  vacantes: ResumenVacante[];
  /** Candidatos por decidir en vacantes en ESPERANDO_HM_DECIDE_FINALISTA, por id de vacante. */
  porDecidir: Record<string, number>;
  /** Avisos a candidatos en borrador, pendientes de aprobar (cero ghosting). */
  borradoresPendientes: number;
  actor: Actor;
  prueba?: boolean;
}

export interface ResultadoAsistente {
  respuesta: string;
  enlaces: { titulo: string; href: string }[];
  generado_por: "ia" | "respaldo";
}

interface Item {
  id: string; // item-1, item-2… (en orden de prioridad)
  prioridad: 1 | 2 | 3 | 4 | 5;
  titulo: string;
  href: string;
  hechos: string;
}

const ETIQUETA_PRIORIDAD: Record<Item["prioridad"], string> = {
  1: "Atrasada y te espera a ti (bloqueas el proceso)",
  2: "Requiere tu decisión",
  3: "Atrasada: dale seguimiento",
  4: "En riesgo",
  5: "Próxima a vencer",
};

function prioridad(v: ResumenVacante): Item["prioridad"] | null {
  const atrasada = v.semaforo === "atrasada";
  if (atrasada && v.esperando_hm) return 1;
  if (v.esperando_hm) return 2;
  if (atrasada) return 3;
  if (v.semaforo === "en_riesgo") return 4;
  if (v.dias_restantes !== null && v.dias_restantes <= 3) return 5;
  return null;
}

// Lista ordenada por prioridad, calculada en código a partir del resumen real.
export function priorizar(e: Pick<EntradaAsistente, "vacantes" | "porDecidir" | "borradoresPendientes">): Item[] {
  const candidatos = e.vacantes
    .map((v) => ({ v, p: prioridad(v) }))
    .filter((x): x is { v: ResumenVacante; p: Item["prioridad"] } => x.p !== null)
    .sort((a, b) => a.p - b.p || (a.v.dias_restantes ?? 999) - (b.v.dias_restantes ?? 999));

  const items: Item[] = candidatos.slice(0, MAX_ITEMS).map(({ v, p }, i) => {
    const partes = [
      `${ETIQUETA_PRIORIDAD[p]}`,
      `estado: ${INFO_ESTADO[v.estado].descripcion}`,
      `etapa: ${NOMBRE_ETAPA[v.etapa_actual]}`,
      v.dias_restantes === null
        ? null
        : v.dias_restantes < 0
          ? `vencida hace ${Math.abs(v.dias_restantes)} días hábiles`
          : `${v.dias_restantes} días hábiles restantes`,
      v.bloquea ? `bloquea: ${v.bloquea.nombre ?? v.bloquea.rol}` : null,
      e.porDecidir[v.id] ? `${e.porDecidir[v.id]} candidatos por decidir` : null,
    ].filter(Boolean);
    return { id: `item-${i + 1}`, prioridad: p, titulo: v.titulo, href: `/hm/vacantes/${v.id}`, hechos: partes.join("; ") };
  });

  if (e.borradoresPendientes > 0) {
    // Cero ghosting: los avisos a candidatos esperan aprobación humana.
    const pos = items.findIndex((it) => it.prioridad > 3);
    const aviso: Item = {
      id: "",
      prioridad: 4,
      titulo: "Avisos a candidatos por aprobar",
      href: "/hm",
      hechos: `${e.borradoresPendientes} avisos en borrador en el centro de notificaciones (revisar, personalizar y aprobar)`,
    };
    items.splice(pos === -1 ? items.length : pos, 0, aviso);
  }
  return items.map((it, i) => ({ ...it, id: `item-${i + 1}` }));
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
