import "server-only";
import { zodResponseFormat } from "openai/helpers/zod";
import { anonimizar, type TextoAnonimizado } from "./anonimizar";
import { MODELO_EXTRACCION, openai } from "./openai";
import {
  ResultadoExtraccion,
  SalidaLLM,
  type CumpleNoNegociable,
  type EstadoNoNegociable,
} from "./schemas";

// Agente 2 de docs/04: Extractor + Comparador.
// Entrada: CV (texto) + evaluaciones + no negociables de la vacante.
// Salida: ficha, fit_score, compatibilidad_nnn y semáforo de no negociables,
// todo con cita de origen. Función pura: no toca la BD (ver servicio.ts).

export const VERSION_PROMPT = "extractor-v3";
const MAX_INTENTOS = 3;

export interface EntradaExtractor {
  nombreCandidato: string; // solo para anonimizar; nunca llega al LLM
  cvTexto: string;
  evaluaciones: { tipo: string; resumen: string | null }[];
  vacante: { titulo: string; descripcion: string | null };
  noNegociables: { id: string; texto: string; tipo: string }[];
}

export interface SalidaExtractor {
  resultado: ResultadoExtraccion;
  modelo: string;
  intentos: number;
  fitFuente: "assessfirst" | "llm";
  erroresPrevios: string[]; // por qué se rechazaron los intentos anteriores
  ocultados: TextoAnonimizado["ocultados"];
}

export class ExtraccionInvalidaError extends Error {
  constructor(
    public errores: string[],
    public intentos: number,
  ) {
    super(`La salida del LLM no validó tras ${intentos} intentos: ${errores.join("; ")}`);
  }
}

const SISTEMA = `Eres el Extractor de LivHire, la plataforma de atracción de talento de El Puerto de Liverpool.
Lees el CV y las evaluaciones de UN candidato y llenas su ficha comparativa para el Hiring Manager.

Reglas:
- Evaluación ciega: el texto viene anonimizado ([CANDIDATO], [EDAD OCULTA], etc.). No intentes inferir nombre, género, edad, origen ni domicilio, y no los uses para calificar.
- Nada sin fuente: cada afirmación debe salir del texto. En "fragmento" copia LITERALMENTE un pasaje corto (5 a 25 palabras) del documento indicado en "fuente" ("CV", "Evaluacion" o "Vacante"). No parafrasees el fragmento.
- "Vacante" solo se usa para citar el requisito de la vacante cuando señalas una brecha (área de oportunidad o requisito sin evidencia).
- Los campos de la ficha (descripcion, fortalezas, areas_oportunidad, estilo_liderazgo, vision_estrategica, analisis_toma_decisiones, recomendaciones) son una SÍNTESIS analítica en tus palabras (1-2 frases o viñetas breves), no copias del CV. El soporte literal va en "citas".
- areas_oportunidad: brechas frente a la vacante y sus no negociables, o aspectos sin evidencia que el HM debería validar en entrevista (ej. "Sin evidencia de manejo de presupuesto: validar en entrevista"). Nunca la dejes vacía. Su cita es el requisito de la vacante (fuente "Vacante") o el pasaje del CV que muestra la brecha.
- Si un dato no aparece, dilo ("Sin evidencia en CV") en lugar de inventarlo. Listas vacías están permitidas para idiomas y otros_estudios.
- escolaridad: solo educación formal (licenciatura, ingeniería, posgrado). otros_estudios: diplomados, cursos, certificaciones.
- Semáforo por cada no negociable (usa su id exacto, uno por cada id, sin omitir ninguno):
  "cumple" = evidencia clara y suficiente; "parcial" = evidencia incompleta o de menor nivel; "no_cumple" = contradice el requisito o no hay ninguna evidencia.
  Si es "no_cumple" por falta de evidencia, deja "fragmento" vacío.
- fit_score (0-100): ajuste global al perfil de la vacante por experiencia, estudios y competencias. NO consideres distancia, domicilio ni permanencia.
- citas: al menos una por campo de la ficha que afirmes (descripcion, fortalezas, areas_oportunidad, estilo_liderazgo, vision_estrategica, analisis_toma_decisiones, idiomas, otros_estudios, escolaridad).
- Escribe en español, tono profesional y neutral. No decides nada: el HM decide.`;

