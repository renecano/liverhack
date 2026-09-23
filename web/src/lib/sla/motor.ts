// sla-engine: plan de etapas en días hábiles, semáforos, predicción de cobertura y
// alertas. Código determinista, sin IA. No envía correos: deja borradores (envío = P1).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EstatusEtapa,
  EtapaProceso,
  NivelPosicion,
  Notificacion,
  RolUsuario,
  SlaConfig,
  Usuario,
  Vacante,
  VacanteEtapa,
} from "@/lib/supabase/types";
import {
  ETAPAS,
  INFO_ESTADO,
  NOMBRE_ETAPA,
  esEsperaHM,
  type EstadoProceso,
} from "@/lib/orquestador/estados";
import {
  ACTOR_SISTEMA,
  crearNotificaciones,
  registrarAudit,
  revisar,
  type NuevaNotificacion,
} from "@/lib/orquestador/persistencia";
import { aISO, diasHabilesEntre, hoyISO, sumarDiasHabiles } from "./dias-habiles";

/** Queda ≤ este número de días hábiles → en_riesgo. */
export const UMBRAL_EN_RIESGO = 1;

export type VacanteSla = Pick<
  Vacante,
  | "id"
  | "nivel"
  | "etapa_actual"
  | "estado_proceso"
  | "estatus"
  | "fecha_apertura"
  | "hm_id"
  | "hrbp_id"
  | "at_id"
>;

export async function leerSlaConfig(
  nivel: NivelPosicion,
  db: SupabaseClient = createAdminClient(),
): Promise<SlaConfig[]> {
  const sla = revisar<SlaConfig[]>(
    await db.from("sla_config").select("*").eq("nivel", nivel),
    "sla_config",
  );
  const faltantes = ETAPAS.filter((e) => !sla.some((s) => s.etapa === e));
  if (faltantes.length) {
    throw new Error(`sla_config incompleto para nivel ${nivel}: falta ${faltantes.join(", ")}`);
  }
  return sla;
}

export function duenoPorRol(vacante: VacanteSla, rol: RolUsuario | null): string | null {
  if (rol === "hm") return vacante.hm_id;
  if (rol === "hrbp") return vacante.hrbp_id;
  if (rol === "at") return vacante.at_id;
  return null;
}

type FilaEtapa = Omit<VacanteEtapa, "id">;

/**
 * Plan (puro) de las etapas desde `desdeEtapa`, encadenadas en días hábiles a partir de
 * `desdeFecha`: cada etapa arranca donde vence la anterior.
 */
export function planificarEtapas(
  vacante: VacanteSla,
  sla: SlaConfig[],
  desdeEtapa: EtapaProceso,
  desdeFecha: string,
): FilaEtapa[] {
  let cursor = desdeFecha;
  return ETAPAS.slice(ETAPAS.indexOf(desdeEtapa)).map((etapa) => {
    const conf = sla.find((s) => s.etapa === etapa)!;
    const inicio = cursor;
    const limite = aISO(sumarDiasHabiles(inicio, conf.dias_habiles));
    cursor = limite;
    return {
      vacante_id: vacante.id,
      etapa,
      dueno_id: duenoPorRol(vacante, conf.dueno_rol),
      fecha_inicio: inicio,
      fecha_limite: limite,
      fecha_cierre: null,
      estatus: "a_tiempo",
    };
  });
}

/** Crea las 6 filas de vacante_etapas con su fecha_limite según sla_config del nivel. */
export async function generarEtapas(
  vacante: VacanteSla,
  db: SupabaseClient = createAdminClient(),
): Promise<VacanteEtapa[]> {
  const sla = await leerSlaConfig(vacante.nivel, db);
  return revisar<VacanteEtapa[]>(
    await db
      .from("vacante_etapas")
      .insert(planificarEtapas(vacante, sla, "requisicion", vacante.fecha_apertura))
      .select(),
    "generar vacante_etapas",
  );
}

