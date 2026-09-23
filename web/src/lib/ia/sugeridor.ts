import "server-only";
import { anonimizar, type TextoAnonimizado } from "./anonimizar";
import { coseno, embeber, MODELO_EMBEDDINGS } from "./embeddings";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import {
  CAMPOS_PERFIL_MOTIVO,
  SalidaMotivosLLM,
  Sugerencia,
  type CumpleNoNegociable,
  type Ficha,
} from "./schemas";
import { registrarAudit, type Actor } from "./servicio";
import { supabaseAdmin } from "./supabase-provisional";
import { temasProhibidos } from "./temas-prohibidos";

// Agente 6 de docs/04: sugeridor de vacantes para candidatos no seleccionados.
// 1) Embeddings del perfil (ficha anonimizada) y de cada vacante abierta.
// 2) Filtro duro: fuera las vacantes con algún no negociable sin NINGUNA evidencia.
// 3) Ranking por similitud coseno (en código; sin pgvector ni cambios en la BD).
// 4) El LLM solo redacta el motivo del top 3.
// Solo sugiere: no mueve al candidato ni envía nada.

export const VERSION_PROMPT_SUGERENCIAS = "sugerencias-v1";
const MAX_SUGERENCIAS = 3;

// Heurísticas calibradas con el seed (text-embedding-3-small). La similitud por
// no negociable mide el tema, no el cumplimiento; por eso solo descarta el caso
// "claramente no cumple" (ninguna evidencia afín) y el ranking usa el perfil completo.
const MIN_SIMILITUD_NN = 0.35; // debajo: el no negociable no tiene evidencia afín
// debajo: la vacante no se sugiere (≈ score 40). Con 0.50 salían sugerencias que el
// propio motivo desaconsejaba (p. ej. un arquitecto cloud → Diseñador UX/UI, score 29).
const MIN_SIMILITUD_PERFIL = 0.55;
const SIM_SCORE_0 = 0.45; // similitud que mapea a score 0
const SIM_SCORE_100 = 0.7; // similitud que mapea a score 100

export const ESTATUS_NO_SELECCIONADO = ["descartado", "pool"] as const;

const score = (sim: number) =>
  Math.round(Math.max(0, Math.min(1, (sim - SIM_SCORE_0) / (SIM_SCORE_100 - SIM_SCORE_0))) * 100);

interface Vacante {
  id: string;
  titulo: string;
  descripcion: string | null;
  no_negociables: { id: string; texto: string; tipo: string }[];
}

type LineaPerfil = { campo: (typeof CAMPOS_PERFIL_MOTIVO)[number]; texto: string };

// Perfil anonimizado en líneas etiquetadas por campo (para embeber y para citar).
function perfilAnonimizado(nombre: string, escolaridad: string | null, ficha: Partial<Ficha>, cumple: CumpleNoNegociable[]) {
  const ocultados: TextoAnonimizado["ocultados"] = {};
  const lineas: LineaPerfil[] = [];
  const add = (campo: LineaPerfil["campo"], s: string | null | undefined) => {
    if (!s?.trim()) return;
    const r = anonimizar(s, nombre);
    for (const [k, v] of Object.entries(r.ocultados)) {
      const c = k as keyof typeof ocultados;
      ocultados[c] = (ocultados[c] ?? 0) + (v ?? 0);
    }
    lineas.push({ campo, texto: r.texto });
  };
  add("escolaridad", escolaridad);
  ficha.otros_estudios?.forEach((x) => add("otros_estudios", x));
  ficha.idiomas?.forEach((i) => add("idiomas", `${i.idioma} ${i.nivel}`));
  add("descripcion", ficha.descripcion);
  ficha.fortalezas?.forEach((x) => add("fortalezas", x));
  add("estilo_liderazgo", ficha.estilo_liderazgo);
  add("vision_estrategica", ficha.vision_estrategica);
  add("analisis_toma_decisiones", ficha.analisis_toma_decisiones);
  cumple.forEach((c) => add("evidencia_no_negociables", c.evidencia));
  return { lineas, ocultados };
}

const textoVacante = (v: Vacante) =>
  [v.titulo, v.descripcion ?? "", ...v.no_negociables.map((n) => `No negociable: ${n.texto}`)].join("\n");

const SISTEMA = `Eres el Sugeridor de vacantes de LivHire (El Puerto de Liverpool).
Un candidato no fue seleccionado para su vacante. Ya se eligieron por similitud otras vacantes abiertas que encajan con su perfil.
Tu única tarea es redactar el MOTIVO de cada sugerencia.

Reglas:
- Un motivo por cada vacante recibida (usa su id exacto), en español, 1 o 2 oraciones, máximo 45 palabras, tono profesional y cálido.
- Explica qué del perfil encaja con la vacante. Si algún no negociable no está claramente demostrado, menciónalo como algo a validar.
- "campo_ficha": el campo del perfil en que te basaste; debe ser uno de: ${CAMPOS_PERFIL_MOTIVO.join(", ")}.
- Evaluación ciega: el perfil viene anonimizado. No menciones ni infieras nombre, edad, género, estado civil, familia, salud, origen ni domicilio.
- No prometas contratación ni decidas nada: solo sugieres.`;

