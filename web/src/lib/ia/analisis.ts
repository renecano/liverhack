import "server-only";
import { z } from "zod";
import type { FilaCandidato } from "./consultas";
import { anonimizar } from "./anonimizar";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import { clasificarError, conLimite, detalleSeguro } from "./seguro";
import { normalizar } from "./semaforo";
import { registrarAuditSeguro, type Actor } from "./servicio";
import { temasProhibidos } from "./temas-prohibidos";

// Liv como copiloto de análisis para el AT: CONSEJO, no veredicto. Resume fortalezas
// relativas, riesgos y quién cubre mejor los no negociables de los candidatos elegidos.
// - Evaluación ciega: el modelo ve "Candidato A/B/…" con la ficha anonimizada; sin nombre,
//   compensación ni si es referido. Los nombres se reponen solo al mostrarlo.
// - No inventa: cada punto trae su fuente y una evidencia que debe aparecer LITERAL en
//   los datos de ese candidato; las cifras deben existir en los datos.
// - No decide ni registra decisiones: se rechaza lenguaje de decisión ("contrata a…").
// - La cobertura de no negociables la calcula el código. Nunca lanza: si el modelo falla,
//   devuelve un respaldo determinista con los mismos datos.

export const VERSION_PROMPT_ANALISIS = "analisis-at-v1";
const TEMPERATURA = 0.2;
const LIMITE_MS = 25_000;
const MAX_PALABRAS_RESUMEN = 90;

export const FUENTES = ["no_negociables", "ficha", "compatibilidad", "evaluaciones", "entrevistas"] as const;
type Fuente = (typeof FUENTES)[number];
export const NOMBRE_FUENTE: Record<Fuente, string> = {
  no_negociables: "Semáforo de no negociables",
  ficha: "Ficha del candidato",
  compatibilidad: "Compatibilidad (Potencial Global)",
  evaluaciones: "Evaluaciones",
  entrevistas: "Entrevistas",
};

export interface EntrevistaResumen {
  veredicto: string | null;
  notas: string | null;
}

export interface Punto {
  texto: string;
  fuente: Fuente;
  evidencia: string;
}
export interface AnalisisCandidato {
  id: string; // candidato_vacante.id
  nombre: string;
  cobertura: { cumple: number; parcial: number; no_cumple: number; total: number };
  fortalezas: Punto[];
  riesgos: Punto[];
}
export interface ResultadoAnalisis {
  resumen: string;
  no_negociables: string;
  candidatos: AnalisisCandidato[];
  fuentes: Fuente[];
  generado_por: "ia" | "respaldo";
}

const PuntoSchema = z.object({ texto: z.string(), fuente: z.enum(FUENTES), evidencia: z.string() });
const Salida = z.object({
  resumen: z.string(),
  no_negociables: z.string(),
  candidatos: z.array(z.object({ ref: z.string(), fortalezas: z.array(PuntoSchema), riesgos: z.array(PuntoSchema) })),
});

const SISTEMA = `Eres Liv, copiloto de análisis del equipo de Atracción de Talento de LivHire (El Puerto de Liverpool).
Das un CONSEJO para que el reclutador decida: nunca decides tú, nunca dices a quién contratar, descartar o elegir, y no registras nada.

Con SOLO los datos de cada candidato (anonimizados como "Candidato A", "Candidato B"…):
- "resumen": 2-4 frases (máx. ${MAX_PALABRAS_RESUMEN} palabras) con las fortalezas relativas y los riesgos principales, comparando entre candidatos si hay más de uno. Refiérete a ellos como "Candidato A", "Candidato B"… siempre uno por uno (nunca "Candidatos A y B").
- "no_negociables": 1-2 frases sobre quién cubre mejor los no negociables y qué queda por validar, según el semáforo.
- "candidatos": para cada ref, 1-3 "fortalezas" y 1-3 "riesgos". Cada punto:
  - "texto": una frase breve.
  - "fuente": de dónde sale (${FUENTES.join(", ")}).
  - "evidencia": un fragmento COPIADO LITERALMENTE de los datos de ese candidato (3-15 palabras) que respalde el punto.
Reglas: español, tono profesional y breve. No inventes cifras ni datos. No uses lenguaje de decisión ("contrata", "descarta", "elige a", "selecciona a", "la mejor opción es"): describe, no dictamines. No menciones edad, género, estado civil, salud, religión ni origen.`;

