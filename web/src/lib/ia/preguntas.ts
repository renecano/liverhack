import "server-only";
import { anonimizar, type TextoAnonimizado } from "./anonimizar";
import { coseno, embeber } from "./embeddings";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import {
  CAMPOS_FICHA_ORIGEN,
  Pregunta,
  PreguntaGuardada,
  SalidaPreguntasLLM,
  type CumpleNoNegociable,
  type Ficha,
  type TipoEntrevista,
} from "./schemas";
import { registrarAudit, type Actor } from "./servicio";
import { temasProhibidos } from "./temas-prohibidos";
import { supabaseAdmin } from "./supabase-provisional";

// Agente 3 de docs/04: generador de preguntas de entrevista.
// Entrada: ficha + semáforo de no negociables + vacante + tipo de entrevista.
// Salida: 6-10 preguntas personalizadas, cada una con su origen trazable.

export const VERSION_PROMPT_PREGUNTAS = "preguntas-v3";
const MIN_PREGUNTAS = 6;
const MAX_PREGUNTAS = 10;
// Profundidad medida en palabras de la pregunta.
const MAX_PALABRAS_CONFIRMACION = 20;
const MIN_PALABRAS_PROFUNDA = 15;
// Casi-duplicados (calibrado con los sets reales de Carlos: el par duplicado
// "liderazgo sin rol formal" dio 0.75; el par distinto más alto, 0.70).
const SIMILITUD_MISMA_FAMILIA = 0.72; // misma familia de competencia (liderazgo_*)
const SIMILITUD_CUALQUIERA = 0.85; // cualquier par

export interface EntradaPreguntas {
  nombreCandidato: string; // solo para anonimizar; nunca llega al LLM
  tipo: TipoEntrevista;
  vacante: { titulo: string; descripcion: string | null };
  noNegociables: { id: string; texto: string; tipo: string }[];
  ficha: Partial<Ficha>;
  cumple: CumpleNoNegociable[];
}

export interface SalidaPreguntas {
  preguntas: Pregunta[];
  modelo: string;
  intentos: number;
  erroresPrevios: string[];
  ocultados: TextoAnonimizado["ocultados"];
}

const SISTEMA = `Eres el Generador de preguntas de entrevista de LivHire (El Puerto de Liverpool).
Con la ficha de UN candidato y la vacante, propones preguntas para la entrevista.

Reglas:
- Evaluación ciega: la ficha viene anonimizada. No preguntes ni infieras nombre, edad, género, estado civil, familia, hijos, embarazo, religión, salud, discapacidad, nacionalidad, origen, domicilio ni afiliación política o sindical. Ninguna pregunta puede tocar esos temas, ni siquiera de forma indirecta.
- Entre ${MIN_PREGUNTAS} y ${MAX_PREGUNTAS} preguntas, en español, neutrales y profesionales, abiertas y conductuales (pide ejemplos concretos: situación, acción, resultado).
- Cobertura obligatoria:
  1) CADA no negociable lleva preguntas con origen.tipo = "no_negociable" y origen.referencia = su id exacto.
  2) Si el no negociable está en "cumple": EXACTAMENTE UNA pregunta de confirmación breve y cerrada (sí/no o un dato puntual; máximo ${MAX_PALABRAS_CONFIRMACION} palabras; NO pidas ejemplos ni experiencias), bandera "confirmacion_no_negociable". Ej.: "¿Nos confirma que concluyó la Ingeniería en Sistemas y en qué año se tituló?"
     Si está en "parcial" o "no_cumple": al menos una pregunta PROFUNDA y conductual (${MIN_PALABRAS_PROFUNDA}+ palabras) que valide la brecha, con bandera "no_negociable_parcial" o "no_negociable_no_cumple".
  3) Al menos una pregunta PROFUNDA (${MIN_PALABRAS_PROFUNDA}+ palabras) que explore las áreas de oportunidad (origen.tipo = "ficha", origen.referencia = "areas_oportunidad", bandera "area_oportunidad").
  4) Profundiza huecos del CV (datos sin evidencia) con bandera "hueco_cv".
  5) Sin preguntas repetidas: no hagas dos preguntas sobre el mismo tema con distinto enunciado (ej. dos sobre "influir sin rol formal de liderazgo"). Cada pregunta debe aportar información nueva.
- origen.referencia para tipo "ficha" debe ser uno de: ${CAMPOS_FICHA_ORIGEN.join(", ")}.
- bandera es null cuando la pregunta no valida una brecha.
- "objetivo": qué debe observar el entrevistador (1 frase). "competencia": en snake_case (ej. liderazgo, comunicacion, gestion_proyectos).
- Tipo de entrevista "competencias": 1 a 1, conductual y a profundidad. "panel": varios entrevistadores; incluye casos o situaciones que varios puedan evaluar.
- Tú no decides nada: solo propones preguntas.`;