/**
 * Al cambiar de etapa: cierra las anteriores abiertas (completada, fecha_cierre = hoy) y
 * re-planifica desde `etapaNueva` a partir de hoy. `etapaNueva` null = cerrar todas.
 */
export async function replanificarDesde(
  vacante: VacanteSla,
  etapaNueva: EtapaProceso | null,
  db: SupabaseClient = createAdminClient(),
  hoy: string = hoyISO(),
): Promise<void> {
  const corte = etapaNueva ? ETAPAS.indexOf(etapaNueva) : ETAPAS.length;
  revisar(
    await db
      .from("vacante_etapas")
      .update({ fecha_cierre: hoy, estatus: "completada" })
      .eq("vacante_id", vacante.id)
      .in("etapa", ETAPAS.slice(0, corte))
      .is("fecha_cierre", null),
    "cerrar etapas",
  );
  if (!etapaNueva) return;
  const sla = await leerSlaConfig(vacante.nivel, db);
  revisar(
    await db
      .from("vacante_etapas")
      .upsert(planificarEtapas(vacante, sla, etapaNueva, hoy), { onConflict: "vacante_id,etapa" }),
    "re-planificar etapas",
  );
}

// ---------------------------------------------------------------------------
// Semáforos
// ---------------------------------------------------------------------------

export type SemaforoEtapa = EstatusEtapa | "pendiente";

export const COLOR_SEMAFORO: Record<SemaforoEtapa, string> = {
  a_tiempo: "verde",
  en_riesgo: "amarillo",
  atrasada: "rojo",
  completada: "gris",
  pendiente: "—",
};

/** Días hábiles que quedan hasta fecha_limite (negativo = vencida). null si no aplica. */
export function diasRestantes(
  etapa: Pick<VacanteEtapa, "fecha_limite" | "fecha_cierre">,
  hoy: string = hoyISO(),
): number | null {
  if (etapa.fecha_cierre || !etapa.fecha_limite) return null;
  return diasHabilesEntre(hoy, etapa.fecha_limite);
}

/** a_tiempo | en_riesgo (queda ≤1 día hábil, incluye "vence hoy") | atrasada (venció) | completada. */
export function estatusEtapa(
  etapa: Pick<VacanteEtapa, "fecha_limite" | "fecha_cierre">,
  hoy: string = hoyISO(),
): EstatusEtapa {
  if (etapa.fecha_cierre) return "completada";
  const restantes = diasRestantes(etapa, hoy);
  if (restantes === null) return "a_tiempo";
  if (restantes < 0) return "atrasada";
  if (restantes <= UMBRAL_EN_RIESGO) return "en_riesgo";
  return "a_tiempo";
}

/** Semáforo para mostrar: las etapas posteriores a la actual aún no arrancan. */
export function semaforoEtapa(
  etapa: Pick<VacanteEtapa, "etapa" | "fecha_limite" | "fecha_cierre">,
  etapaActual: EtapaProceso,
  hoy: string = hoyISO(),
): SemaforoEtapa {
  if (!etapa.fecha_cierre && ETAPAS.indexOf(etapa.etapa) > ETAPAS.indexOf(etapaActual)) {
    return "pendiente";
  }
  return estatusEtapa(etapa, hoy);
}

/**
 * Quién tiene la pelota: en una compuerta ESPERANDO_HM_* es el HM; si no, el dueño de la
 * etapa actual (vacante_etapas.dueno_id, o el rol de sla/estado como respaldo).
 */
export function quienBloquea(
  vacante: VacanteSla,
  estado: EstadoProceso,
  etapaActual: Pick<VacanteEtapa, "dueno_id"> | undefined,
): { id: string | null; rol: RolUsuario | null } {
  const info = INFO_ESTADO[estado];
  if (info.terminal) return { id: null, rol: null };
  if (esEsperaHM(estado)) return { id: vacante.hm_id, rol: "hm" };
  return {
    id: etapaActual?.dueno_id ?? duenoPorRol(vacante, info.responsable),
    rol: info.responsable,
  };
}