const letra = (i: number) => String.fromCharCode(65 + i);
const LENGUAJE_DECISION =
  /\b(contrat(a|ar|en|arla|arlo)|descart(a|ar|en|arla|arlo)\s+a|elige\s+a|elegir\s+a|selecciona\s+a|seleccionar\s+a|hay que (contratar|descartar|elegir)|debes (contratar|descartar|elegir|seleccionar)|la mejor opcion es|ya (decidi|registre|aprobe))\b/;

export interface Contexto {
  ref: string;
  c: FilaCandidato;
  datos: string; // bloque anonimizado que ve el modelo
  cobertura: AnalisisCandidato["cobertura"];
}

function contexto(cands: FilaCandidato[], entrevistas: Record<string, EntrevistaResumen[]>): { ctx: Contexto[]; ocultados: number } {
  let ocultados = 0;
  const ctx = cands.map((c, i) => {
    const a = (s?: string | null) => {
      if (!s) return "(sin dato)";
      const r = anonimizar(s, c.nombre);
      ocultados += Object.values(r.ocultados).reduce((x, y) => x + (y ?? 0), 0);
      return r.texto;
    };
    const lista = (xs?: string[]) => (xs?.length ? xs.map((x) => a(x)).join("; ") : "(sin dato)");
    const f = c.ficha;
    const cobertura = {
      cumple: c.no_negociables.filter((n) => n.estado === "cumple").length,
      parcial: c.no_negociables.filter((n) => n.estado === "parcial").length,
      no_cumple: c.no_negociables.filter((n) => n.estado === "no_cumple").length,
      total: c.no_negociables.length,
    };
    const ents = entrevistas[c.id] ?? [];
    const datos = [
      `Vacante: ${c.vacante_titulo}`,
      `Compatibilidad (Potencial Global): ${c.fit_score ?? "(sin dato)"}`,
      `No negociables: ${cobertura.cumple} cumple, ${cobertura.parcial} parcial, ${cobertura.no_cumple} no cumple (de ${cobertura.total})`,
      ...c.no_negociables.map((n) => `- ${n.texto}: ${n.estado ? n.estado.replace("_", " ") : "sin evaluar"}; evidencia: ${a(n.evidencia)}`),
      `Descripción: ${a(f.descripcion)}`,
      `Fortalezas: ${lista(f.fortalezas)}`,
      `Áreas de oportunidad: ${lista(f.areas_oportunidad)}`,
      `Estilo de liderazgo: ${a(f.estilo_liderazgo)}`,
      `Visión estratégica: ${a(f.vision_estrategica)}`,
      `Análisis y toma de decisiones: ${a(f.analisis_toma_decisiones)}`,
      `Idiomas: ${f.idiomas?.length ? f.idiomas.map((x) => `${x.idioma} ${x.nivel}`).join(", ") : "(sin dato)"}`,
      `Evaluaciones: ${c.evaluaciones.length ? c.evaluaciones.map((e) => `${e.tipo}: ${a(e.resumen)}`).join(" | ") : "(sin dato)"}`,
      `Entrevistas: ${
        ents.length
          ? ents.map((e) => `${e.veredicto ? e.veredicto.replace("_", " ") : "sin veredicto"}${e.notas ? ` — ${a(e.notas)}` : ""}`).join(" | ")
          : "(sin entrevistas calificadas)"
      }`,
    ].join("\n");
    return { ref: letra(i), c, datos, cobertura };
  });
  return { ctx, ocultados };
}