const ETIQUETA_ESTADO = { cumple: "CUMPLE", parcial: "PARCIAL", no_cumple: "NO CUMPLE" } as const;

function fichaAnonimizada(e: EntradaPreguntas) {
  // Solo campos de la ficha y evidencia del semáforo; las citas (fragmentos
  // literales del CV) no se envían. Todo pasa por anonimizar().
  const ocultados: TextoAnonimizado["ocultados"] = {};
  const a = (s: string | undefined) => {
    if (!s) return "(sin dato)";
    const r = anonimizar(s, e.nombreCandidato);
    for (const [k, v] of Object.entries(r.ocultados)) {
      const c = k as keyof typeof ocultados;
      ocultados[c] = (ocultados[c] ?? 0) + (v ?? 0);
    }
    return r.texto;
  };
  const lista = (xs?: string[]) => (xs?.length ? xs.map((x) => `  - ${a(x)}`).join("\n") : "  (sin dato)");
  const f = e.ficha;
  const estado = new Map(e.cumple.map((c) => [c.no_negociable_id, c]));

  const texto = `VACANTE: ${e.vacante.titulo}
DESCRIPCIÓN: ${e.vacante.descripcion ?? "(sin descripción)"}
TIPO DE ENTREVISTA: ${e.tipo}

NO NEGOCIABLES Y SEMÁFORO DEL CANDIDATO:
${e.noNegociables
  .map((n) => {
    const s = estado.get(n.id);
    return `- id: ${n.id} | ${n.texto} | ${s ? ETIQUETA_ESTADO[s.estado] : "SIN EVALUAR"} | evidencia: ${a(s?.evidencia)}`;
  })
  .join("\n")}

FICHA DEL CANDIDATO (anonimizada):
descripcion: ${a(f.descripcion)}
fortalezas:
${lista(f.fortalezas)}
areas_oportunidad:
${lista(f.areas_oportunidad)}
estilo_liderazgo: ${a(f.estilo_liderazgo)}
vision_estrategica: ${a(f.vision_estrategica)}
analisis_toma_decisiones: ${a(f.analisis_toma_decisiones)}
idiomas: ${f.idiomas?.length ? f.idiomas.map((i) => `${i.idioma} ${i.nivel}`).join(", ") : "(sin dato)"}
otros_estudios:
${lista(f.otros_estudios)}
recomendaciones: ${a(f.recomendaciones)}

CHECKLIST OBLIGATORIO: debe haber al menos una pregunta con origen.tipo "no_negociable" para cada uno de estos ids:
${e.noNegociables.map((n) => `- ${n.id}`).join("\n")}`;
  return { texto, ocultados };
}

const palabras = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const familia = (competencia: string) => competencia.trim().toLowerCase().split(/[_\s]+/)[0];

// Pares casi duplicados: misma familia de competencia + enunciado muy parecido,
// o cualquier par casi idéntico. Índices base 1.
async function casiDuplicados(ps: { pregunta: string; competencia: string }[]) {
  const { vectores: e } = await embeber(ps.map((p) => p.pregunta));
  const pares: { i: number; j: number; sim: number }[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const sim = coseno(e[i], e[j]);
      const mismaFamilia = familia(ps[i].competencia) === familia(ps[j].competencia);
      if (sim >= SIMILITUD_CUALQUIERA || (mismaFamilia && sim >= SIMILITUD_MISMA_FAMILIA)) {
        pares.push({ i: i + 1, j: j + 1, sim });
      }
    }
  }
  return pares;
}

