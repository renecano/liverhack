// Máquina de estados del proceso (código determinista, sin IA).
//
// Dos niveles:
//  - ETAPA  (vacantes.etapa_actual, enum etapa_proceso de docs/02): las 6 etapas del reto.
//  - ESTADO (del orquestador): sub-paso dentro de la etapa. Cada etapa tiene un tramo de
//    trabajo (AT/HRBP) y, en varias, una compuerta ESPERANDO_HM_* donde el HM decide
//    (docs/00: "HM valida no negociables", "HM selecciona perfiles", "HM define candidatos
//    que pasan", "HM elige finalista"). Una compuerta NUNCA se cruza con avanzarEtapa.
//
// El ESTADO vive en vacantes.estado_proceso (enum estado_proceso, migración
// 20260923204457), con un CHECK que lo mantiene coherente con etapa_actual/estatus.
// audit_log registra cada `cambio_estado`, pero no es la fuente de verdad.

import type {
  EstadoProceso,
  EstatusCandidatoVacante,
  EtapaProceso,
  RolUsuario,
  TipoDecision,
  TipoNotificacion,
} from "@/lib/supabase/types";

export const ETAPAS = [
  "requisicion",
  "alineacion",
  "busqueda",
  "atraccion",
  "seleccion",
  "oferta",
] as const satisfies readonly EtapaProceso[];

export const NOMBRE_ETAPA: Record<EtapaProceso, string> = {
  requisicion: "Requisición",
  alineacion: "Alineación",
  busqueda: "Búsqueda",
  atraccion: "Atracción",
  seleccion: "Selección",
  oferta: "Oferta",
};

export const ESTADOS = [
  "REQUISICION_EN_CURSO",
  "ESPERANDO_HM_VALIDA_NNN",
  "ALINEACION_EN_CURSO",
  "ESPERANDO_HM_SELECCIONA_PERFILES",
  "BUSQUEDA_EN_CURSO",
  "ATRACCION_EN_CURSO",
  "ESPERANDO_HM_DEFINE_POOL",
  "SELECCION_EN_CURSO",
  "ESPERANDO_HM_DECIDE_FINALISTA",
  "OFERTA_EN_CURSO",
  "CUBIERTA",
  "CANCELADA",
] as const satisfies readonly EstadoProceso[];

export type { EstadoProceso };

export interface InfoEstado {
  etapa: EtapaProceso;
  /** Quién tiene la pelota en este estado (null = nadie, terminal). */
  responsable: RolUsuario | null;
  /** Compuerta de gobernanza: solo el HM la resuelve. */
  esperaHM: boolean;
  terminal: boolean;
  descripcion: string;
}

export const INFO_ESTADO: Record<EstadoProceso, InfoEstado> = {
  REQUISICION_EN_CURSO: {
    etapa: "requisicion", responsable: "hrbp", esperaHM: false, terminal: false,
    descripcion: "HRBP realiza la requisición: descripción de puesto y rango salarial.",
  },
  ESPERANDO_HM_VALIDA_NNN: {
    etapa: "requisicion", responsable: "hm", esperaHM: true, terminal: false,
    descripcion: "HM valida los no negociables (2 días hábiles).",
  },
  ALINEACION_EN_CURSO: {
    etapa: "alineacion", responsable: "at", esperaHM: false, terminal: false,
    descripcion: "AT cierra perfil y no negociables.",
  },
  ESPERANDO_HM_SELECCIONA_PERFILES: {
    etapa: "alineacion", responsable: "hm", esperaHM: true, terminal: false,
    descripcion: "HM selecciona perfiles de interés y confirma equipo de AT.",
  },
  BUSQUEDA_EN_CURSO: {
    etapa: "busqueda", responsable: "at", esperaHM: false, terminal: false,
    descripcion: "AT busca en bolsas, primer contacto y envío de CVs (pool de 3-5).",
  },
  ATRACCION_EN_CURSO: {
    etapa: "atraccion", responsable: "at", esperaHM: false, terminal: false,
    descripcion: "AT entrevista por competencias, aplica evaluaciones y presenta el pool.",
  },
  ESPERANDO_HM_DEFINE_POOL: {
    etapa: "atraccion", responsable: "hm", esperaHM: true, terminal: false,
    descripcion: "HM define qué candidatos pasan (2 días hábiles).",
  },
  SELECCION_EN_CURSO: {
    etapa: "seleccion", responsable: "at", esperaHM: false, terminal: false,
    descripcion: "AT agenda entrevistas/panel con el pool.",
  },
  ESPERANDO_HM_DECIDE_FINALISTA: {
    etapa: "seleccion", responsable: "hm", esperaHM: true, terminal: false,
    descripcion: "HM entrevista, elige finalista y da feedback (5 días hábiles).",
  },
  OFERTA_EN_CURSO: {
    etapa: "oferta", responsable: "hrbp", esperaHM: false, terminal: false,
    descripcion: "HRBP solicita carta-oferta; AT realiza oferta y confirma fecha de ingreso.",
  },
  CUBIERTA: {
    etapa: "oferta", responsable: null, esperaHM: false, terminal: true,
    descripcion: "Oferta firmada; el candidato ingresa.",
  },
  CANCELADA: {
    etapa: "requisicion", responsable: null, esperaHM: false, terminal: true,
    descripcion: "Proceso cancelado.",
  },
};

