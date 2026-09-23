// Tipos de fila alineados 1:1 con docs/02-modelo-datos.md y
// supabase/migrations/20260923191654_init_schema.sql. No renombrar campos.
// Las columnas `date` llegan como 'yyyy-MM-dd'; las `timestamptz` como ISO.

export type RolUsuario = "hm" | "at" | "hrbp" | "entrevistador" | "admin";
export type NivelPosicion = "medio" | "alto" | "complejo";
export type EtapaProceso =
  | "requisicion"
  | "alineacion"
  | "busqueda"
  | "atraccion"
  | "seleccion"
  | "oferta";
export type EstatusVacante = "abierta" | "en_proceso" | "cubierta" | "cancelada";
/** Enum estado_proceso (migración 20260923204457): sub-paso del orquestador. */
export type EstadoProceso =
  | "REQUISICION_EN_CURSO"
  | "ESPERANDO_HM_VALIDA_NNN"
  | "ALINEACION_EN_CURSO"
  | "ESPERANDO_HM_SELECCIONA_PERFILES"
  | "BUSQUEDA_EN_CURSO"
  | "ATRACCION_EN_CURSO"
  | "ESPERANDO_HM_DEFINE_POOL"
  | "SELECCION_EN_CURSO"
  | "ESPERANDO_HM_DECIDE_FINALISTA"
  | "OFERTA_EN_CURSO"
  | "CUBIERTA"
  | "CANCELADA";
export type EstatusCandidatoVacante =
  | "activo"
  | "finalista"
  | "descartado"
  | "pool"
  | "contratado";
export type EstatusEtapa = "a_tiempo" | "en_riesgo" | "atrasada" | "completada";
export type TipoDecision =
  | "avanzar_oferta"
  | "reemparejar"
  | "pool"
  | "finalista"
  | "descartado";
export type DestinatarioTipo = "candidato" | "usuario";
export type TipoNotificacion =
  | "cambio_etapa"
  | "recordatorio"
  | "escalacion"
  | "resultado"
  | "reactivacion";
export type CanalNotificacion = "correo" | "portal";
export type EstatusNotificacion = "borrador" | "aprobada" | "enviada";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  area: string | null;
  activo: boolean;
}

export interface Posicion {
  id: string;
  nombre_puesto: string;
  area: string;
  nivel: NivelPosicion;
  autorizada: boolean;
}

export interface Vacante {
  id: string;
  posicion_id: string;
  titulo: string;
  descripcion: string | null;
  rango_salarial_min: number | null;
  rango_salarial_max: number | null;
  nivel: NivelPosicion;
  hm_id: string | null;
  hrbp_id: string | null;
  at_id: string | null;
  estatus: EstatusVacante;
  etapa_actual: EtapaProceso;
  /** Fuente de verdad del estado del orquestador (coherente con etapa_actual por CHECK). */
  estado_proceso: EstadoProceso;
  fecha_apertura: string;
  fecha_estimada_cobertura: string | null;
  alineacion_ok: boolean | null;
  alineacion_notas: string | null;
  fuente_referidos: boolean;
}

export interface CandidatoVacante {
  id: string;
  candidato_id: string;
  vacante_id: string;
  etapa: EtapaProceso;
  estatus: EstatusCandidatoVacante;
  fit_score: number | null;
  compatibilidad_nnn: number | null;
  es_referido: boolean;
  prioridad: number;
}

export interface SlaConfig {
  id: string;
  nivel: NivelPosicion;
  etapa: EtapaProceso;
  dueno_rol: RolUsuario;
  dias_habiles: number;
}

export interface VacanteEtapa {
  id: string;
  vacante_id: string;
  etapa: EtapaProceso;
  dueno_id: string | null;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  fecha_cierre: string | null;
  estatus: EstatusEtapa;
}

export interface Decision {
  id: string;
  vacante_id: string;
  candidato_id: string;
  hm_id: string | null;
  decision: TipoDecision;
  justificacion: string;
  ts: string;
}

export interface Notificacion {
  id: string;
  destinatario_tipo: DestinatarioTipo;
  destinatario_id: string;
  vacante_id: string | null;
  tipo: TipoNotificacion;
  canal: CanalNotificacion;
  contenido: string | null;
  estatus: EstatusNotificacion;
  aprobada_por: string | null;
  ts: string;
}

export interface AuditLog {
  id: string;
  ts: string;
  actor_id: string | null;
  actor_rol: RolUsuario | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, unknown>;
  decision_id: string | null;
}
