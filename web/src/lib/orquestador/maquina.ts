// Orquestador: ejecuta las transiciones de estados.ts contra Supabase.
// Reglas de oro aplicadas aquí:
//  1. Humano decide lo irreversible: las compuertas ESPERANDO_HM_* solo las cruza el HM,
//     y toda decisión/confirmación exige justificación.
//  2. Cero ghosting: cada cambio de estado o decisión deja notificación en borrador
//     para los candidatos afectados.
//  3. Candado de posición: lo impone la BD (trg_candado_posicion); aquí se traduce.
//  4. Trazabilidad: cada paso escribe en audit_log.
//
// Nota: PostgREST no da transacciones multi-tabla; se valida todo antes de la primera
// escritura y la decisión (fuente de verdad) se escribe primero.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CandidatoVacante,
  Decision,
  EstatusVacante,
  EtapaProceso,
  Notificacion,
  TipoDecision,
  Vacante,
  VacanteEtapa,
} from "@/lib/supabase/types";
import { hoyISO } from "@/lib/sla/dias-habiles";
import { generarEtapas, predecirCobertura, replanificarDesde } from "@/lib/sla/motor";
import {
  DECISIONES,
  EFECTO_DECISION,
  INFO_ESTADO,
  NOMBRE_ETAPA,
  esEsperaHM,
  transicionDesde,
  type EstadoProceso,
} from "./estados";
import {
  ACCION_CAMBIO_ESTADO,
  crearNotificaciones,
  leerEstados,
  registrarAudit,
  revisar,
  type Actor,
  type NuevaNotificacion,
} from "./persistencia";

export type CodigoError =
  | "CANDADO_POSICION"
  | "ESPERANDO_HM"
  | "TRANSICION_INVALIDA"
  | "JUSTIFICACION_OBLIGATORIA"
  | "NO_AUTORIZADO"
  | "NO_ENCONTRADO";

export class ErrorProceso extends Error {
  constructor(
    public readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(`${codigo}: ${mensaje}`);
    this.name = "ErrorProceso";
  }
}

export interface Contexto {
  db?: SupabaseClient;
  /** Quién ejecuta. Por defecto: el sistema (o el HM en decisiones/confirmaciones). */
  actor?: Actor;
  hoy?: string;
}

