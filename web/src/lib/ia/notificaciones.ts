import "server-only";
import { anonimizar } from "./anonimizar";
import { generarValidado } from "./llm";
import { MODELO_EXTRACCION } from "./openai";
import { SalidaMensajeLLM, type Ficha } from "./schemas";
import { normalizar } from "./semaforo";
import { conLimite, clasificarError, detalleSeguro, type ErrorGenerico, type Ejecucion } from "./seguro";
import { registrarAuditSeguro, type Actor } from "./servicio";
import { supabaseAdmin } from "./supabase-provisional";
import { temasProhibidos } from "./temas-prohibidos";

// Agente 5 de docs/04: feedback personalizado.
// NO crea notificaciones: el orquestador de Persona A deja borradores con una
// plantilla fija (crearNotificaciones) y aquí solo se REESCRIBE su `contenido`
// antes de que el AT apruebe el lote. Nunca se toca una fila que ya no esté en
// 'borrador' (la condición va en el mismo UPDATE).

export const VERSION_PROMPT_MENSAJE = "mensaje-v3";
// 0.2 y no 0: son cientos de mensajes a personas y a temperatura 0 salen casi
// idénticos entre candidatos con fichas parecidas; un poco de variación hace
// que no se lean como plantilla. El contenido lo acotan la validación en código
// y el contexto (fortalezas reales, motivo, sugerencias), no la temperatura.
const TEMPERATURA_MENSAJE = 0.2;
const MIN_PALABRAS = 120;
const MAX_PALABRAS = 200;
const PLACEHOLDER = "{{nombre}}";
// Saludo: "Hola, {{nombre}}:" en su propia línea (no "Hola Carlos, Queremos…").
const SALUDO = /^Hola, \{\{nombre\}\}:[ \t]*\r?\n/;

export type Tono = "avance" | "cierre" | "bienvenida";
type TipoSoportado = "cambio_etapa" | "resultado";

// Qué decisiones del HM aportan contexto a cada tono (la justificación de un
// "descartado" no debe colarse en un mensaje de avance, y viceversa).
const DECISIONES_POR_TONO: Record<Tono, string[]> = {
  avance: ["finalista", "avanzar_oferta"],
  cierre: ["descartado", "pool", "reemparejar"],
  bienvenida: [],
};

export interface BorradorEntrada {
  candidatoId: string;
  vacanteId: string;
  tipo: TipoSoportado;
  contenidoBase: string; // plantilla del orquestador (hechos: etapa, vacante)
}

interface Contexto {
  nombre: string;
  primerNombre: string;
  vacanteTitulo: string;
  estatus: string;
  ficha: Partial<Ficha>;
  justificacion: string | null;
  competenciasDestacadas: string[];
  sugerencias: string[]; // títulos de vacantes sugeridas guardadas
  nombresEntrevistadores: string[]; // solo para verificar que no aparezcan
}

