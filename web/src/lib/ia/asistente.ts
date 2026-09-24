import "server-only";
import { z } from "zod";
import { NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import type { EtapaProceso, RolUsuario } from "@/lib/supabase/types";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import { conLimite, clasificarError, detalleSeguro } from "./seguro";
import { hechosVacante, priorizar, rutaVacante, type EntradaPrioridad, type Item } from "./prioridad-hm";
import { normalizar } from "./semaforo";
import { registrarAuditSeguro, type Actor } from "./servicio";
import { temasProhibidos } from "./temas-prohibidos";

// Agente 8 de docs/04: Liv, el asistente del proceso (HM, AT, HRBP, admin).
// Solo lee y guía; no ejecuta acciones. Responde preguntas LIBRES sobre el proceso
// con los datos reales que el usuario ve (vacantes, etapas, SLA, pendientes,
// candidatos, decisiones). Para "¿qué tengo que hacer hoy?" el ORDEN lo decide el
// código (priorizar) y se valida que el modelo lo respete. En todo caso se valida que
// no invente cifras ni afirme haber hecho algo. Si el modelo falla o tarda, responde
// un texto de respaldo con los mismos datos: nunca se queda sin respuesta.

export const VERSION_PROMPT_ASISTENTE = "asistente-v3";
// Baja pero no 0: texto breve y natural; el contenido lo acota la validación.
const TEMPERATURA_ASISTENTE = 0.2;
const LIMITE_ASISTENTE_MS = 18_000;
const MAX_PALABRAS = 170;
// Mínimo de pendientes que una respuesta de "pendientes" debe cubrir (los más urgentes, en orden).
const MIN_CITADOS = 3;
const MAX_CANDIDATOS_CONTEXTO = 60;
const MAX_DECISIONES_CONTEXTO = 12;

export { priorizar };

export interface CandidatoVisible {
  nombre: string;
  vacante: string;
  estatus: string;
  etapa: EtapaProceso;
  fit_score: number | null;
  es_referido: boolean;
}
export interface DecisionVisible {
  fecha: string; // YYYY-MM-DD
  decision: string;
  candidato: string;
  vacante: string;
}

export interface EntradaAsistente extends EntradaPrioridad {
  pregunta: string;
  actor: Actor;
  /** Nombre de quien pregunta (para el trato) y su rol: define el alcance de los datos. */
  nombre?: string;
  candidatos?: CandidatoVisible[];
  decisiones?: DecisionVisible[];
  prueba?: boolean;
}

export interface ResultadoAsistente {
  respuesta: string;
  enlaces: { titulo: string; href: string }[];
  generado_por: "ia" | "respaldo";
}

// Preguntas de "qué hago hoy / qué es lo más urgente": el código exige el orden de prioridad.
const PREGUNTA_PENDIENTES = /\b(hoy|pendiente|pendientes|prioridad|priorizo|urgente|urgentes|primero|por donde empiezo|que (tengo|debo) que hacer|que hago|que me toca|mi dia)\b/;
export const esPreguntaDePendientes = (pregunta: string) => PREGUNTA_PENDIENTES.test(normalizar(pregunta));

const Salida = z.object({
  tipo: z.enum(["pendientes", "consulta", "fuera_de_tema"]),
  respuesta: z.string(),
  items_citados: z.array(z.string()),
  vacantes_citadas: z.array(z.string()),
});

const ROL_TEXTO: Record<RolUsuario, string> = {
  hm: "Hiring Manager",
  at: "reclutador(a) de Atracción de Talento",
  hrbp: "HR Business Partner",
  admin: "administrador(a) de la plataforma",
  entrevistador: "entrevistador(a)",
};

function sistema(rol: RolUsuario) {
  return `Eres Liv, la asistente de LivHire (reclutamiento de El Puerto de Liverpool). Hablas con un(a) ${ROL_TEXTO[rol]}.
Respondes su pregunta usando SOLO los DATOS que te doy: son todo lo que esta persona puede ver.

Clasifica la pregunta en "tipo":
- "pendientes": qué hacer hoy, qué es lo más urgente, por dónde empezar. Usa la lista PENDIENTES (ya ordenada): empieza por item-1 y cubre como mínimo los ${MIN_CITADOS} primeros (o todos si hay menos), en ese orden, uno por frase.
- "consulta": cualquier otra pregunta sobre el proceso de reclutamiento (qué vacante va más atrasada, quién bloquea, cuántas están en riesgo, en qué va un candidato, qué decisiones se tomaron, fechas de cobertura…). Responde exactamente lo que se pregunta, directo.
- "fuera_de_tema": no es sobre reclutamiento o el proceso. Responde en una frase amable que solo ayudas con el proceso de reclutamiento en LivHire, sin datos.

Reglas:
- Español, tono ejecutivo, directo y breve (máximo ${MAX_PALABRAS} palabras). Trato de "tú".
- No inventes cifras, fechas ni nombres: usa solo lo que está en DATOS (los conteos ya vienen calculados en RESUMEN). Si el dato no está, dilo.
- Menciona vacantes y pendientes por su nombre exacto (el título).
- Solo guías: no digas que ya hiciste, aprobaste, decidiste o enviaste algo, ni ofrezcas hacerlo. Las decisiones son de las personas.
- No opines sobre edad, género, estado civil, salud, religión, origen ni otros datos personales sensibles.
- "items_citados": ids item-N de PENDIENTES que mencionaste, en el orden en que aparecen.
- "vacantes_citadas": ids vac-N de VACANTES que mencionaste.`;
}

interface Contexto {
  items: Item[];
  vacantes: { id: string; titulo: string; href: string }[];
  hechos: string;
}

function contexto(e: EntradaAsistente): Contexto {
  const rol = e.yo?.rol ?? "hm";
  const items = priorizar(e);
  const vs = e.vacantes;
  const cuenta = (f: (v: (typeof vs)[number]) => boolean) => vs.filter(f).length;
  const resumen = [
    `${vs.length} vacantes activas`,
    `${cuenta((v) => v.semaforo === "atrasada")} atrasadas`,
    `${cuenta((v) => v.semaforo === "en_riesgo")} en riesgo`,
    `${cuenta((v) => v.semaforo === "a_tiempo")} a tiempo`,
    `${cuenta((v) => v.esperando_hm)} esperan decisión del HM`,
    `${e.borradoresPendientes} avisos a candidatos por aprobar`,
    `${(e.candidatos ?? []).length} candidatos en proceso visibles`,
  ].join("; ");

  const vacantes = vs.map((v, i) => ({ id: `vac-${i + 1}`, titulo: v.titulo, href: rutaVacante(v.id, rol), v }));
  const lineasVacantes = vacantes.map(({ id, titulo, v }) => {
    const cands = (e.candidatos ?? []).filter((c) => c.vacante === titulo);
    const porEstatus = Object.entries(cands.reduce<Record<string, number>>((a, c) => ((a[c.estatus] = (a[c.estatus] ?? 0) + 1), a), {}))
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    return `[${id}] "${titulo}": semáforo ${v.semaforo.replace("_", " ")}; ${hechosVacante(v).join("; ")}; responsable ahora: ${v.responsable.nombre ?? v.responsable.rol ?? "nadie"}; cobertura estimada: ${v.fecha_estimada_cobertura ?? "sin fecha"}; HM ${v.directorio.hm ?? "—"}, AT ${v.directorio.at ?? "—"}, HRBP ${v.directorio.hrbp ?? "—"}; candidatos: ${porEstatus || "ninguno"}`;
  });
  const candidatos = (e.candidatos ?? []).slice(0, MAX_CANDIDATOS_CONTEXTO).map(
    (c) => `- ${c.nombre} · "${c.vacante}" · ${c.estatus} · etapa ${NOMBRE_ETAPA[c.etapa] ?? c.etapa}${c.fit_score !== null ? ` · fit ${c.fit_score}` : ""}${c.es_referido ? " · referido" : ""}`,
  );
  const decisiones = (e.decisiones ?? []).slice(0, MAX_DECISIONES_CONTEXTO).map((d) => `- ${d.fecha} · ${d.decision} · ${d.candidato} · "${d.vacante}"`);

  const hechos = [
    `RESUMEN: ${resumen}.`,
    "",
    "PENDIENTES (ya ordenados por prioridad):",
    ...(items.length ? items.map((it) => `[${it.id}] "${it.titulo}": ${it.hechos}`) : ["(ninguno urgente)"]),
    "",
    "VACANTES:",
    ...(lineasVacantes.length ? lineasVacantes : ["(ninguna activa)"]),
    "",
    "CANDIDATOS:",
    ...(candidatos.length ? candidatos : ["(ninguno visible)"]),
    "",
    "DECISIONES RECIENTES:",
    ...(decisiones.length ? decisiones : ["(ninguna)"]),
  ].join("\n");
  return { items, vacantes: vacantes.map(({ id, titulo, href }) => ({ id, titulo, href })), hechos };
}

function validar(crudo: z.infer<typeof Salida>, c: Contexto, deberiaSerPendientes: boolean) {
  const errores: string[] = [];
  const r = crudo.respuesta.trim();
  const nr = normalizar(r);

  if (!r) errores.push("La respuesta está vacía");
  const palabras = r.split(/\s+/).filter(Boolean).length;
  if (palabras > MAX_PALABRAS) errores.push(`La respuesta tiene ${palabras} palabras; máximo ${MAX_PALABRAS}`);

  const ids = c.items.map((i) => i.id);
  const citados = crudo.items_citados;
  if (citados.some((x) => !ids.includes(x))) errores.push(`items_citados solo puede usar: ${ids.join(", ") || "(vacío)"}`);
  if (new Set(citados).size !== citados.length) errores.push("items_citados tiene repetidos");
  const idsVac = c.vacantes.map((v) => v.id);
  if (crudo.vacantes_citadas.some((x) => !idsVac.includes(x))) errores.push(`vacantes_citadas solo puede usar: ${idsVac.join(", ") || "(vacío)"}`);

  if (deberiaSerPendientes && crudo.tipo !== "pendientes") errores.push('La pregunta es sobre pendientes/prioridades: usa tipo "pendientes"');
  if (crudo.tipo === "pendientes") {
    const posiciones = citados.map((x) => ids.indexOf(x));
    if (posiciones.some((p, i) => i > 0 && p < posiciones[i - 1])) errores.push("Respeta el orden de prioridad (item-1 primero)");
    if (c.items.length && citados[0] !== "item-1") errores.push("Empieza por item-1, el pendiente más urgente");
    const minimo = Math.min(MIN_CITADOS, c.items.length);
    const faltan = ids.slice(0, minimo).filter((id) => !citados.includes(id));
    if (faltan.length) errores.push(`Cubre al menos los ${minimo} pendientes más urgentes; faltan: ${faltan.join(", ")}`);
  }
  for (const x of citados) {
    const it = c.items.find((i) => i.id === x);
    if (it && !nr.includes(normalizar(it.titulo))) errores.push(`Menciona "${it.titulo}" por su nombre exacto`);
  }
  for (const x of crudo.vacantes_citadas) {
    const v = c.vacantes.find((i) => i.id === x);
    if (v && !nr.includes(normalizar(v.titulo))) errores.push(`Menciona "${v.titulo}" por su nombre exacto`);
  }

  // Sin cifras inventadas: cada número de la respuesta debe estar en los datos.
  const numeros = r.match(/\d+/g) ?? [];
  const inventados = numeros.filter((n) => !new RegExp(`\\b${n}\\b`).test(c.hechos));
  if (inventados.length) errores.push(`No inventes cifras: ${[...new Set(inventados)].join(", ")} no está en los datos`);

  if (/\b(ya\s+)?(aprob[eé]|decid[ií]|envi[eé]|registr[eé]|he\s+(aprobado|decidido|enviado|registrado))\b/.test(nr)) {
    errores.push("Solo guías: no afirmes haber ejecutado acciones");
  }
  const temas = temasProhibidos(r);
  if (temas.length) errores.push(`Toca un tema prohibido (${temas.join(", ")})`);

  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: { tipo: crudo.tipo, respuesta: r, citados, vacantes: crudo.vacantes_citadas } };
}