export interface ResultadoCambio {
  vacante_id: string;
  estado_anterior: EstadoProceso;
  estado_nuevo: EstadoProceso;
  etapa_anterior: EtapaProceso;
  etapa_nueva: EtapaProceso;
  /** true = quedó en una compuerta: nadie más que el HM la mueve. */
  esperando_hm: boolean;
  notificaciones: Notificacion[];
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function cargarVacante(db: SupabaseClient, vacanteId: string): Promise<Vacante> {
  const v = revisar<Vacante | null>(
    await db.from("vacantes").select("*").eq("id", vacanteId).maybeSingle(),
    "vacante",
  );
  if (!v) throw new ErrorProceso("NO_ENCONTRADO", `la vacante ${vacanteId} no existe`);
  return v;
}

export async function obtenerEstado(vacanteId: string, ctx: Contexto = {}): Promise<EstadoProceso> {
  const db = ctx.db ?? createAdminClient();
  const v = await cargarVacante(db, vacanteId);
  return (await leerEstados(db, [v])).get(v.id)!;
}

function exigirJustificacion(justificacion: string | null | undefined): string {
  const limpia = (justificacion ?? "").trim();
  if (!limpia) {
    throw new ErrorProceso(
      "JUSTIFICACION_OBLIGATORIA",
      "toda decisión del HM debe llevar una justificación no vacía",
    );
  }
  return limpia;
}

type CandidatoEnVacante = Pick<CandidatoVacante, "id" | "candidato_id" | "estatus" | "etapa"> & {
  candidatos: { nombre: string } | null;
};

function primerNombre(c: CandidatoEnVacante): string {
  return c.candidatos?.nombre.split(" ")[0] ?? "";
}

/** Plantilla determinista; el agente de feedback personalizado (IA) la puede reescribir. */
function mensajeCambioEstado(c: CandidatoEnVacante, titulo: string, hacia: EstadoProceso): string {
  const hola = `Hola ${primerNombre(c)},`;
  if (hacia === "CUBIERTA") {
    return c.estatus === "contratado"
      ? `${hola} ¡bienvenida/o al equipo! Confirmamos tu ingreso como "${titulo}". Te compartiremos los detalles de tu primer día.`
      : `${hola} gracias por participar en el proceso de "${titulo}". La vacante ya se cubrió; tu perfil queda en nuestra cartera y te avisaremos de nuevas oportunidades.`;
  }
  if (hacia === "CANCELADA") {
    return `${hola} te informamos que el proceso de "${titulo}" se cerró sin contratación. Gracias por tu tiempo; te avisaremos de nuevas oportunidades.`;
  }
  if (esEsperaHM(hacia)) {
    return `${hola} tu proceso para "${titulo}" sigue activo: tu perfil está en revisión con el área que abrió la vacante. Te avisaremos del siguiente paso.`;
  }
  return `${hola} tu proceso para "${titulo}" avanzó a la etapa de ${NOMBRE_ETAPA[INFO_ESTADO[hacia].etapa]}. Te contactaremos con el siguiente paso.`;
}

/**
 * Aplica un cambio de estado: re-planifica SLA si cambia la etapa, actualiza vacante y
 * fichas, audita y deja borradores para candidatos (y aviso al HM si queda esperándolo).
 */
async function cambiarEstado(
  db: SupabaseClient,
  actor: Actor,
  vacante: Vacante,
  desde: EstadoProceso,
  hacia: EstadoProceso,
  hoy: string,
  opciones: { motivo: string; excluirCandidatos?: string[]; decisionId?: string | null },
): Promise<ResultadoCambio> {
  const etapaAnterior = vacante.etapa_actual;
  const etapaNueva = hacia === "CANCELADA" ? etapaAnterior : INFO_ESTADO[hacia].etapa;

  if (hacia === "CUBIERTA") {
    await replanificarDesde(vacante, null, db, hoy);
  } else if (etapaNueva !== etapaAnterior) {
    await replanificarDesde(vacante, etapaNueva, db, hoy);
  }

  const estatus: EstatusVacante =
    hacia === "CUBIERTA" ? "cubierta"
    : hacia === "CANCELADA" ? "cancelada"
    : etapaNueva === "requisicion" ? vacante.estatus
    : "en_proceso";
  revisar(
    await db.from("vacantes").update({ etapa_actual: etapaNueva, estatus }).eq("id", vacante.id),
    "actualizar vacante",
  );
  const actualizada: Vacante = { ...vacante, etapa_actual: etapaNueva, estatus };

  const candidatos = revisar<CandidatoEnVacante[]>(
    await db
      .from("candidato_vacante")
      .select("id, candidato_id, estatus, etapa, candidatos(nombre)")
      .eq("vacante_id", vacante.id)
      .in("estatus", ["activo", "finalista", "contratado"]),
    "candidatos de la vacante",
  );
  if (etapaNueva !== etapaAnterior) {
    const enProceso = candidatos.filter((c) => c.estatus !== "contratado").map((c) => c.id);
    if (enProceso.length) {
      revisar(
        await db.from("candidato_vacante").update({ etapa: etapaNueva }).in("id", enProceso),
        "etapa de candidatos",
      );
    }
  }

  await registrarAudit(
    db,
    actor,
    ACCION_CAMBIO_ESTADO,
    "vacantes",
    vacante.id,
    {
      estado_anterior: desde,
      estado_nuevo: hacia,
      etapa_anterior: etapaAnterior,
      etapa_nueva: etapaNueva,
      motivo: opciones.motivo,
    },
    opciones.decisionId ?? null,
  );

  // Cero ghosting: todo candidato vivo en la vacante se entera del cambio.
  const excluir = new Set(opciones.excluirCandidatos ?? []);
  const nuevas: NuevaNotificacion[] = candidatos
    .filter((c) => !excluir.has(c.candidato_id))
    .filter((c) => c.estatus !== "contratado" || hacia === "CUBIERTA")
    .map((c) => ({
      destinatario_tipo: "candidato",
      destinatario_id: c.candidato_id,
      vacante_id: vacante.id,
      tipo: INFO_ESTADO[hacia].terminal ? "resultado" : "cambio_etapa",
      contenido: mensajeCambioEstado(c, vacante.titulo, hacia),
    }));
  if (esEsperaHM(hacia) && vacante.hm_id) {
    nuevas.push({
      destinatario_tipo: "usuario",
      destinatario_id: vacante.hm_id,
      vacante_id: vacante.id,
      tipo: "recordatorio",
      canal: "portal",
      contenido: `Tienes una decisión pendiente en "${vacante.titulo}": ${INFO_ESTADO[hacia].descripcion}`,
    });
  }
  const notificaciones = await crearNotificaciones(db, actor, nuevas);

  await predecirCobertura(actualizada, db, hoy);

  return {
    vacante_id: vacante.id,
    estado_anterior: desde,
    estado_nuevo: hacia,
    etapa_anterior: etapaAnterior,
    etapa_nueva: etapaNueva,
    esperando_hm: esEsperaHM(hacia),
    notificaciones,
  };
}

// ---------------------------------------------------------------------------
// API del orquestador
// ---------------------------------------------------------------------------

export interface AbrirVacanteInput {
  posicion_id: string;
  titulo: string;
  descripcion?: string | null;
  rango_salarial_min?: number | null;
  rango_salarial_max?: number | null;
  hm_id: string;
  hrbp_id: string;
  at_id: string;
  fuente_referidos?: boolean;
  fecha_apertura?: string;
}

/**
 * Crea la vacante (el candado de posición lo refuerza la BD), genera sus vacante_etapas
 * con el motor de SLA y la deja en REQUISICION_EN_CURSO.
 */
export async function abrirVacante(
  input: AbrirVacanteInput,
  ctx: Contexto = {},
): Promise<{ vacante: Vacante; etapas: VacanteEtapa[]; estado: EstadoProceso }> {
  const db = ctx.db ?? createAdminClient();
  const actor = ctx.actor ?? { id: input.hrbp_id, rol: "hrbp" };
  const hoy = ctx.hoy ?? hoyISO();

  // El nivel lo dicta la posición; si no existe, el trigger de la BD rechaza el insert.
  const posicion = revisar<{ nivel: Vacante["nivel"] } | null>(
    await db.from("posiciones").select("nivel").eq("id", input.posicion_id).maybeSingle(),
    "posicion",
  );

  const { data, error } = await db
    .from("vacantes")
    .insert({
      posicion_id: input.posicion_id,
      titulo: input.titulo,
      descripcion: input.descripcion ?? null,
      rango_salarial_min: input.rango_salarial_min ?? null,
      rango_salarial_max: input.rango_salarial_max ?? null,
      nivel: posicion?.nivel ?? "medio",
      hm_id: input.hm_id,
      hrbp_id: input.hrbp_id,
      at_id: input.at_id,
      fuente_referidos: input.fuente_referidos ?? false,
      estatus: "abierta",
      etapa_actual: "requisicion",
      fecha_apertura: input.fecha_apertura ?? hoy,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes("CANDADO_POSICION")) {
      await registrarAudit(db, actor, "candado_posicion_bloqueo", "posiciones", input.posicion_id, {
        titulo: input.titulo,
        motivo: error.message,
      });
      throw new ErrorProceso(
        "CANDADO_POSICION",
        `no se puede abrir la vacante "${input.titulo}": ` +
          error.message.replace(/^CANDADO_POSICION:\s*/, ""),
      );
    }
    throw new Error(`abrir vacante: ${error.message}`);
  }

  const vacante = data as Vacante;
  const etapas = await generarEtapas(vacante, db);
  await registrarAudit(db, actor, "crear_vacante", "vacantes", vacante.id, {
    titulo: vacante.titulo,
    posicion_id: vacante.posicion_id,
    nivel: vacante.nivel,
    posicion_autorizada: true,
  });
  await registrarAudit(db, actor, ACCION_CAMBIO_ESTADO, "vacantes", vacante.id, {
    estado_anterior: null,
    estado_nuevo: "REQUISICION_EN_CURSO",
    etapa_anterior: null,
    etapa_nueva: "requisicion",
    motivo: "apertura de vacante",
  });
  const cobertura = await predecirCobertura(vacante, db, hoy);

  return {
    vacante: { ...vacante, fecha_estimada_cobertura: cobertura?.fecha ?? null },
    etapas,
    estado: "REQUISICION_EN_CURSO",
  };
}

/**
 * Avanza el tramo operativo (AT/HRBP). Si el siguiente paso es una compuerta
 * ESPERANDO_HM_*, la vacante se queda ahí; estando en una compuerta, no se mueve.
 */
export async function avanzarEtapa(vacanteId: string, ctx: Contexto = {}): Promise<ResultadoCambio> {
  const db = ctx.db ?? createAdminClient();
  const actor = ctx.actor ?? { id: null, rol: null };
  const hoy = ctx.hoy ?? hoyISO();

  const vacante = await cargarVacante(db, vacanteId);
  const estado = (await leerEstados(db, [vacante])).get(vacante.id)!;
  const t = transicionDesde(estado, "avanzar");

  if (!t) {
    if (esEsperaHM(estado)) {
      throw new ErrorProceso(
        "ESPERANDO_HM",
        `"${vacante.titulo}" está en ${estado} (${INFO_ESTADO[estado].descripcion}). ` +
          "No avanza sola: requiere decisión del HM con justificación.",
      );
    }
    throw new ErrorProceso("TRANSICION_INVALIDA", `no hay transición 'avanzar' desde ${estado}`);
  }

  if (t.hacia === "CUBIERTA") {
    const finalista = revisar<Pick<CandidatoVacante, "id" | "candidato_id"> | null>(
      await db
        .from("candidato_vacante")
        .select("id, candidato_id")
        .eq("vacante_id", vacante.id)
        .eq("estatus", "finalista")
        .limit(1)
        .maybeSingle(),
      "finalista",
    );
    if (!finalista) {
      throw new ErrorProceso("TRANSICION_INVALIDA", "no se puede cubrir la vacante sin un finalista");
    }
    revisar(
      await db.from("candidato_vacante").update({ estatus: "contratado" }).eq("id", finalista.id),
      "contratar finalista",
    );
    await registrarAudit(db, actor, "candidato_contratado", "candidato_vacante", finalista.id, {
      vacante_id: vacante.id,
      candidato_id: finalista.candidato_id,
    });
  }

  return cambiarEstado(db, actor, vacante, estado, t.hacia, hoy, {
    motivo: `avanzar: ${INFO_ESTADO[estado].descripcion}`,
  });
}

/**
 * El HM resuelve una compuerta ESPERANDO_HM_* a nivel vacante (valida NNN, selecciona
 * perfiles, define pool). La de finalista se resuelve con registrarDecision.
 */
export async function confirmarPasoHM(
  vacanteId: string,
  hmId: string,
  justificacion: string,
  ctx: Contexto = {},
): Promise<ResultadoCambio> {
  const db = ctx.db ?? createAdminClient();
  const actor = ctx.actor ?? { id: hmId, rol: "hm" };
  const hoy = ctx.hoy ?? hoyISO();
  const motivo = exigirJustificacion(justificacion);

  const vacante = await cargarVacante(db, vacanteId);
  if (vacante.hm_id !== hmId) {
    throw new ErrorProceso("NO_AUTORIZADO", "solo el HM de la vacante resuelve sus compuertas");
  }
  const estado = (await leerEstados(db, [vacante])).get(vacante.id)!;
  const t = transicionDesde(estado, "confirmacion_hm");
  if (!t) {
    throw new ErrorProceso(
      "TRANSICION_INVALIDA",
      estado === "ESPERANDO_HM_DECIDE_FINALISTA"
        ? "esta compuerta se resuelve eligiendo finalista con registrarDecision"
        : `no hay compuerta del HM que confirmar en ${estado}`,
    );
  }

  await registrarAudit(db, actor, "confirmacion_hm", "vacantes", vacante.id, {
    compuerta: estado,
    justificacion: motivo,
  });
  return cambiarEstado(db, actor, vacante, estado, t.hacia, hoy, { motivo });
}

export interface ResultadoDecision {
  decision: Decision;
  estatus_candidato: CandidatoVacante["estatus"];
  estado_vacante: EstadoProceso;
  cambio: ResultadoCambio | null;
  sugerencias_solicitadas: boolean;
  notificaciones: Notificacion[];
}

/**
 * Decisión del HM sobre un candidato. Justificación obligatoria. Escribe en decisiones,
 * actualiza candidato_vacante.estatus y mueve la vacante si la decisión cruza la
 * compuerta (finalista/avanzar_oferta → OFERTA_EN_CURSO).
 */
export async function registrarDecision(
  vacanteId: string,
  candidatoId: string,
  hmId: string,
  decision: TipoDecision,
  justificacion: string,
  ctx: Contexto = {},
): Promise<ResultadoDecision> {
  const db = ctx.db ?? createAdminClient();
  const actor = ctx.actor ?? { id: hmId, rol: "hm" };
  const hoy = ctx.hoy ?? hoyISO();

  // --- Validaciones (antes de cualquier escritura) ---
  const motivo = exigirJustificacion(justificacion);
  if (!DECISIONES.includes(decision)) {
    throw new ErrorProceso("TRANSICION_INVALIDA", `decisión desconocida: ${decision}`);
  }
  const vacante = await cargarVacante(db, vacanteId);
  if (vacante.hm_id !== hmId) {
    throw new ErrorProceso("NO_AUTORIZADO", "solo el HM de la vacante toma decisiones sobre sus candidatos");
  }
  const estado = (await leerEstados(db, [vacante])).get(vacante.id)!;
  if (INFO_ESTADO[estado].terminal) {
    throw new ErrorProceso("TRANSICION_INVALIDA", `la vacante está ${estado}`);
  }
  const cv = revisar<CandidatoEnVacante | null>(
    await db
      .from("candidato_vacante")
      .select("id, candidato_id, estatus, etapa, candidatos(nombre)")
      .eq("vacante_id", vacanteId)
      .eq("candidato_id", candidatoId)
      .maybeSingle(),
    "candidato_vacante",
  );
  if (!cv) {
    throw new ErrorProceso("NO_ENCONTRADO", "el candidato no está en el pipeline de esta vacante");
  }
  if (cv.estatus !== "activo" && cv.estatus !== "finalista") {
    throw new ErrorProceso("TRANSICION_INVALIDA", `el candidato ya tiene estatus '${cv.estatus}'`);
  }
  const efecto = EFECTO_DECISION[decision];
  const transicion = efecto.avanzaVacante ? transicionDesde(estado, "decision", decision) : undefined;
  if (efecto.avanzaVacante && !transicion) {
    throw new ErrorProceso(
      "TRANSICION_INVALIDA",
      `'${decision}' solo procede en ESPERANDO_HM_DECIDE_FINALISTA; la vacante está en ${estado}`,
    );
  }

  // --- Escrituras ---
  const d = revisar<Decision>(
    await db
      .from("decisiones")
      .insert({
        vacante_id: vacanteId,
        candidato_id: candidatoId,
        hm_id: hmId,
        decision,
        justificacion: motivo,
      })
      .select()
      .single(),
    "decisiones",
  );

  revisar(
    await db
      .from("candidato_vacante")
      .update({
        estatus: efecto.estatusCandidato,
        ...(transicion ? { etapa: INFO_ESTADO[transicion.hacia].etapa } : {}),
      })
      .eq("id", cv.id),
    "estatus del candidato",
  );

  await registrarAudit(
    db,
    actor,
    `decision_${decision}`,
    "candidato_vacante",
    cv.id,
    {
      vacante_id: vacanteId,
      candidato_id: candidatoId,
      decision,
      justificacion: motivo,
      estatus_anterior: cv.estatus,
      estatus_nuevo: efecto.estatusCandidato,
    },
    d.id,
  );

  const hola = `Hola ${primerNombre(cv)},`;
  const contenido: Record<TipoDecision, string> = {
    finalista: `${hola} ¡buenas noticias! Tu candidatura para "${vacante.titulo}" fue elegida como finalista. Te contactaremos para los detalles de la oferta.`,
    avanzar_oferta: `${hola} ¡buenas noticias! Avanzas a la etapa de oferta para "${vacante.titulo}". Te contactaremos para los detalles.`,
    descartado: `${hola} gracias por tu tiempo en el proceso de "${vacante.titulo}". En esta ocasión no continuaremos con tu candidatura; te avisaremos de otras oportunidades acordes a tu perfil.`,
    pool: `${hola} gracias por participar en el proceso de "${vacante.titulo}". En esta ocasión no continúas, pero tu perfil queda en nuestra cartera de talento para próximas vacantes.`,
    reemparejar: `${hola} gracias por participar en el proceso de "${vacante.titulo}". Creemos que tu perfil encaja mejor en otras vacantes y pronto te compartiremos sugerencias.`,
  };
  const notificaciones = await crearNotificaciones(db, actor, [
    {
      destinatario_tipo: "candidato",
      destinatario_id: candidatoId,
      vacante_id: vacanteId,
      tipo: efecto.notificacion,
      contenido: contenido[decision],
    },
  ]);

  // Reemparejar: la reubicación la hace el sugeridor de vacantes (dominio IA, agente 6),
  // que consume este evento. El orquestador no llama a la IA.
  if (efecto.disparaSugerencias) {
    await registrarAudit(
      db,
      actor,
      "solicitar_sugerencias_vacante",
      "candidatos",
      candidatoId,
      { origen_vacante_id: vacanteId, motivo },
      d.id,
    );
  }

  let cambio: ResultadoCambio | null = null;
  if (transicion) {
    cambio = await cambiarEstado(db, actor, vacante, estado, transicion.hacia, hoy, {
      motivo: `decisión ${decision}: ${motivo}`,
      excluirCandidatos: [candidatoId], // ya recibió su propio aviso
      decisionId: d.id,
    });
  }

  return {
    decision: d,
    estatus_candidato: efecto.estatusCandidato,
    estado_vacante: cambio?.estado_nuevo ?? estado,
    cambio,
    sugerencias_solicitadas: efecto.disparaSugerencias,
    notificaciones: [...notificaciones, ...(cambio?.notificaciones ?? [])],
  };
}