async function cargarContexto(candidatoId: string, vacanteId: string, tono: (estatus: string) => Tono): Promise<(Contexto & { tono: Tono }) | null> {
  const sb = supabaseAdmin();
  const [cand, cv, vac, dec, ents, sug] = await Promise.all([
    sb.from("candidatos").select("nombre").eq("id", candidatoId).maybeSingle(),
    sb.from("candidato_vacante").select("estatus, ficha").eq("candidato_id", candidatoId).eq("vacante_id", vacanteId).maybeSingle(),
    sb.from("vacantes").select("titulo").eq("id", vacanteId).maybeSingle(),
    // Solo lectura: la decisión y su justificación son del dominio de Persona A.
    sb.from("decisiones").select("decision, justificacion, ts").eq("candidato_id", candidatoId).eq("vacante_id", vacanteId).order("ts", { ascending: false }).limit(1),
    sb.from("entrevistas").select("id").eq("candidato_id", candidatoId).eq("vacante_id", vacanteId),
    sb.from("sugerencias_vacante").select("vacantes(titulo)").eq("candidato_id", candidatoId).in("estatus", ["sugerida", "aceptada"]).order("score", { ascending: false }).limit(3),
  ]);
  for (const r of [cand, cv, vac, dec, ents, sug]) if (r.error) throw new Error(r.error.message);
  if (!cand.data || !cv.data || !vac.data) return null;

  const t = tono(cv.data.estatus);
  const ultima = dec.data?.[0];
  const justificacion = ultima && DECISIONES_POR_TONO[t].includes(ultima.decision) ? ultima.justificacion : null;

  // Veredictos de entrevista: solo las competencias mejor evaluadas (nombres, sin cifras)
  // y los nombres de entrevistadores para comprobar que no se filtren.
  let competenciasDestacadas: string[] = [];
  let nombresEntrevistadores: string[] = [];
  const idsEnt = (ents.data ?? []).map((e) => e.id);
  if (idsEnt.length) {
    const fb = await sb.from("feedback_entrevista").select("scores, usuarios(nombre)").in("entrevista_id", idsEnt);
    if (fb.error) throw new Error(fb.error.message);
    const suma = new Map<string, { total: number; n: number }>();
    for (const f of fb.data ?? []) {
      for (const [k, v] of Object.entries((f.scores ?? {}) as Record<string, number>)) {
        const a = suma.get(k) ?? { total: 0, n: 0 };
        suma.set(k, { total: a.total + Number(v), n: a.n + 1 });
      }
      const u = f.usuarios as unknown as { nombre: string } | null;
      if (u?.nombre) nombresEntrevistadores.push(u.nombre);
    }
    competenciasDestacadas = [...suma.entries()]
      .sort((a, b) => b[1].total / b[1].n - a[1].total / a[1].n)
      .slice(0, 2)
      .map(([k]) => k.replace(/_/g, " "));
    nombresEntrevistadores = [...new Set(nombresEntrevistadores)];
  }

  return {
    tono: t,
    nombre: cand.data.nombre,
    primerNombre: cand.data.nombre.trim().split(/\s+/)[0],
    vacanteTitulo: vac.data.titulo,
    estatus: cv.data.estatus,
    ficha: (cv.data.ficha ?? {}) as Partial<Ficha>,
    justificacion,
    competenciasDestacadas,
    sugerencias: (sug.data ?? []).map((s) => (s.vacantes as unknown as { titulo: string } | null)?.titulo).filter((x): x is string => Boolean(x)),
    nombresEntrevistadores,
  };
}

const tonoPara = (tipo: TipoSoportado) => (estatus: string): Tono =>
  tipo === "cambio_etapa" ? "avance" : estatus === "contratado" ? "bienvenida" : "cierre";

const SISTEMA = `Eres el redactor de LivHire (El Puerto de Liverpool). Reescribes el aviso que recibirá UN candidato sobre su proceso, para que sea personal, cálido y respetuoso.

Reglas:
- Español, ${MIN_PALABRAS}-${MAX_PALABRAS} palabras, trato de "tú", tono profesional y humano. Firma como "Equipo de Atracción de Talento de Liverpool".
- La primera línea es exactamente "Hola, ${PLACEHOLDER}:" y el texto sigue en la línea siguiente. Usa ${PLACEHOLDER} donde iría el nombre (nunca escribas un nombre real).
- Menciona 1 o 2 fortalezas REALES de la lista que te doy, con su redacción, y decláralas en "fortalezas_usadas".
- Respeta los hechos del aviso base (vacante, etapa, resultado). No prometas nada que no diga.
- Tono "avance": buenas noticias y siguiente paso. Tono "bienvenida": felicita y confirma el ingreso. Tono "cierre": agradece, da una razón constructiva (en términos de lo que el puesto requería, sin juicios sobre la persona) y, si hay vacantes sugeridas, invítale a considerarlas nombrándolas.
- En un cierre NO digas ni insinúes que se eligió a otra persona o perfil ("avanzamos con un perfil que…"): habla solo de lo que el puesto requería y de sus fortalezas.
- PROHIBIDO: cifras de cualquier tipo (sin números, porcentajes ni puntajes), mencionar a otros candidatos o perfiles, nombres de entrevistadores o del equipo, comentarios internos o citas de la justificación, salario, y cualquier referencia a edad, género, estado civil, familia, salud, religión, origen o domicilio.
- El contexto interno (motivo de la decisión, competencias mejor evaluadas) es solo para orientarte: tradúcelo a lenguaje constructivo, no lo copies.`;