function construirPrompt(
  cv: string,
  evals: { tipo: string; resumen: string }[],
  e: EntradaExtractor,
): string {
  const nn = e.noNegociables.map((n) => `- id: ${n.id} | tipo: ${n.tipo} | requisito: ${n.texto}`).join("\n");
  const ev = evals.length
    ? evals.map((x) => `[${x.tipo}] ${x.resumen}`).join("\n")
    : "(sin evaluaciones)";
  return `=== VACANTE (fuente "Vacante") ===
VACANTE: ${e.vacante.titulo}
DESCRIPCIÓN: ${e.vacante.descripcion ?? "(sin descripción)"}

NO NEGOCIABLES:
${nn}

=== CV (fuente "CV") ===
${cv}

=== EVALUACIONES (fuente "Evaluacion") ===
${ev}`;
}

// Normaliza para comparar fragmentos con el texto fuente (acentos, mayúsculas,
// espacios y puntuación no deben invalidar una cita literal).
const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
const normalizar = (s: string) =>
  s.normalize("NFD").replace(MARCAS, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Potencial Global de AssessFirst, si viene en la evaluación: es el % de
// compatibilidad que usa el seed como fit_score (docs/07).
export function potencialGlobal(evals: { tipo: string; resumen: string | null }[]): number | null {
  for (const e of evals) {
    if (e.tipo !== "assessfirst" || !e.resumen) continue;
    const m = e.resumen.match(/potencial\s+global\D{0,15}(\d{1,3})\s*%/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

// compatibilidad_nnn = % de no negociables en "cumple" (misma regla del seed:
// 3/3 → 100, 2/3 → 67, 1/3 → 33).
export function compatibilidadNNN(estados: EstadoNoNegociable[]): number {
  if (estados.length === 0) return 0;
  return Math.round((estados.filter((e) => e === "cumple").length / estados.length) * 100);
}

function validar(
  crudo: SalidaLLM,
  e: EntradaExtractor,
  fuentes: Record<"CV" | "Evaluacion" | "Vacante", string>,
): { ok: true; resultado: ResultadoExtraccion; fitFuente: "assessfirst" | "llm" } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const norm = {
    CV: normalizar(fuentes.CV),
    Evaluacion: normalizar(fuentes.Evaluacion),
    Vacante: normalizar(fuentes.Vacante),
  };
  const citaExiste = (fuente: keyof typeof norm, fragmento: string) => {
    const f = normalizar(fragmento);
    return f.length > 0 && norm[fuente].includes(f);
  };

  // Semáforo: exactamente un registro por cada no negociable de la vacante.
  const esperados = new Set(e.noNegociables.map((n) => n.id));
  const vistos = new Set<string>();
  const semaforo: CumpleNoNegociable[] = [];
  for (const r of crudo.cumple_no_negociables) {
    if (!esperados.has(r.no_negociable_id)) {
      errores.push(`no_negociable_id desconocido: ${r.no_negociable_id}`);
      continue;
    }
    if (vistos.has(r.no_negociable_id)) {
      errores.push(`no_negociable_id repetido: ${r.no_negociable_id}`);
      continue;
    }
    vistos.add(r.no_negociable_id);
    const sinEvidencia = r.estado === "no_cumple" && r.fragmento.trim() === "";
    if (!sinEvidencia && !citaExiste(r.fuente, r.fragmento)) {
      errores.push(`La cita del no negociable ${r.no_negociable_id} no aparece literal en ${r.fuente}: "${r.fragmento}"`);
    }
    semaforo.push({
      no_negociable_id: r.no_negociable_id,
      estado: r.estado,
      evidencia: r.evidencia.trim() || "Sin evidencia",
      cita: sinEvidencia ? `${r.fuente}: sin evidencia` : `${r.fuente}: «${r.fragmento.trim()}»`,
    });
  }
  for (const id of esperados) if (!vistos.has(id)) errores.push(`Falta el no negociable ${id}`);
  // Mismo orden que la vacante, para que el semáforo se lea igual en todas las filas.
  const orden = e.noNegociables.map((n) => n.id);
  semaforo.sort((a, b) => orden.indexOf(a.no_negociable_id) - orden.indexOf(b.no_negociable_id));

  const citasInvalidas = crudo.citas.filter((c) => !citaExiste(c.fuente, c.fragmento));
  for (const c of citasInvalidas) {
    errores.push(`La cita de "${c.campo}" no aparece literal en ${c.fuente}: "${c.fragmento}"`);
  }
  if (crudo.citas.length === 0) errores.push("La ficha no trae citas");

  const fitLLM = Math.round(crudo.fit_score);
  if (!(fitLLM >= 0 && fitLLM <= 100)) errores.push(`fit_score fuera de rango: ${crudo.fit_score}`);

  if (errores.length) return { ok: false, errores };

  const pg = potencialGlobal(e.evaluaciones);
  const citas = crudo.citas.map((c) => `${c.campo} · ${c.fuente}: «${c.fragmento.trim()}»`);
  if (pg !== null) citas.push(`fit_score · Evaluacion: AssessFirst Potencial Global ${pg}%`);
  else citas.push(`fit_score · IA: ${crudo.fit_justificacion.trim()}`);

  const limpiar = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const parsed = ResultadoExtraccion.safeParse({
    ficha: {
      descripcion: crudo.descripcion.trim(),
      fortalezas: limpiar(crudo.fortalezas),
      areas_oportunidad: limpiar(crudo.areas_oportunidad),
      estilo_liderazgo: crudo.estilo_liderazgo.trim(),
      vision_estrategica: crudo.vision_estrategica.trim(),
      analisis_toma_decisiones: crudo.analisis_toma_decisiones.trim(),
      idiomas: crudo.idiomas.filter((i) => i.idioma.trim() && i.nivel.trim()),
      otros_estudios: limpiar(crudo.otros_estudios),
      recomendaciones: crudo.recomendaciones.trim(),
      citas,
    },
    fit_score: pg ?? fitLLM,
    compatibilidad_nnn: compatibilidadNNN(semaforo.map((s) => s.estado)),
    cumple_no_negociables: semaforo,
    escolaridad: crudo.escolaridad?.trim() || null,
  });
  if (!parsed.success) {
    return { ok: false, errores: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, resultado: parsed.data, fitFuente: pg !== null ? "assessfirst" : "llm" };
}

export async function extraerFicha(e: EntradaExtractor): Promise<SalidaExtractor> {
  if (!e.cvTexto.trim()) throw new Error("El CV está vacío");
  if (e.noNegociables.length === 0) throw new Error("La vacante no tiene no negociables");

  // Evaluación ciega: todo lo que ve el LLM pasa por anonimizar().
  const cv = anonimizar(e.cvTexto, e.nombreCandidato);
  const evals = e.evaluaciones
    .filter((x) => x.resumen?.trim())
    .map((x) => ({ tipo: x.tipo, a: anonimizar(x.resumen!, e.nombreCandidato) }));
  const ocultados: TextoAnonimizado["ocultados"] = { ...cv.ocultados };
  for (const x of evals) {
    for (const [k, v] of Object.entries(x.a.ocultados)) {
      const c = k as keyof typeof ocultados;
      ocultados[c] = (ocultados[c] ?? 0) + (v ?? 0);
    }
  }
  const evalsAnon = evals.map((x) => ({ tipo: x.tipo, resumen: x.a.texto }));
  const fuentes = {
    CV: cv.texto,
    Evaluacion: evalsAnon.map((x) => x.resumen).join("\n"),
    Vacante: [e.vacante.titulo, e.vacante.descripcion ?? "", ...e.noNegociables.map((n) => n.texto)].join("\n"),
  };

  const mensajes: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SISTEMA },
    { role: "user", content: construirPrompt(cv.texto, evalsAnon, e) },
  ];

  let errores: string[] = [];
  const erroresPrevios: string[] = [];
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    const r = await openai().chat.completions.create({
      model: MODELO_EXTRACCION,
      temperature: 0,
      seed: 7,
      messages: mensajes,
      response_format: zodResponseFormat(SalidaLLM, "ficha_candidato"),
    });
    const msg = r.choices[0]?.message;
    const contenido = msg?.content ?? "";

    let json: unknown;
    try {
      json = JSON.parse(contenido);
    } catch {
      errores = [msg?.refusal ? `El modelo se negó: ${msg.refusal}` : "La respuesta no es JSON"];
      erroresPrevios.push(`intento ${intento}: ${errores[0]}`);
      mensajes.push({ role: "assistant", content: contenido || "(vacío)" });
      mensajes.push({ role: "user", content: `Tu respuesta no es válida: ${errores.join("; ")}. Corrígela.` });
      continue;
    }

    const crudo = SalidaLLM.safeParse(json);
    const v = crudo.success
      ? validar(crudo.data, e, fuentes)
      : { ok: false as const, errores: crudo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };

    if (v.ok) {
      return {
        resultado: v.resultado,
        modelo: r.model,
        intentos: intento,
        fitFuente: v.fitFuente,
        erroresPrevios,
        ocultados,
      };
    }

    // Reintento con retroalimentación concreta; nunca se guarda una salida inválida.
    errores = v.errores;
    erroresPrevios.push(...errores.map((x) => `intento ${intento}: ${x}`));
    mensajes.push({ role: "assistant", content: contenido });
    mensajes.push({
      role: "user",
      content: `Tu respuesta no pasó la validación:\n- ${errores.join("\n- ")}\nDevuelve la ficha completa corregida. Recuerda: los fragmentos deben copiarse literalmente del texto.`,
    });
  }
  throw new ExtraccionInvalidaError(errores, MAX_INTENTOS);
}
