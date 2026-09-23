import "server-only";
import { anonimizar, type TextoAnonimizado } from "./anonimizar";
import { coseno, embeber, MODELO_EMBEDDINGS } from "./embeddings";
import { generarValidado, type UsoTokens } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import {
  CAMPOS_PERFIL_MOTIVO,
  SalidaMotivosLLM,
  SalidaVerificacionLLM,
  Sugerencia,
  type CumpleNoNegociable,
  type Ficha,
} from "./schemas";
import { clasificarNoNegociable } from "./obtenible";
import { crearVerificadorCitas, normalizar, REGLAS_SEMAFORO, validarSemaforo } from "./semaforo";
import { registrarAudit, type Actor, type OpcionesAudit } from "./servicio";
import { supabaseAdmin } from "./supabase-provisional";
import { temasProhibidos } from "./temas-prohibidos";

// Agente 6 de docs/04: sugeridor de vacantes para candidatos no seleccionados.
// 1) Embeddings del perfil (ficha anonimizada) y de cada vacante abierta → ranking
//    por similitud coseno (en código; sin pgvector ni cambios en la BD).
// 2) Filtro estricto: para el top 5, el LLM evalúa cada no negociable con el mismo
//    semáforo del extractor (cumple / parcial / no_cumple + cita literal del perfil).
//    Exclusión: 1 no_cumple sustantivo o 2+ no_cumple. Un único no_cumple
//    obtenible (regla en código, lib/ia/obtenible.ts) se queda con penalización.
// 3) El LLM redacta el motivo del top 3 (los parciales aparecen como "validar …").
// Solo sugiere: no mueve al candidato ni envía nada.

export const VERSION_PROMPT_SUGERENCIAS = "sugerencias-v3";
const MAX_SUGERENCIAS = 3;
const MAX_VERIFICAR = 5;
// Un no_cumple obtenible (certificación, curso, diplomado) no excluye la vacante: resta puntos.
const PENALIZACION_OBTENIBLE = 15;

type DecisionVacante = "ok" | "penalizada_obtenible" | "excluida_sustantivo" | "excluida_multiple";

// Heurísticas de ranking calibradas con el seed (text-embedding-3-small).
// Con el filtro del LLM, el piso vuelve a 0.50: las vacantes débiles que antes
// colaban (p. ej. arquitecto cloud → Diseñador UX/UI) ahora caen por no_cumple.
const MIN_SIMILITUD_PERFIL = 0.5; // debajo: la vacante no se considera
const SIM_SCORE_0 = 0.45; // similitud que mapea a score 0
const SIM_SCORE_100 = 0.7; // similitud que mapea a score 100

// Precios de lista supuestos (USD por millón de tokens) para estimar costo por
// corrida en audit_log. Verificar contra la facturación real de OpenAI.
const USD_POR_MILLON = { llm: { entrada: 2, salida: 8 }, embeddings: 0.02 };
const costoLLM = (u: UsoTokens) => +((u.entrada * USD_POR_MILLON.llm.entrada + u.salida * USD_POR_MILLON.llm.salida) / 1e6).toFixed(6);
const costoEmbeddings = (tokens: number) => +((tokens * USD_POR_MILLON.embeddings) / 1e6).toFixed(6);

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

// Perfil anonimizado en líneas etiquetadas por campo (para embeber, verificar y citar).
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

const bloqueVacante = (v: Vacante, conIds: boolean) =>
  `### vacante_id: ${v.id}\n${v.titulo}\n${v.descripcion ?? ""}\nNo negociables:\n${v.no_negociables
    .map((n) => (conIds ? `- id: ${n.id} | ${n.texto}` : `- ${n.texto}`))
    .join("\n")}`;