function construirPrompt(c: Contexto & { tono: Tono }, contenidoBase: string) {
  const a = (s: string) => anonimizar(s, c.nombre).texto;
  return `TONO: ${c.tono}
VACANTE: ${c.vacanteTitulo}
AVISO BASE (hechos a respetar): ${a(contenidoBase)}

FORTALEZAS DEL CANDIDATO (usa 1-2, con esta redacción):
${(c.ficha.fortalezas ?? []).map((f) => `- ${a(f)}`).join("\n") || "- (sin fortalezas registradas)"}
${c.ficha.descripcion ? `DESCRIPCIÓN DEL PERFIL: ${a(c.ficha.descripcion)}` : ""}
${c.competenciasDestacadas.length ? `COMPETENCIAS MEJOR EVALUADAS EN ENTREVISTA (contexto interno): ${c.competenciasDestacadas.join(", ")}` : ""}
${c.justificacion ? `MOTIVO INTERNO DE LA DECISIÓN (no lo cites; tradúcelo a una razón constructiva): ${a(c.justificacion)}` : ""}
${c.tono === "cierre" ? `VACANTES SUGERIDAS PARA SU PERFIL: ${c.sugerencias.length ? c.sugerencias.join("; ") : "ninguna (no inventes vacantes)"}` : ""}`;
}

const palabras = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function ngramas(s: string, n: number) {
  const w = normalizar(s).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

function validarMensaje(crudo: SalidaMensajeLLM, c: Contexto & { tono: Tono }) {
  const errores: string[] = [];
  const m = crudo.mensaje.trim();
  const nm = normalizar(m);

  if (!m.includes(PLACEHOLDER)) errores.push(`El mensaje debe usar ${PLACEHOLDER} para el nombre`);
  if (!SALUDO.test(m)) errores.push(`La primera línea debe ser exactamente "Hola, ${PLACEHOLDER}:" y el texto seguir en la línea siguiente`);
  const otros = m.match(/\{\{[^}]*\}\}/g)?.filter((x) => x !== PLACEHOLDER) ?? [];
  if (otros.length) errores.push(`Placeholders no permitidos: ${otros.join(", ")}`);
  const n = palabras(m);
  if (n < MIN_PALABRAS || n > MAX_PALABRAS) errores.push(`El mensaje tiene ${n} palabras; debe tener ${MIN_PALABRAS}-${MAX_PALABRAS}`);
  if (/\d/.test(m)) errores.push("El mensaje no puede llevar cifras (ni puntajes, porcentajes o montos)");

  const temas = temasProhibidos(m);
  if (temas.length) errores.push(`Toca un tema prohibido (${temas.join(", ")})`);
  if (/\botr[oa]s? (candidat\w*|perfil(es)?|persona)\b/.test(nm)) errores.push("No menciones a otros candidatos o perfiles");
  // "Avanzamos con un perfil que se ajusta más…" insinúa que se eligió a otra persona.
  if (/\b(avanz|continu|segui|opt|eleg|elig|seleccion|decidi)\w* (con|por) (un|una|otr[oa]s?) (perfil|candidat\w*|persona|opcion)/.test(nm)) {
    errores.push("No insinúes que se eligió a otra persona o perfil; explica solo lo que el puesto requería");
  }
  if (/\b(puntaje|puntuacion|calificacion|score|ranking|porcentaje|entrevistador\w*|comite)\b/.test(nm)) {
    errores.push("No menciones puntajes, calificaciones ni a los entrevistadores");
  }
  for (const nombre of c.nombresEntrevistadores) {
    const partes = normalizar(nombre).split(" ").filter((p) => p.length >= 3);
    if (partes.some((p) => new RegExp(`\\b${p}\\b`).test(nm))) errores.push("No menciones nombres del equipo entrevistador");
  }
  if (c.justificacion) {
    const copia = [...ngramas(m, 6)].some((g) => ngramas(c.justificacion!, 6).has(g));
    if (copia) errores.push("No copies frases del motivo interno; tradúcelo a una razón constructiva");
  }

  const fortalezas = (c.ficha.fortalezas ?? []).map(normalizar);
  if (fortalezas.length) {
    if (crudo.fortalezas_usadas.length < 1 || crudo.fortalezas_usadas.length > 2) {
      errores.push("Declara 1 o 2 fortalezas en fortalezas_usadas");
    }
    for (const f of crudo.fortalezas_usadas) {
      const nf = normalizar(f);
      if (!fortalezas.includes(nf)) errores.push(`"${f}" no es una fortaleza de la ficha`);
      else if (!nm.includes(nf)) errores.push(`La fortaleza "${f}" no aparece en el mensaje con esa redacción`);
    }
  }
  if (c.tono === "cierre" && c.sugerencias.length && !c.sugerencias.some((s) => nm.includes(normalizar(s)))) {
    errores.push(`Invita a considerar al menos una vacante sugerida por su nombre: ${c.sugerencias.join("; ")}`);
  }

  if (errores.length) return { ok: false as const, errores };
  return { ok: true as const, valor: { mensaje: m, fortalezas: crudo.fortalezas_usadas } };
}

