import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EstatusCandidatoVacante } from "@/lib/supabase/types";
import { normalizar } from "./semaforo";

// Agente 9 de docs/04: fairness_report. Código, no LLM: agrega los resultados de las
// postulaciones (candidato_vacante + decisiones) por grupos NO sensibles y señala
// diferencias. Nunca devuelve datos individuales: ni nombres, ni correos, ni ids.
//
// Unidad de análisis: la postulación (un candidato en una vacante). Resultados:
//   - avanzó:     el HM lo eligió finalista / a oferta (decisión registrada), o hoy es
//                 finalista o contratado. Es la tasa que se compara entre grupos.
//   - finalista:  hoy es finalista o contratado.
//   - descartado: hoy está descartado.
//   - en proceso: activo o en pool (aún sin resultado).
// Señal de posible sesgo: regla de las 4/5 (impacto adverso) sobre la tasa de selección
// = avanzó / postulaciones con resultado (avanzó o descartado); las que siguen en proceso
// no cuentan. Un grupo cuya tasa es < 80 % de la del grupo con mayor tasa, en la misma
// dimensión, se señala. Solo se comparan grupos con al menos MUESTRA_MINIMA resultados.

/** Enum fuente_candidato de la BD (no está en lib/supabase/types.ts). */
export type FuenteCandidato = "bolsa" | "referido" | "aira" | "directo";

export const MUESTRA_MINIMA = 3;
export const UMBRAL_IMPACTO_ADVERSO = 0.8;

export type Dimension = "escolaridad" | "fuente" | "compensacion";

export interface PostulacionAnonima {
  candidato_id: string; // solo para contar personas distintas; no sale del módulo
  estatus: EstatusCandidatoVacante;
  escolaridad: string | null;
  fuente: FuenteCandidato;
  compensacion_deseada: number | null;
  decision_favorable: boolean;
}

export interface Tasas {
  postulaciones: number;
  candidatos: number;
  avanzo: number;
  finalista: number;
  descartado: number;
  en_proceso: number;
  /** Porcentajes 0-100 (redondeados), sobre postulaciones. */
  pct: { avanzo: number; finalista: number; descartado: number; en_proceso: number };
}

export interface Grupo extends Tasas {
  grupo: string;
  muestra_pequena: boolean;
  /** Tasa de avance del grupo / la mayor de la dimensión (solo con muestra suficiente). */
  razon_impacto: number | null;
  posible_sesgo: boolean;
  /** Postulaciones con resultado (avanzó o descartado). */
  resueltas: number;
  /** avanzó / resueltas, 0-100; null sin resultados. */
  tasa_seleccion: number | null;
}

export interface ReporteEquidad {
  total: Tasas;
  dimensiones: { dimension: Dimension; titulo: string; descripcion: string; grupos: Grupo[] }[];
}

// ---------------------------------------------------------------------------
// Agrupadores (texto libre / números → grupo no sensible)
// ---------------------------------------------------------------------------

const ORDEN_ESCOLARIDAD = ["Bachillerato / técnico", "Pasante / en curso", "Licenciatura / ingeniería", "Posgrado", "Sin dato"];

export function nivelEscolaridad(texto: string | null): string {
  const t = normalizar(texto ?? "");
  if (!t.trim()) return "Sin dato";
  if (/\b(pasante|trunc[ao]|en curso|estudiante|cursando)\b/.test(t)) return "Pasante / en curso";
  if (/\b(maestria|mba|doctorado|posgrado|especialidad|phd|msc)\b/.test(t)) return "Posgrado";
  if (/\b(lic|licenciatura|licenciado|ing|ingenieria|ingeniero)\b/.test(t)) return "Licenciatura / ingeniería";
  if (/\b(bachillerato|preparatoria|prepa|tecnico)\b/.test(t)) return "Bachillerato / técnico";
  return "Sin dato";
}

const ORDEN_FUENTE: FuenteCandidato[] = ["bolsa", "referido", "aira", "directo"];
const NOMBRE_FUENTE: Record<FuenteCandidato, string> = { bolsa: "Bolsa de trabajo", referido: "Referido", aira: "AIRA", directo: "Directo" };

const RANGOS_COMPENSACION: { hasta: number; nombre: string }[] = [
  { hasta: 30_000, nombre: "Menos de $30k" },
  { hasta: 60_000, nombre: "$30k a $60k" },
  { hasta: 100_000, nombre: "$60k a $100k" },
  { hasta: Infinity, nombre: "$100k o más" },
];
const ORDEN_COMPENSACION = [...RANGOS_COMPENSACION.map((r) => r.nombre), "Sin dato"];

export function rangoCompensacion(monto: number | null): string {
  if (monto === null || !Number.isFinite(monto) || monto <= 0) return "Sin dato";
  return RANGOS_COMPENSACION.find((r) => monto < r.hasta)!.nombre;
}

// ---------------------------------------------------------------------------
// Cálculo (puro)
// ---------------------------------------------------------------------------

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);
const avanzo = (p: PostulacionAnonima) => p.decision_favorable || p.estatus === "finalista" || p.estatus === "contratado";

function tasas(ps: PostulacionAnonima[]): Tasas {
  const finalista = ps.filter((p) => p.estatus === "finalista" || p.estatus === "contratado").length;
  const descartado = ps.filter((p) => p.estatus === "descartado").length;
  const en_proceso = ps.filter((p) => p.estatus === "activo" || p.estatus === "pool").length;
  const avanzaron = ps.filter(avanzo).length;
  const n = ps.length;
  return {
    postulaciones: n,
    candidatos: new Set(ps.map((p) => p.candidato_id)).size,
    avanzo: avanzaron,
    finalista,
    descartado,
    en_proceso,
    pct: { avanzo: pct(avanzaron, n), finalista: pct(finalista, n), descartado: pct(descartado, n), en_proceso: pct(en_proceso, n) },
  };
}

