// Lectura para el dashboard del HM / tablero SLA: vacante + etapa + semáforos +
// fecha estimada de cobertura + quién bloquea. Solo lee; no escribe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EstatusVacante,
  EtapaProceso,
  NivelPosicion,
  RolUsuario,
  SlaConfig,
  Usuario,
  Vacante,
  VacanteEtapa,
} from "@/lib/supabase/types";
import { hoyISO } from "@/lib/sla/dias-habiles";
import {
  COLOR_SEMAFORO,
  calcularCobertura,
  diasRestantes,
  quienBloquea,
  semaforoEtapa,
  type SemaforoEtapa,
} from "@/lib/sla/motor";
import { ETAPAS, INFO_ESTADO, esEsperaHM, type EstadoProceso } from "./estados";
import { revisar } from "./persistencia";

export interface ResumenEtapa {
  etapa: EtapaProceso;
  semaforo: SemaforoEtapa;
  color: string;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  fecha_cierre: string | null;
  dias_restantes: number | null;
  dueno: { id: string; nombre: string } | null;
}

export interface ResumenVacante {
  id: string;
  titulo: string;
  nivel: NivelPosicion;
  estatus: EstatusVacante;
  etapa_actual: EtapaProceso;
  estado: EstadoProceso;
  esperando_hm: boolean;
  /** Semáforo de la etapa actual. */
  semaforo: SemaforoEtapa;
  color: string;
  /** Días hábiles para la fecha límite de la etapa actual (negativo = vencida). */
  dias_restantes: number | null;
  /** Calculada al vuelo con el motor de SLA. */
  fecha_estimada_cobertura: string | null;
  dias_habiles_para_cobertura: number | null;
  /** Quién tiene la pelota ahora. */
  responsable: { id: string | null; nombre: string | null; rol: RolUsuario | null };
  /** El responsable, solo si la etapa está en riesgo o atrasada. */
  bloquea: { id: string | null; nombre: string | null; rol: RolUsuario | null } | null;
  directorio: { hm: string | null; at: string | null; hrbp: string | null };
  etapas: ResumenEtapa[];
}

export async function resumenVacantes(
  opciones: { db?: SupabaseClient; ids?: string[]; hoy?: string; incluirCerradas?: boolean } = {},
): Promise<ResumenVacante[]> {
  const db = opciones.db ?? createAdminClient();
  const hoy = opciones.hoy ?? hoyISO();

  let q = db.from("vacantes").select("*").order("fecha_apertura", { ascending: true });
  if (opciones.ids) q = q.in("id", opciones.ids);
  if (!opciones.incluirCerradas) q = q.in("estatus", ["abierta", "en_proceso"]);
  const vacantes = revisar<Vacante[]>(await q, "vacantes");
  if (vacantes.length === 0) return [];

  const [etapasRes, slaRes, usuariosRes] = await Promise.all([
    db.from("vacante_etapas").select("*").in("vacante_id", vacantes.map((v) => v.id)),
    db.from("sla_config").select("*"),
    db.from("usuarios").select("id, nombre, rol"),
  ]);
  const etapas = revisar<VacanteEtapa[]>(etapasRes, "vacante_etapas");
  const sla = revisar<SlaConfig[]>(slaRes, "sla_config");
  const usuarios = revisar<Pick<Usuario, "id" | "nombre" | "rol">[]>(usuariosRes, "usuarios");
  const nombre = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? null;

  return vacantes.map((v) => {
    const estado = v.estado_proceso;
    const propias = etapas
      .filter((e) => e.vacante_id === v.id)
      .sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa));
    const actual = propias.find((e) => e.etapa === v.etapa_actual);
    const semaforo: SemaforoEtapa = INFO_ESTADO[estado].terminal
      ? "completada"
      : actual
        ? semaforoEtapa(actual, v.etapa_actual, hoy)
        : "a_tiempo";
    const cobertura = calcularCobertura(v, propias, sla.filter((s) => s.nivel === v.nivel), hoy);
    const r = quienBloquea(v, estado, actual);
    const responsable = { ...r, nombre: nombre(r.id) };

    return {
      id: v.id,
      titulo: v.titulo,
      nivel: v.nivel,
      estatus: v.estatus,
      etapa_actual: v.etapa_actual,
      estado,
      esperando_hm: esEsperaHM(estado),
      semaforo,
      color: COLOR_SEMAFORO[semaforo],
      dias_restantes: actual ? diasRestantes(actual, hoy) : null,
      fecha_estimada_cobertura: cobertura?.fecha ?? null,
      dias_habiles_para_cobertura: cobertura?.dias_habiles_restantes ?? null,
      responsable,
      bloquea: semaforo === "en_riesgo" || semaforo === "atrasada" ? responsable : null,
      directorio: { hm: nombre(v.hm_id), at: nombre(v.at_id), hrbp: nombre(v.hrbp_id) },
      etapas: propias.map((e) => {
        const s = semaforoEtapa(e, v.etapa_actual, hoy);
        const duenoNombre = nombre(e.dueno_id);
        return {
          etapa: e.etapa,
          semaforo: s,
          color: COLOR_SEMAFORO[s],
          fecha_inicio: e.fecha_inicio,
          fecha_limite: e.fecha_limite,
          fecha_cierre: e.fecha_cierre,
          dias_restantes: diasRestantes(e, hoy),
          dueno: e.dueno_id && duenoNombre ? { id: e.dueno_id, nombre: duenoNombre } : null,
        };
      }),
    };
  });
}