export interface ResultadoRedaccion {
  tono: Tono;
  mensaje: string; // ya con el nombre sustituido
  palabras: number;
  fortalezas: string[];
  modelo: string;
  intentos: number;
  erroresPrevios: string[];
}

// Redacta sin escribir en notificaciones (núcleo; puede lanzar, lo protegen las envolturas).
async function redactarMensaje(b: BorradorEntrada, signal?: AbortSignal): Promise<ResultadoRedaccion | { error: "sin_contexto" }> {
  const c = await cargarContexto(b.candidatoId, b.vacanteId, tonoPara(b.tipo));
  if (!c) return { error: "sin_contexto" };
  const r = await generarValidado({
    modelo: MODELO_EXTRACCION,
    sistema: SISTEMA,
    usuario: construirPrompt(c, b.contenidoBase),
    schema: SalidaMensajeLLM,
    nombreSchema: "mensaje_candidato",
    temperatura: TEMPERATURA_MENSAJE,
    signal,
    validar: (crudo) => validarMensaje(crudo, c),
  });
  // El nombre solo entra aquí, en código, después de validar.
  const mensaje = r.valor.mensaje.replaceAll(PLACEHOLDER, c.primerNombre);
  return {
    tono: c.tono,
    mensaje,
    palabras: palabras(r.valor.mensaje),
    fortalezas: r.valor.fortalezas,
    modelo: r.modelo,
    intentos: r.intentos,
    erroresPrevios: r.erroresPrevios,
  };
}

// ---------------------------------------------------------------------------
// API pública: NUNCA lanza (contrato con el orquestador / pantalla de aprobación
// de Persona A). Toda falla vuelve como { ok: false, error, detalle? } y deja
// registro en audit_log.
// ---------------------------------------------------------------------------
export const LIMITE_PERSONALIZAR_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ErrorPersonalizar =
  | "no_encontrada"
  | "no_es_candidato"
  | "tipo_no_soportado"
  | "sin_vacante"
  | "no_es_borrador"
  | "sin_contexto"
  | ErrorGenerico; // "salida_invalida" | "timeout" | "interno"

export type ResultadoPersonalizar =
  | { ok: true; resultado: ResultadoRedaccion; actualizado: boolean }
  | { ok: false; error: ErrorPersonalizar; detalle?: string };

export interface OpcionesPersonalizar {
  /** Genera y valida el texto, pero NO actualiza la fila. */
  dryRun?: boolean;
  /** Marca la entrada de audit_log como prueba. */
  prueba?: boolean;
  actor?: Actor;
  /** Tiempo límite en ms (por defecto 30 000). */
  limiteMs?: number;
}

async function ejecutarPersonalizar(
  opciones: OpcionesPersonalizar,
  notificacionId: string | null,
  simulado: boolean,
  fn: (e: Ejecucion) => Promise<ResultadoPersonalizar>,
): Promise<ResultadoPersonalizar> {
  const t0 = Date.now();
  const limite = opciones.limiteMs ?? LIMITE_PERSONALIZAR_MS;
  let r: ResultadoPersonalizar;
  try {
    if (notificacionId !== null && !UUID.test(notificacionId)) {
      r = { ok: false, error: "no_encontrada", detalle: "id con formato inválido" };
    } else {
      const x = await conLimite(limite, fn);
      r = "timeout" in x ? { ok: false, error: "timeout", detalle: `Sin respuesta en ${limite} ms` } : x;
    }
  } catch (err) {
    r = { ok: false, error: clasificarError(err), detalle: detalleSeguro(err) };
  }
  if (!r.ok) {
    await registrarAuditSeguro({
      actor: opciones.actor ?? { id: null, rol: null },
      accion: "ia_redactar_notificacion",
      entidad: "notificaciones",
      entidad_id: notificacionId && UUID.test(notificacionId) ? notificacionId : null,
      prueba: opciones.prueba,
      detalle: {
        agente: "feedback_personalizado",
        prompt: VERSION_PROMPT_MENSAJE,
        ok: false,
        error: r.error,
        detalle: r.detalle ?? null,
        notificacion_id: notificacionId,
        dry_run: Boolean(opciones.dryRun),
        simulado,
        actualizado: false,
        duracion_ms: Date.now() - t0,
      },
    });
  }
  return r;
}