const SISTEMA_VERIFICACION = `Eres el verificador de no negociables del Sugeridor de vacantes de LivHire (El Puerto de Liverpool).
Recibes el perfil anonimizado de UN candidato y varias vacantes. Para CADA vacante, evalúa cada uno de sus no negociables contra el perfil.

Reglas:
- Evaluación ciega: el perfil viene anonimizado. No infieras nombre, edad, género, origen ni domicilio, y no los uses para evaluar.
- Una entrada por cada vacante recibida (su vacante_id exacto) y, dentro, una por cada no negociable de esa vacante.
${REGLAS_SEMAFORO}
- "fuente" siempre es "Perfil". En "fragmento" copia LITERALMENTE un pasaje corto del perfil (sin la etiqueta [campo]); no parafrasees.
- Sé estricto: un requisito de estudios o certificación de otra disciplina es "no_cumple"; experiencia relacionada pero menor o indirecta es "parcial".
- Tú no decides nada: solo evalúas evidencia.`;

const SISTEMA_MOTIVOS = `Eres el Sugeridor de vacantes de LivHire (El Puerto de Liverpool).
Un candidato no fue seleccionado para su vacante. Ya se eligieron otras vacantes abiertas que encajan con su perfil; ninguna tiene no negociables sustantivos sin cumplir.
Tu única tarea es redactar el MOTIVO de cada sugerencia.

Reglas:
- Un motivo por cada vacante recibida (usa su vacante_id exacto), en español, 1 o 2 oraciones, máximo 45 palabras, tono profesional y cálido.
- Explica qué del perfil encaja con la vacante.
- Si la vacante trae no negociables en PARCIAL, el motivo debe incluir la palabra "validar" seguida de qué validar (ej. "validar la experiencia liderando equipos").
- Si la vacante trae un no negociable NO CUMPLIDO pero obtenible, el motivo debe incluir la palabra "obtener" seguida de qué obtener (ej. "obtener la certificación cloud vigente").
- "campo_ficha": el campo del perfil en que te basaste; debe ser uno de: ${CAMPOS_PERFIL_MOTIVO.join(", ")}.
- Evaluación ciega: el perfil viene anonimizado. No menciones ni infieras nombre, edad, género, estado civil, familia, salud, origen ni domicilio.
- No prometas contratación ni decidas nada: solo sugieres.`;

function validarVerificacion(
  crudo: SalidaVerificacionLLM,
  aVerificar: { v: Vacante }[],
  citaExiste: (fuente: "Perfil", fragmento: string) => boolean,
) {
  const errores: string[] = [];
  const porId = new Map(aVerificar.map(({ v }) => [v.id, v]));
  const semaforos = new Map<string, CumpleNoNegociable[]>();
  for (const x of crudo.vacantes) {
    const v = porId.get(x.vacante_id);
    if (!v) {
      errores.push(`vacante_id desconocido: ${x.vacante_id}`);
      continue;
    }
    if (semaforos.has(v.id)) {
      errores.push(`vacante_id repetido: ${v.id}`);
      continue;
    }
    const r = validarSemaforo(x.cumple_no_negociables, v.no_negociables, citaExiste);
    errores.push(...r.errores.map((e) => `Vacante ${v.id}: ${e}`));
    semaforos.set(v.id, r.semaforo);
  }
  for (const id of porId.keys()) if (!semaforos.has(id)) errores.push(`Falta la vacante ${id}`);
  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: semaforos };
}