function validarMotivos(crudo: SalidaMotivosLLM, top: { v: Vacante }[]) {
  const errores: string[] = [];
  const ids = new Set(top.map((t) => t.v.id));
  const vistos = new Set<string>();
  const campos = new Set<string>(CAMPOS_PERFIL_MOTIVO);
  for (const m of crudo.motivos) {
    if (!ids.has(m.vacante_id)) errores.push(`vacante_id desconocido: ${m.vacante_id}`);
    else if (vistos.has(m.vacante_id)) errores.push(`vacante_id repetido: ${m.vacante_id}`);
    vistos.add(m.vacante_id);
    if (!campos.has(m.campo_ficha)) errores.push(`campo_ficha "${m.campo_ficha}" no es válido`);
    const palabras = m.motivo.trim().split(/\s+/).filter(Boolean).length;
    const oraciones = m.motivo.split(/[.!?]+/).filter((x) => x.trim()).length;
    if (!m.motivo.trim()) errores.push(`Motivo vacío para ${m.vacante_id}`);
    if (palabras > 45 || oraciones > 2) {
      errores.push(`El motivo de ${m.vacante_id} debe tener 1-2 oraciones y máximo 45 palabras (tiene ${oraciones} y ${palabras})`);
    }
    const temas = temasProhibidos(m.motivo);
    if (temas.length) errores.push(`El motivo de ${m.vacante_id} toca un tema prohibido (${temas.join(", ")})`);
  }
  for (const id of ids) if (!vistos.has(id)) errores.push(`Falta el motivo de la vacante ${id}`);
  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: crudo.motivos };
}

// ---------------------------------------------------------------------------
// Persistencia (pendiente de Persona A).
// TODO(migración A): cuando exista unique (candidato_id, vacante_id_sugerida):
//   1) upsert de `sugerencias` con onConflict "candidato_id,vacante_id_sugerida",
//      SIN pisar filas en 'aceptada'/'descartada' (esas vacantes ya se excluyen
//      antes de sugerir; ver `decididas` en sugerirVacantes);
//   2) delete from sugerencias_vacante where candidato_id = X and estatus = 'sugerida'
//      and vacante_id_sugerida not in (las nuevas).
// sugerencias_vacante.motivo es solo texto: guardar `${motivo} (fuente: ficha · ${campo_ficha})`
// para no perder la cita del campo usado.
// Nunca tocar 'aceptada' ni 'descartada'. Hasta entonces NO escribe en sugerencias_vacante.
// ---------------------------------------------------------------------------
export async function guardarSugerencias(p: { candidatoId: string; sugerencias: Sugerencia[] }): Promise<{ persistido: boolean }> {
  void p; // se usará en el upsert de arriba
  return { persistido: false };
}