export function validar(crudo: z.infer<typeof Salida>, ctx: Contexto[]) {
  const errores: string[] = [];
  const refs = ctx.map((x) => x.ref);
  const todo = ctx.map((x) => x.datos).join("\n");
  const textos = [crudo.resumen, crudo.no_negociables, ...crudo.candidatos.flatMap((c) => [...c.fortalezas, ...c.riesgos].map((p) => p.texto))];

  const palabras = crudo.resumen.trim().split(/\s+/).filter(Boolean).length;
  if (!crudo.resumen.trim()) errores.push("El resumen está vacío");
  if (palabras > MAX_PALABRAS_RESUMEN) errores.push(`El resumen tiene ${palabras} palabras; máximo ${MAX_PALABRAS_RESUMEN}`);

  const vistos = crudo.candidatos.map((c) => c.ref.replace(/^candidato\s*/i, "").trim().toUpperCase());
  const faltan = refs.filter((r) => !vistos.includes(r));
  if (faltan.length) errores.push(`Incluye en "candidatos" a: ${faltan.map((r) => `Candidato ${r}`).join(", ")}`);
  if (vistos.some((r) => !refs.includes(r))) errores.push(`Solo existen: ${refs.map((r) => `Candidato ${r}`).join(", ")}`);

  crudo.candidatos.forEach((c) => {
    const ref = c.ref.replace(/^candidato\s*/i, "").trim().toUpperCase();
    const x = ctx.find((y) => y.ref === ref);
    if (!x) return;
    if (!c.fortalezas.length || !c.riesgos.length) errores.push(`Candidato ${ref}: al menos una fortaleza y un riesgo`);
    const datos = normalizar(x.datos);
    for (const p of [...c.fortalezas, ...c.riesgos]) {
      const ev = normalizar(p.evidencia);
      if (ev.split(" ").filter(Boolean).length < 2 || !datos.includes(ev)) {
        errores.push(`Candidato ${ref}: la evidencia "${p.evidencia}" no aparece literal en sus datos; copia un fragmento exacto`);
      }
    }
  });

  for (const t of textos) {
    const n = normalizar(t);
    if (LENGUAJE_DECISION.test(n)) errores.push(`Sin lenguaje de decisión (describe, no dictamines): "${t.slice(0, 80)}"`);
    // Cada candidato por separado ("Candidato A y Candidato C"), para poder reponer su nombre.
    if (/\bcandidat[oa]s\s+[a-z]\b/i.test(t) || /\bcandidat[oa]\s+[a-z](?:\s*(?:,|\by\b|\be\b|\bo\b)\s*[a-z]\b)+/i.test(t)) errores.push(`Nombra a cada candidato por separado ("Candidato A y Candidato C"), no "Candidatos A y C"`);
    const inventadas = (t.match(/\d+/g) ?? []).filter((d) => !new RegExp(`\\b${d}\\b`).test(todo));
    if (inventadas.length) errores.push(`No inventes cifras: ${[...new Set(inventadas)].join(", ")}`);
    const temas = temasProhibidos(t);
    if (temas.length) errores.push(`Toca un tema prohibido (${temas.join(", ")})`);
  }

  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: crudo };
}

// "Candidato A" → nombre real, solo al mostrarlo. Absorbe el artículo: "el/la Candidato A"
// → "Ana López", "del Candidato A" → "de Ana López", "al Candidato A" → "a Ana López".
export function conNombres(texto: string, refs: { ref: string; nombre: string }[]) {
  return refs.reduce(
    (t, x) =>
      t.replace(new RegExp(`\\b(?:(del|al|el|la)\\s+)?candidat[oa]\\s+${x.ref}\\b`, "gi"), (_m, art?: string) => {
        const a = art?.toLowerCase();
        const pre = a === "del" ? "de " : a === "al" ? "a " : "";
        const mayuscula = Boolean(art && art[0] !== art[0].toLowerCase());
        return (mayuscula && pre ? pre[0].toUpperCase() + pre.slice(1) : pre) + x.nombre;
      }),
    texto,
  );
}

