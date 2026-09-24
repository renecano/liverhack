import { INFO_ESTADO, NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import type { ResumenVacante } from "@/lib/orquestador/resumen";
import type { RolUsuario } from "@/lib/supabase/types";

// Orden de prioridad de los pendientes (agente 8). Código puro, sin LLM ni
// server-only: lo usan el asistente Liv (lib/ia/asistente.ts) y el mcp-server.
// Sin `yo` se comporta como antes (vista del HM), que es lo que usa el mcp-server.

export const MAX_ITEMS = 8;

export interface EntradaPrioridad {
  vacantes: ResumenVacante[];
  /** Candidatos por decidir en vacantes en ESPERANDO_HM_DECIDE_FINALISTA, por id de vacante. */
  porDecidir: Record<string, number>;
  /** Avisos a candidatos en borrador, pendientes de aprobar (cero ghosting). */
  borradoresPendientes: number;
  /** Quién pregunta. Decide qué es "tuyo" y a qué pantallas apuntan los enlaces. */
  yo?: { id: string; rol: RolUsuario };
}

export interface Item {
  id: string; // item-1, item-2… (en orden de prioridad)
  prioridad: 1 | 2 | 3 | 4 | 5;
  titulo: string;
  href: string;
  hechos: string;
}

export const ETIQUETA_PRIORIDAD: Record<Item["prioridad"], string> = {
  1: "Atrasada y te espera a ti (bloqueas el proceso)",
  2: "Requiere tu decisión",
  3: "Atrasada: dale seguimiento",
  4: "En riesgo",
  5: "Próxima a vencer",
};
// Para AT/HRBP "tuyo" es lo que tienen en la mano (son el responsable del paso).
const ETIQUETA_OTROS: Record<Item["prioridad"], string> = {
  ...ETIQUETA_PRIORIDAD,
  1: "Atrasada y te toca a ti (bloqueas el proceso)",
  2: "Te toca a ti",
};

// ¿La pelota la tiene quien pregunta? HM: compuertas ESPERANDO_HM_*; AT/HRBP: el
// responsable del estado actual; admin: nada es "suyo" (supervisa).
function esMia(v: ResumenVacante, yo: EntradaPrioridad["yo"]): boolean {
  if (!yo || yo.rol === "hm") return v.esperando_hm;
  if (yo.rol === "admin") return false;
  return v.responsable.id === yo.id;
}

function prioridad(v: ResumenVacante, yo: EntradaPrioridad["yo"]): Item["prioridad"] | null {
  const atrasada = v.semaforo === "atrasada";
  const mia = esMia(v, yo);
  if (atrasada && mia) return 1;
  if (mia) return 2;
  if (atrasada) return 3;
  if (v.semaforo === "en_riesgo") return 4;
  if (v.dias_restantes !== null && v.dias_restantes <= 3) return 5;
  return null;
}

/** Pantalla de una vacante para cada rol. */
export function rutaVacante(id: string, rol: RolUsuario = "hm"): string {
  if (rol === "hm") return `/hm/vacantes/${id}`;
  if (rol === "at") return `/at/candidatos?vacante=${id}`;
  return `/hrbp/candidatos?vacante=${id}`;
}
const RUTA_AVISOS: Record<RolUsuario, string> = { hm: "/hm/notificaciones", at: "/at/comunicaciones", hrbp: "/hrbp", admin: "/hrbp", entrevistador: "/entrevistador" };

/** Hechos de una vacante en una línea (misma redacción para pendientes y consultas). */
export function hechosVacante(v: ResumenVacante): string[] {
  return [
    `estado: ${INFO_ESTADO[v.estado].descripcion}`,
    `etapa: ${NOMBRE_ETAPA[v.etapa_actual]}`,
    v.dias_restantes === null
      ? null
      : v.dias_restantes < 0
        ? `vencida hace ${Math.abs(v.dias_restantes)} días hábiles`
        : `${v.dias_restantes} días hábiles restantes`,
    v.bloquea ? `bloquea: ${v.bloquea.nombre ?? v.bloquea.rol}` : null,
  ].filter((x): x is string => Boolean(x));
}

// Lista ordenada por prioridad, calculada en código a partir del resumen real.
export function priorizar(e: EntradaPrioridad): Item[] {
  const rol = e.yo?.rol ?? "hm";
  const etiquetas = rol === "hm" ? ETIQUETA_PRIORIDAD : ETIQUETA_OTROS;
  const candidatos = e.vacantes
    .map((v) => ({ v, p: prioridad(v, e.yo) }))
    .filter((x): x is { v: ResumenVacante; p: Item["prioridad"] } => x.p !== null)
    .sort((a, b) => a.p - b.p || (a.v.dias_restantes ?? 999) - (b.v.dias_restantes ?? 999));

  const items: Item[] = candidatos.slice(0, MAX_ITEMS).map(({ v, p }, i) => {
    const partes = [
      etiquetas[p],
      ...hechosVacante(v),
      e.porDecidir[v.id] ? `${e.porDecidir[v.id]} candidatos por decidir` : null,
    ].filter(Boolean);
    return { id: `item-${i + 1}`, prioridad: p, titulo: v.titulo, href: rutaVacante(v.id, rol), hechos: partes.join("; ") };
  });

  if (e.borradoresPendientes > 0) {
    // Cero ghosting: los avisos a candidatos esperan aprobación humana.
    const pos = items.findIndex((it) => it.prioridad > 3);
    const aviso: Item = {
      id: "",
      prioridad: 4,
      titulo: "Avisos a candidatos por aprobar",
      href: RUTA_AVISOS[rol],
      hechos: `${e.borradoresPendientes} avisos en borrador en el centro de notificaciones (revisar, personalizar y aprobar)`,
    };
    items.splice(pos === -1 ? items.length : pos, 0, aviso);
  }
  return items.map((it, i) => ({ ...it, id: `item-${i + 1}` }));
}