export async function sugerirVacantes(candidatoVacanteId: string, actor: Actor) {
  const sb = supabaseAdmin();
  const cv = await sb
    .from("candidato_vacante")
    .select("id, candidato_id, vacante_id, estatus, ficha, cumple_no_negociables, candidatos(nombre, escolaridad)")
    .eq("id", candidatoVacanteId)
    .maybeSingle();
  if (cv.error) throw new Error(cv.error.message);
  if (!cv.data) return { error: "no_encontrado" as const };
  if (!(ESTATUS_NO_SELECCIONADO as readonly string[]).includes(cv.data.estatus)) {
    return { error: "seleccionado" as const };
  }
  const ficha = (cv.data.ficha ?? {}) as Partial<Ficha>;
  if (!ficha.descripcion) return { error: "sin_ficha" as const };
  const candidato = cv.data.candidatos as unknown as { nombre: string; escolaridad: string | null };
  const candidatoId = cv.data.candidato_id as string;

  const [vacs, propias, decididas] = await Promise.all([
    sb.from("vacantes").select("id, titulo, descripcion, no_negociables(id, texto, tipo)").in("estatus", ["abierta", "en_proceso"]),
    // Vacantes en las que ya participa (incluida a la que aplicó).
    sb.from("candidato_vacante").select("vacante_id").eq("candidato_id", candidatoId),
    // Sugerencias que un humano ya aceptó o descartó: se respetan, no se vuelven a sugerir.
    sb.from("sugerencias_vacante").select("vacante_id_sugerida").eq("candidato_id", candidatoId).in("estatus", ["aceptada", "descartada"]),
  ]);
  for (const r of [vacs, propias, decididas]) if (r.error) throw new Error(r.error.message);

  const excluidas = new Set([
    ...(propias.data ?? []).map((r) => r.vacante_id as string),
    ...(decididas.data ?? []).map((r) => r.vacante_id_sugerida as string),
  ]);
  const todas = (vacs.data ?? []) as Vacante[];
  const filtros = { ya_participa_o_decidida: 0, sin_no_negociables: 0, no_negociable_sin_evidencia: 0, similitud_baja: 0 };
  const candidatas = todas.filter((v) => {
    if (excluidas.has(v.id)) return (filtros.ya_participa_o_decidida++, false);
    if (!v.no_negociables.length) return (filtros.sin_no_negociables++, false);
    return true;
  });

  const { lineas, ocultados } = perfilAnonimizado(
    candidato.nombre,
    candidato.escolaridad,
    ficha,
    (cv.data.cumple_no_negociables ?? []) as CumpleNoNegociable[],
  );

  // Una sola llamada de embeddings: perfil completo + cada línea + cada vacante + cada no negociable.
  const nnTextos = [...new Set(candidatas.flatMap((v) => v.no_negociables.map((n) => n.texto)))];
  const entradas = [lineas.map((l) => l.texto).join("\n"), ...lineas.map((l) => l.texto), ...candidatas.map(textoVacante), ...nnTextos];
  const e = await embeber(entradas);
  const ePerfil = e[0];
  const eLineas = e.slice(1, 1 + lineas.length);
  const eVacs = e.slice(1 + lineas.length, 1 + lineas.length + candidatas.length);
  const eNN = new Map(nnTextos.map((t, i) => [t, e[1 + lineas.length + candidatas.length + i]]));

  const ranking = candidatas
    .map((v, i) => {
      const sim = coseno(ePerfil, eVacs[i]);
      const nnSinEvidencia = v.no_negociables.filter(
        (n) => Math.max(...eLineas.map((l) => coseno(l, eNN.get(n.texto)!))) < MIN_SIMILITUD_NN,
      );
      return { v, sim, nnSinEvidencia };
    })
    .filter((r) => {
      if (r.nnSinEvidencia.length) return (filtros.no_negociable_sin_evidencia++, false);
      if (r.sim < MIN_SIMILITUD_PERFIL) return (filtros.similitud_baja++, false);
      return true;
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_SUGERENCIAS);

  let sugerencias: Sugerencia[] = [];
  let llm: { modelo: string; intentos: number; erroresPrevios: string[] } | null = null;
  if (ranking.length) {
    const perfil = lineas.map((l) => `- [${l.campo}] ${l.texto}`).join("\n");
    const vacantes = ranking
      .map((r) => `### id: ${r.v.id}\n${r.v.titulo}\n${r.v.descripcion ?? ""}\nNo negociables:\n${r.v.no_negociables.map((n) => `- ${n.texto}`).join("\n")}`)
      .join("\n\n");
    const r = await generarValidado({
      modelo: MODELO_EXTRACCION,
      sistema: SISTEMA,
      usuario: `PERFIL DEL CANDIDATO (anonimizado, por campo):\n${perfil}\n\nVACANTES SUGERIDAS:\n${vacantes}`,
      schema: SalidaMotivosLLM,
      nombreSchema: "motivos_sugerencias",
      validar: (crudo) => validarMotivos(crudo, ranking),
    });
    llm = { modelo: r.modelo, intentos: r.intentos, erroresPrevios: r.erroresPrevios };
    const motivos = new Map(r.valor.map((m) => [m.vacante_id, m]));
    sugerencias = Sugerencia.array().parse(
      ranking.map(({ v, sim }) => ({
        vacante_id_sugerida: v.id,
        vacante_titulo: v.titulo,
        score: score(sim),
        motivo: motivos.get(v.id)!.motivo.trim(),
        campo_ficha: motivos.get(v.id)!.campo_ficha,
        estatus: "sugerida",
      })),
    );
  }

  const { persistido } = await guardarSugerencias({ candidatoId, sugerencias });

  await registrarAudit({
    actor,
    accion: "ia_sugerir_vacantes",
    entidad: "candidato_vacante",
    entidad_id: candidatoVacanteId,
    detalle: {
      agente: "sugeridor_vacantes",
      prompt: VERSION_PROMPT_SUGERENCIAS,
      modelo: llm?.modelo ?? null,
      modelo_embeddings: MODELO_EMBEDDINGS,
      intentos: llm?.intentos ?? 0,
      errores_intentos_previos: llm?.erroresPrevios ?? [],
      temperature: 0,
      vacantes_abiertas: todas.length,
      vacantes_consideradas: candidatas.length,
      vacantes_filtradas: filtros,
      sugerencias: sugerencias.map((s) => ({ vacante_id: s.vacante_id_sugerida, score: s.score })),
      persistido,
      evaluacion_ciega: { campos_ocultados: ocultados },
    },
  });

  return { sugerencias, persistido, consideradas: candidatas.length, filtros };
}