/**
 * Reescribe con IA el `contenido` de un borrador de notificación que ya creó el
 * orquestador (agente 5). No crea notificaciones.
 *
 * - **Nunca lanza**: toda falla vuelve como `{ ok: false, error }` y queda en audit_log.
 * - Tarda ~4-8 s; límite 30 s. Es seguro llamarla sin `await`.
 * - Solo modifica la fila si sigue en 'borrador' (condición en el mismo UPDATE);
 *   si el AT ya la aprobó o envió, devuelve `{ ok: false, error: "no_es_borrador" }`.
 */
export async function personalizarBorrador(
  notificacionId: string,
  opciones: OpcionesPersonalizar = {},
): Promise<ResultadoPersonalizar> {
  return ejecutarPersonalizar(opciones, notificacionId, false, async (ej) => {
    const sb = supabaseAdmin();
    const n = await sb
      .from("notificaciones")
      .select("id, destinatario_tipo, destinatario_id, vacante_id, tipo, estatus, contenido")
      .eq("id", notificacionId)
      .maybeSingle();
    if (n.error) throw new Error(n.error.message);
    if (!n.data) return { ok: false, error: "no_encontrada" };
    if (n.data.destinatario_tipo !== "candidato") return { ok: false, error: "no_es_candidato" };
    if (n.data.tipo !== "cambio_etapa" && n.data.tipo !== "resultado") return { ok: false, error: "tipo_no_soportado" };
    if (!n.data.vacante_id) return { ok: false, error: "sin_vacante" };
    if (n.data.estatus !== "borrador") return { ok: false, error: "no_es_borrador" };

    const r = await redactarMensaje(
      { candidatoId: n.data.destinatario_id, vacanteId: n.data.vacante_id, tipo: n.data.tipo, contenidoBase: n.data.contenido ?? "" },
      ej.signal,
    );
    if ("error" in r) return { ok: false, error: r.error };

    let actualizado = false;
    if (!opciones.dryRun) {
      // Punto de no retorno. La condición de estatus va en el MISMO update: si el
      // AT aprobó el lote mientras se redactaba, no se actualiza nada.
      const up = await ej.escribir(() =>
        sb.from("notificaciones").update({ contenido: r.mensaje }).eq("id", notificacionId).eq("estatus", "borrador").select("id"),
      );
      if (up.error) throw new Error(up.error.message);
      if (!up.data.length) return { ok: false, error: "no_es_borrador" };
      actualizado = true;
    }

    await auditarRedaccion(r, { notificacionId, dryRun: Boolean(opciones.dryRun), actualizado, prueba: opciones.prueba, actor: opciones.actor });
    return { ok: true, resultado: r, actualizado };
  });
}

/** Dry-run sin fila: borrador construido en memoria (pruebas y demo). Nunca escribe en notificaciones ni lanza. */
export async function personalizarSimulado(
  b: BorradorEntrada,
  opciones: Omit<OpcionesPersonalizar, "dryRun"> = {},
): Promise<ResultadoPersonalizar> {
  return ejecutarPersonalizar({ ...opciones, dryRun: true }, null, true, async (ej) => {
    const r = await redactarMensaje(b, ej.signal);
    if ("error" in r) return { ok: false, error: r.error };
    await auditarRedaccion(r, { notificacionId: null, dryRun: true, actualizado: false, simulado: true, ...opciones });
    return { ok: true, resultado: r, actualizado: false };
  });
}

async function auditarRedaccion(
  r: ResultadoRedaccion,
  o: { notificacionId: string | null; dryRun: boolean; actualizado: boolean; simulado?: boolean; prueba?: boolean; actor?: Actor },
) {
  await registrarAuditSeguro({
    actor: o.actor ?? { id: null, rol: null },
    accion: "ia_redactar_notificacion",
    entidad: "notificaciones",
    entidad_id: o.notificacionId,
    prueba: o.prueba,
    detalle: {
      agente: "feedback_personalizado",
      prompt: VERSION_PROMPT_MENSAJE,
      ok: true,
      modelo: r.modelo,
      temperature: TEMPERATURA_MENSAJE,
      intentos: r.intentos,
      errores_intentos_previos: r.erroresPrevios,
      notificacion_id: o.notificacionId,
      tono: r.tono,
      palabras: r.palabras,
      dry_run: o.dryRun,
      simulado: Boolean(o.simulado),
      actualizado: o.actualizado,
    },
  });
}