function respaldo(ctx: Contexto[]): ResultadoAnalisis {
  const orden = [...ctx].sort((a, b) => b.cobertura.cumple - a.cobertura.cumple || a.cobertura.no_cumple - b.cobertura.no_cumple);
  const mejor = orden[0];
  const punto = (texto: string, fuente: Fuente, evidencia: string): Punto => ({ texto, fuente, evidencia });
  return {
    resumen: "Liv no pudo redactar el análisis en este momento; abajo está el resumen directo de la ficha y del semáforo de cada candidato.",
    no_negociables: mejor
      ? `Por el semáforo, ${mejor.c.nombre} cumple ${mejor.cobertura.cumple} de ${mejor.cobertura.total} no negociables.`
      : "Sin datos de no negociables.",
    candidatos: ctx.map((x) => ({
      id: x.c.id,
      nombre: x.c.nombre,
      cobertura: x.cobertura,
      fortalezas: (x.c.ficha.fortalezas ?? []).slice(0, 2).map((f) => punto(f, "ficha", f)),
      riesgos: [
        ...x.c.no_negociables.filter((n) => n.estado && n.estado !== "cumple").map((n) => punto(`No negociable ${n.estado === "parcial" ? "parcial" : "no cumplido"}: ${n.texto}`, "no_negociables", n.evidencia ?? n.texto)),
        ...(x.c.ficha.areas_oportunidad ?? []).slice(0, 1).map((f) => punto(f, "ficha", f)),
      ].slice(0, 3),
    })),
    fuentes: ["no_negociables", "ficha"],
    generado_por: "respaldo",
  };
}

/** Análisis de consejo para el AT. Nunca lanza. No toma ni registra decisiones. */
export async function analizarCandidatos(
  cands: FilaCandidato[],
  entrevistas: Record<string, EntrevistaResumen[]>,
  actor: Actor,
  opciones: { prueba?: boolean } = {},
): Promise<ResultadoAnalisis> {
  const t0 = Date.now();
  const { ctx, ocultados } = contexto(cands, entrevistas);
  let resultado: ResultadoAnalisis;
  let detalle: Record<string, unknown>;
  try {
    const x = await conLimite(LIMITE_MS, (ej) =>
      generarValidado({
        modelo: MODELO_EXTRACCION,
        sistema: SISTEMA,
        usuario: ctx.map((c) => `### Candidato ${c.ref}\n${c.datos}`).join("\n\n"),
        schema: Salida,
        nombreSchema: "analisis_candidatos",
        temperatura: TEMPERATURA,
        signal: ej.signal,
        validar: (crudo) => validar(crudo, ctx),
      }),
    );
    if ("timeout" in x) throw Object.assign(new Error("timeout"), { name: "TimeoutIA" });
    const v = x.valor;
    const refs = ctx.map((c) => ({ ref: c.ref, nombre: c.c.nombre }));
    const fuentes = new Set<Fuente>(["no_negociables"]);
    resultado = {
      resumen: conNombres(v.resumen, refs),
      no_negociables: conNombres(v.no_negociables, refs),
      candidatos: ctx.map((c) => {
        const d = v.candidatos.find((y) => y.ref.replace(/^candidato\s*/i, "").trim().toUpperCase() === c.ref);
        const limpia = (p: Punto) => (fuentes.add(p.fuente), { ...p, texto: conNombres(p.texto, refs) });
        return { id: c.c.id, nombre: c.c.nombre, cobertura: c.cobertura, fortalezas: (d?.fortalezas ?? []).map(limpia), riesgos: (d?.riesgos ?? []).map(limpia) };
      }),
      fuentes: [...fuentes],
      generado_por: "ia",
    };
    detalle = { ok: true, modelo: x.modelo, intentos: x.intentos, errores_intentos_previos: x.erroresPrevios };
  } catch (err) {
    resultado = respaldo(ctx);
    detalle = { ok: false, error: clasificarError(err), detalle: detalleSeguro(err) };
  }

  await registrarAuditSeguro({
    actor,
    accion: "ia_analisis_candidatos",
    entidad: "candidato_vacante",
    entidad_id: cands[0]?.id ?? null,
    prueba: opciones.prueba,
    detalle: {
      agente: "analisis_at",
      prompt: VERSION_PROMPT_ANALISIS,
      temperature: TEMPERATURA,
      candidatos: cands.map((c) => c.id),
      generado_por: resultado.generado_por,
      decision_registrada: false, // consejo: nunca registra decisiones
      evaluacion_ciega: { campos_ocultados: ocultados },
      duracion_ms: Date.now() - t0,
      ...detalle,
    },
  });
  return resultado;
}