function validarMotivos(
  crudo: SalidaMotivosLLM,
  top: { v: Vacante; semaforo: CumpleNoNegociable[]; obtenibles: { texto: string }[] }[],
) {
  const errores: string[] = [];
  const porId = new Map(top.map((t) => [t.v.id, t]));
  const vistos = new Set<string>();
  const campos = new Set<string>(CAMPOS_PERFIL_MOTIVO);
  for (const m of crudo.motivos) {
    const t = porId.get(m.vacante_id);
    if (!t) errores.push(`vacante_id desconocido: ${m.vacante_id}`);
    else if (vistos.has(m.vacante_id)) errores.push(`vacante_id repetido: ${m.vacante_id}`);
    vistos.add(m.vacante_id);
    if (!campos.has(m.campo_ficha)) errores.push(`campo_ficha "${m.campo_ficha}" no es válido`);
    const palabras = m.motivo.trim().split(/\s+/).filter(Boolean).length;
    const oraciones = m.motivo.split(/[.!?]+/).filter((x) => x.trim()).length;
    if (!m.motivo.trim()) errores.push(`Motivo vacío para ${m.vacante_id}`);
    if (palabras > 45 || oraciones > 2) {
      errores.push(`El motivo de ${m.vacante_id} debe tener 1-2 oraciones y máximo 45 palabras (tiene ${oraciones} y ${palabras})`);
    }
    if (t && t.semaforo.some((s) => s.estado === "parcial") && !normalizar(m.motivo).includes("validar")) {
      errores.push(`El motivo de ${m.vacante_id} debe decir "validar …" para sus no negociables en parcial`);
    }
    if (t && t.obtenibles.length && !normalizar(m.motivo).includes("obtener")) {
      errores.push(`El motivo de ${m.vacante_id} debe decir "obtener …" para: ${t.obtenibles.map((o) => o.texto).join("; ")}`);
    }
    const temas = temasProhibidos(m.motivo);
    if (temas.length) errores.push(`El motivo de ${m.vacante_id} toca un tema prohibido (${temas.join(", ")})`);
  }
  for (const id of porId.keys()) if (!vistos.has(id)) errores.push(`Falta el motivo de la vacante ${id}`);
  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: crudo.motivos };
}

// ---------------------------------------------------------------------------
// Persistencia: unique (candidato_id, vacante_id_sugerida) de Persona A.
// La IA solo toca SUS filas: las identifica la marca "(fuente: ficha · campo)"
// al final de motivo, que el sugeridor escribe siempre y el seed / una persona no.
//  - Filas en 'aceptada' o 'descartada' (decisiones humanas): nunca se tocan.
//  - Filas en 'sugerida' SIN marca (seed de la demo o escritas a mano): tampoco;
//    si la IA vuelve a sugerir esa vacante, la fila existente se conserva.
//  - Cada sugerencia: UPDATE solo si la fila es 'sugerida' y con marca; si no
//    existe, INSERT con upsert ignoreDuplicates (el conflicto deja intacta
//    cualquier fila protegida).
//  - Al final borra las 'sugerida' CON marca que ya no salieron.
// La marca se comprueba dentro del mismo UPDATE/DELETE (sin lectura previa).
// ---------------------------------------------------------------------------
const FUENTE = /\s*\(fuente: ficha · ([a-z_]+)\)\s*$/;
const MARCA_IA = "%(fuente: ficha · %)"; // patrón LIKE de las filas escritas por la IA
export const motivoConFuente = (s: Pick<Sugerencia, "motivo" | "campo_ficha">) => `${s.motivo} (fuente: ficha · ${s.campo_ficha})`;

export async function guardarSugerencias(p: {
  candidatoId: string;
  sugerencias: Sugerencia[];
}): Promise<{ persistido: boolean; insertadas: number; actualizadas: number; protegidas: number; borradas: number }> {
  const sb = supabaseAdmin();
  const ts = new Date().toISOString();
  let insertadas = 0;
  let actualizadas = 0;
  let protegidas = 0;

  for (const s of p.sugerencias) {
    const fila = { score: s.score, motivo: motivoConFuente(s), ts };
    const up = await sb
      .from("sugerencias_vacante")
      .update(fila)
      .eq("candidato_id", p.candidatoId)
      .eq("vacante_id_sugerida", s.vacante_id_sugerida)
      .eq("estatus", "sugerida")
      .like("motivo", MARCA_IA)
      .select("id");
    if (up.error) throw new Error(`sugerencias_vacante: ${up.error.message}`);
    if (up.data.length) {
      actualizadas++;
      continue;
    }
    const ins = await sb
      .from("sugerencias_vacante")
      .upsert(
        { candidato_id: p.candidatoId, vacante_id_sugerida: s.vacante_id_sugerida, estatus: "sugerida", ...fila },
        { onConflict: "candidato_id,vacante_id_sugerida", ignoreDuplicates: true },
      )
      .select("id");
    if (ins.error) throw new Error(`sugerencias_vacante: ${ins.error.message}`);
    if (ins.data.length) insertadas++;
    else protegidas++; // ya había una fila del seed, escrita a mano o decidida
  }

  let del = sb
    .from("sugerencias_vacante")
    .delete()
    .eq("candidato_id", p.candidatoId)
    .eq("estatus", "sugerida")
    .like("motivo", MARCA_IA);
  if (p.sugerencias.length) {
    del = del.not("vacante_id_sugerida", "in", `(${p.sugerencias.map((s) => s.vacante_id_sugerida).join(",")})`);
  }
  const borr = await del.select("id");
  if (borr.error) throw new Error(`sugerencias_vacante: ${borr.error.message}`);

  return { persistido: true, insertadas, actualizadas, protegidas, borradas: borr.data.length };
}