/**
 * Qué mueve una transición:
 *  - avanzar:           avanzarEtapa() por quien opera (AT/HRBP). Nunca cruza una compuerta.
 *  - confirmacion_hm:   el HM resuelve una compuerta ESPERANDO_HM_* con justificación.
 *  - decision:          registrarDecision() del HM sobre un candidato (tabla decisiones).
 *  - finalista_declina: plan B — el finalista no firma; el reactivador repropone al HM.
 *  - cancelar:          cierre administrativo.
 */
export type Disparador =
  | "avanzar"
  | "confirmacion_hm"
  | "decision"
  | "finalista_declina"
  | "cancelar";

export interface Transicion {
  desde: EstadoProceso;
  hacia: EstadoProceso;
  disparador: Disparador;
  /** true = no se avanza solo: requiere decisión humana del HM con justificación. */
  requiereDecisionHumana: boolean;
  /** Para disparador 'decision': qué decisiones del HM la ejecutan. */
  decisiones?: TipoDecision[];
}

export const TRANSICIONES: readonly Transicion[] = [
  { desde: "REQUISICION_EN_CURSO", hacia: "ESPERANDO_HM_VALIDA_NNN", disparador: "avanzar", requiereDecisionHumana: false },
  { desde: "ESPERANDO_HM_VALIDA_NNN", hacia: "ALINEACION_EN_CURSO", disparador: "confirmacion_hm", requiereDecisionHumana: true },
  { desde: "ALINEACION_EN_CURSO", hacia: "ESPERANDO_HM_SELECCIONA_PERFILES", disparador: "avanzar", requiereDecisionHumana: false },
  { desde: "ESPERANDO_HM_SELECCIONA_PERFILES", hacia: "BUSQUEDA_EN_CURSO", disparador: "confirmacion_hm", requiereDecisionHumana: true },
  { desde: "BUSQUEDA_EN_CURSO", hacia: "ATRACCION_EN_CURSO", disparador: "avanzar", requiereDecisionHumana: false },
  { desde: "ATRACCION_EN_CURSO", hacia: "ESPERANDO_HM_DEFINE_POOL", disparador: "avanzar", requiereDecisionHumana: false },
  { desde: "ESPERANDO_HM_DEFINE_POOL", hacia: "SELECCION_EN_CURSO", disparador: "confirmacion_hm", requiereDecisionHumana: true },
  { desde: "SELECCION_EN_CURSO", hacia: "ESPERANDO_HM_DECIDE_FINALISTA", disparador: "avanzar", requiereDecisionHumana: false },
  {
    desde: "ESPERANDO_HM_DECIDE_FINALISTA", hacia: "OFERTA_EN_CURSO", disparador: "decision",
    requiereDecisionHumana: true, decisiones: ["finalista", "avanzar_oferta"],
  },
  // Cerrar la oferta la confirma el AT (oferta firmada + fecha de ingreso); exige finalista.
  { desde: "OFERTA_EN_CURSO", hacia: "CUBIERTA", disparador: "avanzar", requiereDecisionHumana: false },
  // Plan B (req. 9): el finalista no firma → vuelve a la compuerta del HM (reactivador, P1).
  { desde: "OFERTA_EN_CURSO", hacia: "ESPERANDO_HM_DECIDE_FINALISTA", disparador: "finalista_declina", requiereDecisionHumana: true },
  ...ESTADOS.filter((e) => !INFO_ESTADO[e].terminal).map(
    (desde): Transicion => ({ desde, hacia: "CANCELADA", disparador: "cancelar", requiereDecisionHumana: true }),
  ),
];

export function transicionDesde(
  estado: EstadoProceso,
  disparador: Disparador,
  decision?: TipoDecision,
): Transicion | undefined {
  return TRANSICIONES.find(
    (t) =>
      t.desde === estado &&
      t.disparador === disparador &&
      (decision === undefined || !t.decisiones || t.decisiones.includes(decision)),
  );
}

export function esEsperaHM(estado: EstadoProceso): boolean {
  return INFO_ESTADO[estado].esperaHM;
}


// ---------------------------------------------------------------------------
// Efecto de cada decisión del HM sobre un candidato (docs/02 tipo_decision).
// ---------------------------------------------------------------------------
export interface EfectoDecision {
  estatusCandidato: EstatusCandidatoVacante;
  notificacion: TipoNotificacion;
  /** Si la vacante está en la compuerta correspondiente, la decisión la mueve. */
  avanzaVacante: boolean;
  /** Pide al sugeridor de vacantes (dominio IA) reubicar al candidato. */
  disparaSugerencias: boolean;
}

export const EFECTO_DECISION: Record<TipoDecision, EfectoDecision> = {
  finalista: { estatusCandidato: "finalista", notificacion: "cambio_etapa", avanzaVacante: true, disparaSugerencias: false },
  avanzar_oferta: { estatusCandidato: "finalista", notificacion: "cambio_etapa", avanzaVacante: true, disparaSugerencias: false },
  descartado: { estatusCandidato: "descartado", notificacion: "resultado", avanzaVacante: false, disparaSugerencias: false },
  pool: { estatusCandidato: "pool", notificacion: "resultado", avanzaVacante: false, disparaSugerencias: false },
  reemparejar: { estatusCandidato: "pool", notificacion: "resultado", avanzaVacante: false, disparaSugerencias: true },
};

export const DECISIONES = Object.keys(EFECTO_DECISION) as TipoDecision[];
