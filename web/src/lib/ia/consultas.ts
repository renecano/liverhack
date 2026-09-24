import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CumpleNoNegociable, EstadoNoNegociable, Ficha } from "./schemas";

// Lecturas para la lista y la comparativa (vistas HM/AT). Reciben el cliente de
// SESIÓN (@/lib/supabase/server): RLS decide qué vacantes y candidatos ve cada
// usuario (puede_ver_vacante / puede_ver_candidato). No usan el rol de servicio.

export interface NoNegociableVista {
  id: string;
  texto: string;
  tipo: string;
  estado: EstadoNoNegociable | null;
  evidencia: string | null;
  cita: string | null;
}

export interface FilaCandidato {
  id: string; // candidato_vacante.id
  candidato_id: string;
  vacante_id: string;
  vacante_titulo: string;
  nombre: string;
  fuente: string;
  es_referido: boolean;
  prioridad: number;
  puesto_actual: string | null;
  empresa_actual: string | null;
  escolaridad: string | null;
  compensacion_actual: number | null;
  compensacion_deseada: number | null;
  tiene_cv: boolean;
  etapa: string;
  estatus: string;
  fit_score: number | null;
  compatibilidad_nnn: number | null;
  no_negociables: NoNegociableVista[];
  ficha: Partial<Ficha>;
  evaluaciones: { tipo: string; resumen: string | null }[];
}

type Crudo = {
  id: string;
  candidato_id: string;
  vacante_id: string;
  etapa: string;
  estatus: string;
  fit_score: number | null;
  compatibilidad_nnn: number | null;
  cumple_no_negociables: CumpleNoNegociable[] | null;
  es_referido: boolean;
  prioridad: number;
  ficha: Partial<Ficha> | null;
  candidatos: {
    nombre: string;
    fuente: string;
    puesto_actual: string | null;
    empresa_actual: string | null;
    escolaridad: string | null;
    compensacion_actual: number | string | null;
    compensacion_deseada: number | string | null;
    cv_url: string | null;
    evaluaciones: { tipo: string; resumen: string | null }[];
  };
  vacantes: { titulo: string; no_negociables: { id: string; texto: string; tipo: string }[] };
};

const SELECT = `id, candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn,
  cumple_no_negociables, es_referido, prioridad, ficha,
  candidatos!inner(nombre, fuente, puesto_actual, empresa_actual, escolaridad,
    compensacion_actual, compensacion_deseada, cv_url, evaluaciones(tipo, resumen)),
  vacantes!inner(titulo, no_negociables(id, texto, tipo))`;

const num = (v: number | string | null) => (v === null ? null : Number(v));

function aFila(r: Crudo): FilaCandidato {
  const semaforo = new Map((r.cumple_no_negociables ?? []).map((c) => [c.no_negociable_id, c]));
  const nns = [...r.vacantes.no_negociables].sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: r.id,
    candidato_id: r.candidato_id,
    vacante_id: r.vacante_id,
    vacante_titulo: r.vacantes.titulo,
    nombre: r.candidatos.nombre,
    fuente: r.candidatos.fuente,
    es_referido: r.es_referido,
    prioridad: r.prioridad,
    puesto_actual: r.candidatos.puesto_actual,
    empresa_actual: r.candidatos.empresa_actual,
    escolaridad: r.candidatos.escolaridad,
    compensacion_actual: num(r.candidatos.compensacion_actual),
    compensacion_deseada: num(r.candidatos.compensacion_deseada),
    tiene_cv: Boolean(r.candidatos.cv_url),
    etapa: r.etapa,
    estatus: r.estatus,
    fit_score: r.fit_score,
    compatibilidad_nnn: r.compatibilidad_nnn,
    no_negociables: nns.map((n) => {
      const s = semaforo.get(n.id);
      return { ...n, estado: s?.estado ?? null, evidencia: s?.evidencia ?? null, cita: s?.cita ?? null };
    }),
    ficha: r.ficha ?? {},
    evaluaciones: r.candidatos.evaluaciones ?? [],
  };
}

export async function listarCandidatos(db: SupabaseClient, vacanteId?: string): Promise<FilaCandidato[]> {
  let q = db.from("candidato_vacante").select(SELECT);
  if (vacanteId) q = q.eq("vacante_id", vacanteId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // Referidos primero (prioridad), luego mejor fit.
  return (data as unknown as Crudo[])
    .map(aFila)
    .sort((a, b) => b.prioridad - a.prioridad || (b.fit_score ?? -1) - (a.fit_score ?? -1));
}

export async function obtenerCandidatos(db: SupabaseClient, ids: string[]): Promise<FilaCandidato[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("candidato_vacante").select(SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  const filas = (data as unknown as Crudo[]).map(aFila);
  return ids.map((id) => filas.find((f) => f.id === id)).filter((f): f is FilaCandidato => Boolean(f));
}

export async function listarVacantes(db: SupabaseClient) {
  const { data, error } = await db
    .from("vacantes")
    .select("id, titulo, etapa_actual, estatus")
    .order("fecha_apertura", { ascending: false });
  if (error) throw new Error(error.message);
  return data as { id: string; titulo: string; etapa_actual: string; estatus: string }[];
}