// ---------------------------------------------------------------------------
// Predicción de cobertura
// ---------------------------------------------------------------------------

/**
 * Puro: días hábiles restantes = lo que le queda a la etapa actual (0 si ya venció) +
 * la duración SLA completa de las etapas posteriores. Fecha = hoy + ese total.
 */
export function calcularCobertura(
  vacante: VacanteSla,
  etapas: Pick<VacanteEtapa, "etapa" | "fecha_limite" | "fecha_cierre">[],
  sla: SlaConfig[],
  hoy: string = hoyISO(),
): { dias_habiles_restantes: number; fecha: string } | null {
  if (vacante.estatus === "cubierta" || vacante.estatus === "cancelada") return null;
  const idx = ETAPAS.indexOf(vacante.etapa_actual);
  const actual = etapas.find((e) => e.etapa === vacante.etapa_actual);
  const restanteActual =
    actual && actual.fecha_limite && !actual.fecha_cierre
      ? Math.max(0, diasHabilesEntre(hoy, actual.fecha_limite))
      : sla.find((s) => s.etapa === vacante.etapa_actual)!.dias_habiles;
  const posteriores = ETAPAS.slice(idx + 1).reduce(
    (suma, etapa) => suma + sla.find((s) => s.etapa === etapa)!.dias_habiles,
    0,
  );
  const total = restanteActual + posteriores;
  return { dias_habiles_restantes: total, fecha: aISO(sumarDiasHabiles(hoy, total)) };
}

/** Calcula y escribe vacantes.fecha_estimada_cobertura. */
export async function predecirCobertura(
  vacante: VacanteSla,
  db: SupabaseClient = createAdminClient(),
  hoy: string = hoyISO(),
): Promise<{ dias_habiles_restantes: number; fecha: string } | null> {
  const [etapas, sla] = await Promise.all([
    db.from("vacante_etapas").select("*").eq("vacante_id", vacante.id),
    leerSlaConfig(vacante.nivel, db),
  ]);
  const cobertura = calcularCobertura(
    vacante,
    revisar<VacanteEtapa[]>(etapas, "vacante_etapas"),
    sla,
    hoy,
  );
  revisar(
    await db
      .from("vacantes")
      .update({ fecha_estimada_cobertura: cobertura?.fecha ?? null })
      .eq("id", vacante.id),
    "fecha_estimada_cobertura",
  );
  return cobertura;
}

// ---------------------------------------------------------------------------
// Alertas: recordatorios y escalaciones (borrador)
// ---------------------------------------------------------------------------

export interface Alerta {
  vacante_id: string;
  titulo: string;
  etapa: EtapaProceso;
  estatus: "en_riesgo" | "atrasada";
  dias_restantes: number;
  bloquea: { id: string | null; nombre: string | null; rol: RolUsuario | null };
  notificacion: Notificacion | null; // null = ya existía una igual hoy (no se duplica)
}

/**
 * Recorre la etapa actual de cada vacante activa: sincroniza vacante_etapas.estatus y,
 * si está en riesgo → recordatorio a quien bloquea; si está atrasada → escalación
 * (al HRBP, o al HM si quien bloquea es el propio HRBP). Todo en borrador.
 */