export interface SugerenciaGuardada {
  vacante_id_sugerida: string;
  vacante_titulo: string;
  score: number | null;
  motivo: string;
  campo_ficha: string | null;
  estatus: "sugerida" | "aceptada" | "descartada";
  ts: string;
}

// Lectura sin regenerar: todas las sugerencias del candidato (incluidas las ya decididas).
export async function sugerenciasGuardadasDe(candidatoVacanteId: string) {
  const sb = supabaseAdmin();
  const cv = await sb.from("candidato_vacante").select("candidato_id").eq("id", candidatoVacanteId).maybeSingle();
  if (cv.error) throw new Error(cv.error.message);
  if (!cv.data) return { error: "no_encontrado" as const };
  const { data, error } = await sb
    .from("sugerencias_vacante")
    .select("vacante_id_sugerida, score, motivo, estatus, ts, vacantes(titulo)")
    .eq("candidato_id", cv.data.candidato_id)
    .order("score", { ascending: false });
  if (error) throw new Error(error.message);
  const sugerencias: SugerenciaGuardada[] = (data ?? []).map((r) => {
    const m = (r.motivo ?? "").match(FUENTE);
    return {
      vacante_id_sugerida: r.vacante_id_sugerida,
      vacante_titulo: (r.vacantes as unknown as { titulo: string } | null)?.titulo ?? "(vacante)",
      score: r.score,
      motivo: m ? (r.motivo as string).replace(FUENTE, "") : (r.motivo ?? ""),
      campo_ficha: m ? m[1] : null,
      estatus: r.estatus,
      ts: r.ts,
    };
  });
  return { sugerencias };
}