// Respaldo determinista: mismos datos y mismo orden, sin LLM.
function respaldo(items: Item[]): string {
  if (!items.length) return "Hoy no tienes pendientes urgentes: tus vacantes van a tiempo y ninguna espera algo de ti.";
  const lineas = items.map((it, i) => `${i + 1}. ${it.titulo} — ${it.hechos}.`);
  return `Tus pendientes, por prioridad:\n${lineas.join("\n")}`;
}

/** Responde a quien pregunta. Nunca lanza: si el modelo falla o tarda, devuelve el respaldo. */
export async function responderAsistente(e: EntradaAsistente): Promise<ResultadoAsistente> {
  const t0 = Date.now();
  const rol = e.yo?.rol ?? "hm";
  const c = contexto(e);
  const enlacesDe = (xs: { titulo: string; href: string }[]) => {
    const vistos = new Set<string>();
    return xs.filter((x) => x.href && !vistos.has(x.href) && vistos.add(x.href)).map(({ titulo, href }) => ({ titulo, href }));
  };
  const dePendientes = esPreguntaDePendientes(e.pregunta);

  let resultado: ResultadoAsistente;
  let detalle: Record<string, unknown>;
  if (dePendientes && !c.items.length) {
    resultado = { respuesta: respaldo(c.items), enlaces: [], generado_por: "respaldo" };
    detalle = { ok: true, motivo: "sin_pendientes" };
  } else {
    try {
      const x = await conLimite(LIMITE_ASISTENTE_MS, (ej) =>
        generarValidado({
          modelo: MODELO_EXTRACCION,
          sistema: sistema(rol),
          usuario: `PREGUNTA${e.nombre ? ` DE ${e.nombre.toUpperCase()}` : ""}: ${e.pregunta}\n\nDATOS:\n${c.hechos}`,
          schema: Salida,
          nombreSchema: "respuesta_liv",
          temperatura: TEMPERATURA_ASISTENTE,
          signal: ej.signal,
          validar: (crudo) => validar(crudo, c, dePendientes),
        }),
      );
      if ("timeout" in x) throw Object.assign(new Error("timeout"), { name: "TimeoutIA" });
      const citados = x.valor.citados.map((id) => c.items.find((it) => it.id === id)).filter((it): it is Item => Boolean(it));
      const vacs = x.valor.vacantes.map((id) => c.vacantes.find((v) => v.id === id)).filter((v): v is Contexto["vacantes"][number] => Boolean(v));
      const enlaces = x.valor.tipo === "fuera_de_tema" ? [] : enlacesDe([...citados, ...vacs]);
      resultado = { respuesta: x.valor.respuesta, enlaces, generado_por: "ia" };
      detalle = { ok: true, tipo: x.valor.tipo, modelo: x.modelo, intentos: x.intentos, errores_intentos_previos: x.erroresPrevios };
    } catch (err) {
      resultado = { respuesta: respaldo(c.items), enlaces: enlacesDe(c.items), generado_por: "respaldo" };
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
      agente: "asistente_liv",
      prompt: VERSION_PROMPT_ASISTENTE,
      temperature: TEMPERATURA_ASISTENTE,
      rol,
      pendientes: c.items.length,
      prioridades: c.items.map((it) => it.prioridad),
      pregunta_de_pendientes: dePendientes,
      generado_por: resultado.generado_por,
      largo_pregunta: e.pregunta.length, // no se guarda el texto de la pregunta
      duracion_ms: Date.now() - t0,
      ...detalle,
    },
  });
  return resultado;
}