export async function detectarAtrasos(
  db: SupabaseClient = createAdminClient(),
  hoy: string = hoyISO(),
): Promise<Alerta[]> {
  const vacantes = revisar<(VacanteSla & Pick<Vacante, "titulo">)[]>(
    await db
      .from("vacantes")
      .select("id, titulo, nivel, etapa_actual, estado_proceso, estatus, fecha_apertura, hm_id, hrbp_id, at_id")
      .in("estatus", ["abierta", "en_proceso"]),
    "vacantes",
  );
  if (vacantes.length === 0) return [];

  const [etapasRes, usuariosRes] = await Promise.all([
    db.from("vacante_etapas").select("*").in("vacante_id", vacantes.map((v) => v.id)),
    db.from("usuarios").select("id, nombre, rol"),
  ]);
  const etapas = revisar<VacanteEtapa[]>(etapasRes, "vacante_etapas");
  const usuarios = revisar<Pick<Usuario, "id" | "nombre" | "rol">[]>(usuariosRes, "usuarios");
  const nombre = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? null;

  const alertas: Alerta[] = [];
  for (const v of vacantes) {
    const actual = etapas.find((e) => e.vacante_id === v.id && e.etapa === v.etapa_actual);
    if (!actual || actual.fecha_cierre) continue;

    const estatus = estatusEtapa(actual, hoy);
    if (estatus !== actual.estatus) {
      revisar(
        await db.from("vacante_etapas").update({ estatus }).eq("id", actual.id),
        "sincronizar estatus de etapa",
      );
    }
    if (estatus !== "en_riesgo" && estatus !== "atrasada") continue;

    const b = quienBloquea(v, v.estado_proceso, actual);
    const bloquea = { ...b, nombre: nombre(b.id) };
    const restantes = diasRestantes(actual, hoy)!;
    const etapaTxt = NOMBRE_ETAPA[v.etapa_actual];
    const quien = `${bloquea.nombre ?? "sin asignar"} (${bloquea.rol ?? "?"})`;

    let nueva: NuevaNotificacion | null = null;
    if (estatus === "en_riesgo" && bloquea.id) {
      nueva = {
        destinatario_tipo: "usuario",
        destinatario_id: bloquea.id,
        vacante_id: v.id,
        tipo: "recordatorio",
        canal: "portal",
        contenido:
          `Recordatorio: la etapa de ${etapaTxt} de "${v.titulo}" vence ` +
          `${restantes === 0 ? "hoy" : `en ${restantes} día hábil`} (${actual.fecha_limite}). ` +
          `Pendiente de: ${quien}.`,
      };
    } else if (estatus === "atrasada") {
      const escalarA = bloquea.rol === "hrbp" ? v.hm_id : v.hrbp_id;
      if (escalarA) {
        nueva = {
          destinatario_tipo: "usuario",
          destinatario_id: escalarA,
          vacante_id: v.id,
          tipo: "escalacion",
          canal: "correo",
          contenido:
            `Escalación: la etapa de ${etapaTxt} de "${v.titulo}" lleva ` +
            `${Math.abs(restantes)} día(s) hábil(es) vencida (límite ${actual.fecha_limite}). ` +
            `Bloquea: ${quien}.`,
        };
      }
    }
    if (!nueva) continue;

    // No duplicar: una alerta del mismo tipo por destinatario y vacante al día.
    const existentes = revisar<{ id: string }[]>(
      await db
        .from("notificaciones")
        .select("id")
        .eq("vacante_id", v.id)
        .eq("destinatario_id", nueva.destinatario_id)
        .eq("tipo", nueva.tipo)
        .gte("ts", hoy),
      "dedupe alertas",
    );
    let notificacion: Notificacion | null = null;
    if (existentes.length === 0) {
      [notificacion] = await crearNotificaciones(db, ACTOR_SISTEMA, [nueva]);
      await registrarAudit(db, ACTOR_SISTEMA, `alerta_sla_${nueva.tipo}`, "vacantes", v.id, {
        etapa: v.etapa_actual,
        estatus,
        dias_restantes: restantes,
        bloquea,
        notificacion_id: notificacion.id,
      });
    }
    alertas.push({
      vacante_id: v.id,
      titulo: v.titulo,
      etapa: v.etapa_actual,
      estatus,
      dias_restantes: restantes,
      bloquea,
      notificacion,
    });
  }
  return alertas;
}