export async function sugerirVacantes(candidatoVacanteId: string, actor: Actor, opciones: OpcionesAudit = {}) {
  const t0 = Date.now();
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
  const filtros = {
    ya_participa_o_decidida: 0,
    sin_no_negociables: 0,
    similitud_baja: 0,
    fuera_del_top: 0,
    no_cumple_sustantivo: 0,
    no_cumple_multiple: 0,
  };
  const candidatas = todas
    .filter((v) => {
      if (excluidas.has(v.id)) return (filtros.ya_participa_o_decidida++, false);
      if (!v.no_negociables.length) return (filtros.sin_no_negociables++, false);
      return true;
    })
    // Orden estable de los no negociables (el mismo que usa el semáforo del extractor).
    .map((v) => ({ ...v, no_negociables: [...v.no_negociables].sort((a, b) => a.id.localeCompare(b.id)) }));

  const { lineas, ocultados } = perfilAnonimizado(
    candidato.nombre,
    candidato.escolaridad,
    ficha,
    (cv.data.cumple_no_negociables ?? []) as CumpleNoNegociable[],
  );
  const perfil = lineas.map((l) => `- [${l.campo}] ${l.texto}`).join("\n");

  // 1) Ranking por embeddings: una sola llamada (perfil + cada vacante).
  const tEmb = Date.now();
  const emb = await embeber([lineas.map((l) => l.texto).join("\n"), ...candidatas.map(textoVacante)]);
  const msEmb = Date.now() - tEmb;
  const ranking = candidatas
    .map((v, i) => ({ v, sim: coseno(emb.vectores[0], emb.vectores[i + 1]) }))
    .filter((r) => (r.sim < MIN_SIMILITUD_PERFIL ? (filtros.similitud_baja++, false) : true))
    .sort((a, b) => b.sim - a.sim);
  const aVerificar = ranking.slice(0, MAX_VERIFICAR);
  filtros.fuera_del_top = ranking.length - aVerificar.length;

  // 2) Filtro estricto: semáforo por vacante con el LLM (misma lógica que el extractor).
  let verificacion: { semaforos: Map<string, CumpleNoNegociable[]>; modelo: string; intentos: number; erroresPrevios: string[]; uso: UsoTokens } | null = null;
  const tVer = Date.now();
  if (aVerificar.length) {
    const citaExiste = crearVerificadorCitas({ Perfil: perfil });
    const r = await generarValidado({
      modelo: MODELO_EXTRACCION,
      sistema: SISTEMA_VERIFICACION,
      usuario: `PERFIL DEL CANDIDATO (anonimizado; fuente "Perfil"):\n${perfil}\n\nVACANTES:\n${aVerificar.map(({ v }) => bloqueVacante(v, true)).join("\n\n")}`,
      schema: SalidaVerificacionLLM,
      nombreSchema: "verificacion_no_negociables",
      validar: (crudo) => validarVerificacion(crudo, aVerificar, citaExiste),
    });
    verificacion = { semaforos: r.valor, modelo: r.modelo, intentos: r.intentos, erroresPrevios: r.erroresPrevios, uso: r.uso };
  }
  const msVer = Date.now() - tVer;

  // Regla de exclusión (clasificación "obtenible" en código, lib/ia/obtenible.ts):
  //  0 no_cumple → se queda; 1 no_cumple obtenible → se queda con -PENALIZACION
  //  y el motivo dice "validar u obtener …"; 1 sustantivo o 2+ no_cumple → fuera.
  const verificadas = aVerificar.map(({ v, sim }) => {
    const semaforo = verificacion?.semaforos.get(v.id) ?? [];
    const noCumple = v.no_negociables.filter((n) => semaforo.find((s) => s.no_negociable_id === n.id)?.estado === "no_cumple");
    const clases = noCumple.map((n) => ({ texto: n.texto, ...clasificarNoNegociable(n.texto) }));
    const decision: DecisionVacante =
      noCumple.length === 0
        ? "ok"
        : noCumple.length >= 2
          ? "excluida_multiple"
          : clases[0].obtenible
            ? "penalizada_obtenible"
            : "excluida_sustantivo";
    const puntaje = Math.max(0, score(sim) - (decision === "penalizada_obtenible" ? PENALIZACION_OBTENIBLE : 0));
    return { v, sim, semaforo, decision, puntaje, obtenibles: decision === "penalizada_obtenible" ? clases : [], clases };
  });
  filtros.no_cumple_sustantivo = verificadas.filter((x) => x.decision === "excluida_sustantivo").length;
  filtros.no_cumple_multiple = verificadas.filter((x) => x.decision === "excluida_multiple").length;
  const top = verificadas
    .filter((x) => x.decision === "ok" || x.decision === "penalizada_obtenible")
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, MAX_SUGERENCIAS);

  // 3) Motivos (solo el top 3); los parciales se mencionan como "validar …".
  let sugerencias: Sugerencia[] = [];
  let motivosLLM: { modelo: string; intentos: number; erroresPrevios: string[]; uso: UsoTokens } | null = null;
  const tMot = Date.now();
  if (top.length) {
    const vacantes = top
      .map(({ v, semaforo, obtenibles }) => {
        const parciales = v.no_negociables.filter((n) => semaforo.find((s) => s.no_negociable_id === n.id)?.estado === "parcial");
        return `${bloqueVacante(v, false)}\nNo negociables en PARCIAL (menciónalos como "validar …"): ${
          parciales.length ? parciales.map((n) => n.texto).join("; ") : "ninguno"
        }\nNo negociable NO CUMPLIDO pero obtenible (menciónalo como "obtener …"): ${
          obtenibles.length ? obtenibles.map((n) => n.texto).join("; ") : "ninguno"
        }`;
      })
      .join("\n\n");
    const r = await generarValidado({
      modelo: MODELO_EXTRACCION,
      sistema: SISTEMA_MOTIVOS,
      usuario: `PERFIL DEL CANDIDATO (anonimizado, por campo):\n${perfil}\n\nVACANTES SUGERIDAS:\n${vacantes}`,
      schema: SalidaMotivosLLM,
      nombreSchema: "motivos_sugerencias",
      validar: (crudo) => validarMotivos(crudo, top),
    });
    motivosLLM = { modelo: r.modelo, intentos: r.intentos, erroresPrevios: r.erroresPrevios, uso: r.uso };
    const motivos = new Map(r.valor.map((m) => [m.vacante_id, m]));
    sugerencias = Sugerencia.array().parse(
      top.map(({ v, puntaje }) => ({
        vacante_id_sugerida: v.id,
        vacante_titulo: v.titulo,
        score: puntaje,
        motivo: motivos.get(v.id)!.motivo.trim(),
        campo_ficha: motivos.get(v.id)!.campo_ficha,
        estatus: "sugerida",
      })),
    );
  }
  const msMot = Date.now() - tMot;

  const guardado = await guardarSugerencias({ candidatoId, sugerencias });
  const { persistido } = guardado;

  const tokens = {
    embeddings: emb.tokens,
    verificacion: verificacion?.uso ?? { entrada: 0, salida: 0 },
    motivos: motivosLLM?.uso ?? { entrada: 0, salida: 0 },
  };
  const costo = {
    embeddings: costoEmbeddings(tokens.embeddings),
    verificacion: costoLLM(tokens.verificacion),
    motivos: costoLLM(tokens.motivos),
  };
  const medicion = {
    tiempos_ms: { embeddings: msEmb, verificacion: msVer, motivos: msMot, total: Date.now() - t0 },
    tokens,
    costo_usd_estimado: { ...costo, total: +(costo.embeddings + costo.verificacion + costo.motivos).toFixed(6) },
  };
  const resumenVerificadas = verificadas.map((x) => ({
    vacante_id: x.v.id,
    score: x.puntaje,
    semaforo: x.semaforo.map((s) => s.estado),
    decision: x.decision,
    reglas_no_cumple: x.clases.map((c) => c.regla),
  }));

  await registrarAudit({
    actor,
    accion: "ia_sugerir_vacantes",
    entidad: "candidato_vacante",
    entidad_id: candidatoVacanteId,
    prueba: opciones.prueba,
    detalle: {
      agente: "sugeridor_vacantes",
      prompt: VERSION_PROMPT_SUGERENCIAS,
      modelo: motivosLLM?.modelo ?? verificacion?.modelo ?? null,
      modelo_embeddings: MODELO_EMBEDDINGS,
      intentos: { verificacion: verificacion?.intentos ?? 0, motivos: motivosLLM?.intentos ?? 0 },
      errores_intentos_previos: [...(verificacion?.erroresPrevios ?? []), ...(motivosLLM?.erroresPrevios ?? [])],
      temperature: 0,
      vacantes_abiertas: todas.length,
      vacantes_consideradas: candidatas.length,
      vacantes_filtradas: filtros,
      verificadas: resumenVerificadas,
      sugerencias: sugerencias.map((s) => ({ vacante_id: s.vacante_id_sugerida, score: s.score })),
      persistido,
      filas: {
        insertadas: guardado.insertadas,
        actualizadas: guardado.actualizadas,
        protegidas: guardado.protegidas,
        borradas: guardado.borradas,
      },
      ...medicion,
      evaluacion_ciega: { campos_ocultados: ocultados },
    },
  });

  return { sugerencias, persistido, consideradas: candidatas.length, filtros, verificadas: resumenVerificadas, ...medicion };
}
