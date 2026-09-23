import "server-only";
import { anonimizar, type TextoAnonimizado } from "./anonimizar";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import {
  CAMPOS_FICHA_ORIGEN,
  Pregunta,
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

export const VERSION_PROMPT_PREGUNTAS = "preguntas-v2";
const MIN_PREGUNTAS = 6;
const MAX_PREGUNTAS = 10;

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
  1) Al menos una pregunta por CADA no negociable (origen.tipo = "no_negociable", origen.referencia = su id exacto), INCLUSO los que están en "cumple": ahí la pregunta confirma la evidencia con un ejemplo concreto.
  2) Los no negociables en "parcial" o "no_cumple" requieren una pregunta que valide específicamente la brecha, con bandera "no_negociable_parcial" o "no_negociable_no_cumple" respectivamente.
  3) Al menos una pregunta que explore las áreas de oportunidad (origen.tipo = "ficha", origen.referencia = "areas_oportunidad", bandera "area_oportunidad").
  4) Profundiza huecos del CV (datos sin evidencia) con bandera "hueco_cv".
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

function validar(crudo: SalidaPreguntasLLM, e: EntradaPreguntas) {
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

  // Cobertura: cada no negociable validado; las brechas con su bandera.
  for (const nn of e.noNegociables) {
    const suyas = ps.filter((p) => p.origen.tipo === "no_negociable" && p.origen.referencia === nn.id);
    if (!suyas.length) errores.push(`Falta una pregunta para el no negociable ${nn.id} (${nn.texto})`);
    const estado = e.cumple.find((c) => c.no_negociable_id === nn.id)?.estado;
    const bandera =
      estado === "parcial" ? "no_negociable_parcial" : estado === "no_cumple" ? "no_negociable_no_cumple" : null;
    if (bandera && !suyas.some((p) => p.bandera === bandera)) {
      errores.push(`El no negociable ${nn.id} está en "${estado}": falta una pregunta con bandera "${bandera}"`);
    }
  }
  if (e.ficha.areas_oportunidad?.length && !ps.some((p) => p.origen.referencia === "areas_oportunidad")) {
    errores.push('Falta al menos una pregunta con origen "areas_oportunidad"');
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
// Persistencia (pendiente de Persona A).
// TODO(migración A): cuando exista preguntas_entrevista.tipo + unique
// (vacante_id, candidato_id, tipo), esto pasa a ser:
//   supabaseAdmin().from("preguntas_entrevista").upsert(
//     { vacante_id, candidato_id, tipo, preguntas, generado_por: "ia", ts: new Date().toISOString() },
//     { onConflict: "vacante_id,candidato_id,tipo" })
// Hasta entonces NO escribe en preguntas_entrevista.
// ---------------------------------------------------------------------------
export async function guardarPreguntas(p: {
  vacanteId: string;
  candidatoId: string;
  tipo: TipoEntrevista;
  preguntas: Pregunta[];
}): Promise<{ persistido: boolean }> {
  void p; // se usará en el upsert de arriba
  return { persistido: false };
}

// Carga los datos de un candidato_vacante, genera, (no) guarda y audita.
export async function generarPreguntasParaCandidato(candidatoVacanteId: string, tipo: TipoEntrevista, actor: Actor) {
  const sb = supabaseAdmin();
  const cv = await sb
    .from("candidato_vacante")
    .select("id, candidato_id, vacante_id, ficha, cumple_no_negociables, candidatos(nombre), vacantes(titulo, descripcion)")
    .eq("id", candidatoVacanteId)
    .maybeSingle();
  if (cv.error) throw new Error(cv.error.message);
  if (!cv.data) return { error: "no_encontrado" as const };

  const ficha = (cv.data.ficha ?? {}) as Partial<Ficha>;
  if (!ficha.descripcion) return { error: "sin_ficha" as const };

  const nn = await sb.from("no_negociables").select("id, texto, tipo").eq("vacante_id", cv.data.vacante_id).order("id");
  if (nn.error) throw new Error(nn.error.message);

  const candidato = cv.data.candidatos as unknown as { nombre: string };
  const vacante = cv.data.vacantes as unknown as { titulo: string; descripcion: string | null };

  const salida = await generarPreguntas({
    nombreCandidato: candidato.nombre,
    tipo,
    vacante,
    noNegociables: nn.data ?? [],
    ficha,
    cumple: (cv.data.cumple_no_negociables ?? []) as CumpleNoNegociable[],
  });

  const { persistido } = await guardarPreguntas({
    vacanteId: cv.data.vacante_id,
    candidatoId: cv.data.candidato_id,
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
      persistido,
      evaluacion_ciega: { campos_ocultados: salida.ocultados },
    },
  });

  return { salida, persistido };
}