async function validar(crudo: SalidaPreguntasLLM, e: EntradaPreguntas) {
  const errores: string[] = [];
  const ps = crudo.preguntas;
  const idsNN = new Set(e.noNegociables.map((n) => n.id));
  const campos = new Set<string>(CAMPOS_FICHA_ORIGEN);

  if (ps.length < MIN_PREGUNTAS || ps.length > MAX_PREGUNTAS) {
    errores.push(`Se pidieron entre ${MIN_PREGUNTAS} y ${MAX_PREGUNTAS} preguntas y llegaron ${ps.length}`);
  }

  ps.forEach((p, i) => {
    const n = i + 1;
    if (!p.pregunta.trim() || !p.objetivo.trim() || !p.competencia.trim()) {
      errores.push(`Pregunta ${n}: pregunta, objetivo y competencia son obligatorios`);
    }
    // Se reporta solo el tema, no el texto, para no copiar contenido prohibido al audit.
    const temas = temasProhibidos(`${p.pregunta} ${p.objetivo}`);
    if (temas.length) errores.push(`Pregunta ${n}: toca un tema prohibido (${temas.join(", ")}); reemplázala`);
    if (p.origen.tipo === "no_negociable" && !idsNN.has(p.origen.referencia)) {
      errores.push(`Pregunta ${n}: origen.referencia "${p.origen.referencia}" no es un id de no negociable`);
    }
    if (p.origen.tipo === "ficha" && !campos.has(p.origen.referencia)) {
      errores.push(`Pregunta ${n}: origen.referencia "${p.origen.referencia}" no es un campo válido de la ficha`);
    }
  });

  // Cobertura y profundidad por no negociable.
  for (const nn of e.noNegociables) {
    const suyas = ps.filter((p) => p.origen.tipo === "no_negociable" && p.origen.referencia === nn.id);
    if (!suyas.length) errores.push(`Falta una pregunta para el no negociable ${nn.id} (${nn.texto})`);
    const estado = e.cumple.find((c) => c.no_negociable_id === nn.id)?.estado;
    if (estado === "cumple") {
      if (suyas.length > 1) {
        errores.push(`El no negociable ${nn.id} ya "cumple": usa UNA sola pregunta de confirmación, no ${suyas.length}`);
      }
      for (const p of suyas) {
        if (p.bandera !== "confirmacion_no_negociable") {
          errores.push(`La pregunta del no negociable ${nn.id} (en "cumple") debe llevar bandera "confirmacion_no_negociable"`);
        }
        if (palabras(p.pregunta) > MAX_PALABRAS_CONFIRMACION) {
          errores.push(
            `La confirmación del no negociable ${nn.id} tiene ${palabras(p.pregunta)} palabras; máximo ${MAX_PALABRAS_CONFIRMACION}`,
          );
        }
      }
    } else if (estado === "parcial" || estado === "no_cumple") {
      const bandera = estado === "parcial" ? "no_negociable_parcial" : "no_negociable_no_cumple";
      if (!suyas.some((p) => p.bandera === bandera && palabras(p.pregunta) >= MIN_PALABRAS_PROFUNDA)) {
        errores.push(
          `El no negociable ${nn.id} está en "${estado}": falta una pregunta profunda (${MIN_PALABRAS_PROFUNDA}+ palabras) con bandera "${bandera}"`,
        );
      }
    }
  }
  if (e.ficha.areas_oportunidad?.length) {
    const areas = ps.filter((p) => p.origen.referencia === "areas_oportunidad");
    if (!areas.some((p) => palabras(p.pregunta) >= MIN_PALABRAS_PROFUNDA)) {
      errores.push(`Falta al menos una pregunta profunda (${MIN_PALABRAS_PROFUNDA}+ palabras) con origen "areas_oportunidad"`);
    }
  }

  // Casi-duplicados: solo si lo demás ya es válido (no gastar embeddings en un set que se rehará).
  if (!errores.length) {
    for (const d of await casiDuplicados(ps)) {
      errores.push(
        `Las preguntas ${d.i} y ${d.j} son casi duplicadas (similitud ${d.sim.toFixed(2)}): reemplaza una por otra que explore un tema distinto`,
      );
    }
  }

  if (errores.length) return { ok: false as const, errores };

  const preguntas: Pregunta[] = ps.map((p) => ({
    pregunta: p.pregunta.trim(),
    objetivo: p.objetivo.trim(),
    competencia: p.competencia.trim().toLowerCase().replace(/\s+/g, "_"),
    ...(p.bandera ? { bandera: p.bandera } : {}),
    origen: p.origen,
  }));
  const final = Pregunta.array().safeParse(preguntas);
  if (!final.success) {
    return { ok: false as const, errores: final.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true as const, valor: final.data };
}

export async function generarPreguntas(e: EntradaPreguntas): Promise<SalidaPreguntas> {
  if (e.noNegociables.length === 0) throw new Error("La vacante no tiene no negociables");
  const { texto, ocultados } = fichaAnonimizada(e);
  const r = await generarValidado({
    modelo: MODELO_EXTRACCION,
    sistema: SISTEMA,
    usuario: texto,
    schema: SalidaPreguntasLLM,
    nombreSchema: "preguntas_entrevista",
    validar: (crudo) => validar(crudo, e),
  });
  return { preguntas: r.valor, modelo: r.modelo, intentos: r.intentos, erroresPrevios: r.erroresPrevios, ocultados };
}

// ---------------------------------------------------------------------------
// Persistencia: un set por (vacante_id, candidato_id, tipo) — unique de Persona A
// (migración 20260923221237). Regenerar reemplaza el set, no lo duplica.
// La columna preguntas_entrevista.origen (por fila) se deja en null: el origen
// real vive en cada pregunta dentro del jsonb.
// ---------------------------------------------------------------------------
export async function guardarPreguntas(p: {
  vacanteId: string;
  candidatoId: string;
  tipo: TipoEntrevista;
  preguntas: Pregunta[];
}): Promise<{ persistido: boolean; ts: string }> {
  const ts = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("preguntas_entrevista")
    .upsert(
      { vacante_id: p.vacanteId, candidato_id: p.candidatoId, tipo: p.tipo, preguntas: p.preguntas, generado_por: "ia", ts },
      { onConflict: "vacante_id,candidato_id,tipo" },
    );
  if (error) throw new Error(`preguntas_entrevista: ${error.message}`);
  return { persistido: true, ts };
}

export interface SetPreguntasGuardado {
  tipo: TipoEntrevista;
  preguntas: PreguntaGuardada[];
  generado_por: "ia" | "manual";
  ts: string;
}

// Lectura sin regenerar (panel de la lista y, después, la vista del entrevistador).
export async function obtenerPreguntasGuardadas(
  vacanteId: string,
  candidatoId: string,
  tipo: TipoEntrevista,
): Promise<SetPreguntasGuardado | null> {
  const { data, error } = await supabaseAdmin()
    .from("preguntas_entrevista")
    .select("tipo, preguntas, generado_por, ts")
    .eq("vacante_id", vacanteId)
    .eq("candidato_id", candidatoId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // Tolerante: los sets del seed o manuales no traen `origen` por pregunta.
  const preguntas = PreguntaGuardada.array().safeParse(data.preguntas);
  return {
    tipo: data.tipo,
    preguntas: preguntas.success ? preguntas.data : [],
    generado_por: data.generado_por,
    ts: data.ts,
  };
}

async function candidatoVacante(candidatoVacanteId: string) {
  const { data, error } = await supabaseAdmin()
    .from("candidato_vacante")
    .select("id, candidato_id, vacante_id, ficha, cumple_no_negociables, candidatos(nombre), vacantes(titulo, descripcion)")
    .eq("id", candidatoVacanteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function preguntasGuardadasDe(candidatoVacanteId: string, tipo: TipoEntrevista) {
  const cv = await candidatoVacante(candidatoVacanteId);
  if (!cv) return { error: "no_encontrado" as const };
  return { set: await obtenerPreguntasGuardadas(cv.vacante_id, cv.candidato_id, tipo) };
}

// Carga los datos de un candidato_vacante, genera, guarda y audita.
export async function generarPreguntasParaCandidato(candidatoVacanteId: string, tipo: TipoEntrevista, actor: Actor) {
  const sb = supabaseAdmin();
  const cv = await candidatoVacante(candidatoVacanteId);
  if (!cv) return { error: "no_encontrado" as const };

  const ficha = (cv.ficha ?? {}) as Partial<Ficha>;
  if (!ficha.descripcion) return { error: "sin_ficha" as const };

  // Un set escrito a mano es trabajo humano: la IA no lo sobrescribe.
  // Se revisa antes de llamar al modelo para no gastar en una generación que no se guardaría.
  const previo = await obtenerPreguntasGuardadas(cv.vacante_id, cv.candidato_id, tipo);
  if (previo?.generado_por === "manual") return { error: "manual" as const };

  const nn = await sb.from("no_negociables").select("id, texto, tipo").eq("vacante_id", cv.vacante_id).order("id");
  if (nn.error) throw new Error(nn.error.message);

  const candidato = cv.candidatos as unknown as { nombre: string };
  const vacante = cv.vacantes as unknown as { titulo: string; descripcion: string | null };

  const salida = await generarPreguntas({
    nombreCandidato: candidato.nombre,
    tipo,
    vacante,
    noNegociables: nn.data ?? [],
    ficha,
    cumple: (cv.cumple_no_negociables ?? []) as CumpleNoNegociable[],
  });

  const { persistido, ts } = await guardarPreguntas({
    vacanteId: cv.vacante_id,
    candidatoId: cv.candidato_id,
    tipo,
    preguntas: salida.preguntas,
  });

  await registrarAudit({
    actor,
    accion: "ia_generar_preguntas",
    entidad: "candidato_vacante",
    entidad_id: candidatoVacanteId,
    detalle: {
      agente: "generador_preguntas",
      prompt: VERSION_PROMPT_PREGUNTAS,
      modelo: salida.modelo,
      intentos: salida.intentos,
      errores_intentos_previos: salida.erroresPrevios,
      temperature: 0,
      tipo_entrevista: tipo,
      num_preguntas: salida.preguntas.length,
      banderas: salida.preguntas.map((p) => p.bandera ?? null).filter(Boolean),
      reemplazo_set_previo: previo !== null,
      persistido,
      evaluacion_ciega: { campos_ocultados: salida.ocultados },
    },
  });

  return { salida, persistido, ts };
}