function agrupar(ps: PostulacionAnonima[], clave: (p: PostulacionAnonima) => string, orden: string[]): Grupo[] {
  const mapa = new Map<string, PostulacionAnonima[]>();
  for (const p of ps) mapa.set(clave(p), [...(mapa.get(clave(p)) ?? []), p]);
  const grupos = [...mapa.entries()]
    .sort(([a], [b]) => orden.indexOf(a) - orden.indexOf(b))
    .map(([grupo, lista]) => {
      const t = tasas(lista);
      const resueltas = lista.filter((p) => avanzo(p) || p.estatus === "descartado").length;
      return {
        grupo,
        ...t,
        muestra_pequena: lista.length < MUESTRA_MINIMA,
        razon_impacto: null as number | null,
        posible_sesgo: false,
        resueltas,
        tasa_seleccion: resueltas ? pct(t.avanzo, resueltas) : null,
      };
    });

  // Regla de las 4/5, solo entre grupos con resultados suficientes (y al menos dos de ellos).
  const comparables = grupos.filter((g) => !g.muestra_pequena && g.resueltas >= MUESTRA_MINIMA);
  const tasa = (g: Grupo) => g.avanzo / g.resueltas;
  const mayor = Math.max(0, ...comparables.map(tasa));
  if (comparables.length >= 2 && mayor > 0) {
    for (const g of comparables) {
      g.razon_impacto = Math.round((tasa(g) / mayor) * 100) / 100;
      g.posible_sesgo = g.razon_impacto < UMBRAL_IMPACTO_ADVERSO;
    }
  }
  return grupos;
}

export function calcularEquidad(ps: PostulacionAnonima[]): ReporteEquidad {
  return {
    total: tasas(ps),
    dimensiones: [
      {
        dimension: "escolaridad",
        titulo: "Escolaridad",
        descripcion: "Nivel máximo de estudios declarado (sin institución).",
        grupos: agrupar(ps, (p) => nivelEscolaridad(p.escolaridad), ORDEN_ESCOLARIDAD),
      },
      {
        dimension: "fuente",
        titulo: "Fuente",
        descripcion: "Canal por el que llegó la candidatura.",
        grupos: agrupar(ps, (p) => NOMBRE_FUENTE[p.fuente] ?? p.fuente, ORDEN_FUENTE.map((f) => NOMBRE_FUENTE[f])),
      },
      {
        dimension: "compensacion",
        titulo: "Compensación deseada",
        descripcion: "Sueldo mensual bruto que pide el candidato (MXN), por rango.",
        grupos: agrupar(ps, (p) => rangoCompensacion(p.compensacion_deseada), ORDEN_COMPENSACION),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Consulta (server). Nunca lanza.
// ---------------------------------------------------------------------------

const FAVORABLES = new Set(["finalista", "avanzar_oferta"]);

export type ResultadoReporteEquidad =
  | { ok: true; reporte: ReporteEquidad; vacantes: { id: string; titulo: string }[] }
  | { ok: false; error: string };

/**
 * Reporte global o de una vacante. Lee con el cliente admin porque agrega sobre todo el
 * proceso; el llamador DEBE haber verificado el rol (hrbp/admin). Solo selecciona columnas
 * no identificativas y devuelve agregados.
 */
export async function reporteEquidad({ vacanteId }: { vacanteId?: string } = {}): Promise<ResultadoReporteEquidad> {
  try {
    const db = createAdminClient();
    // Volumen de un proceso de reclutamiento: se lee todo y se filtra en memoria, así el
    // selector de vacantes no depende del filtro activo.
    const [cv, dec, vac] = await Promise.all([
      db.from("candidato_vacante").select("candidato_id, vacante_id, estatus, candidatos(escolaridad, fuente, compensacion_deseada)"),
      db.from("decisiones").select("candidato_id, vacante_id, decision"),
      db.from("vacantes").select("id, titulo").order("titulo"),
    ]);
    if (cv.error || dec.error || vac.error) return { ok: false, error: "No se pudieron leer los datos del proceso." };

    const favorables = new Set(
      (dec.data ?? []).filter((d) => FAVORABLES.has(d.decision)).map((d) => `${d.candidato_id}:${d.vacante_id}`),
    );
    type Fila = {
      candidato_id: string;
      vacante_id: string;
      estatus: EstatusCandidatoVacante;
      candidatos: { escolaridad: string | null; fuente: FuenteCandidato; compensacion_deseada: number | string | null } | null;
    };
    const filas = (cv.data ?? []) as unknown as Fila[];
    const postulaciones: PostulacionAnonima[] = filas
      .filter((f) => f.candidatos && (!vacanteId || f.vacante_id === vacanteId))
      .map((f) => ({
        candidato_id: f.candidato_id,
        estatus: f.estatus,
        escolaridad: f.candidatos!.escolaridad,
        fuente: f.candidatos!.fuente,
        compensacion_deseada: f.candidatos!.compensacion_deseada === null ? null : Number(f.candidatos!.compensacion_deseada),
        decision_favorable: favorables.has(`${f.candidato_id}:${f.vacante_id}`),
      }));
    const conPostulaciones = new Set(filas.map((f) => f.vacante_id));
    return {
      ok: true,
      reporte: calcularEquidad(postulaciones),
      vacantes: (vac.data ?? []).filter((v) => conPostulaciones.has(v.id)),
    };
  } catch {
    return { ok: false, error: "No se pudo calcular el reporte de equidad." };
  }
}
