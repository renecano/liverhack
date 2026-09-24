import { INFO_ESTADO, NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import type { ResumenVacante } from "@/lib/orquestador/resumen";

// Orden de prioridad de los pendientes del HM (agente 8). Código puro, sin LLM ni
// server-only: lo usan el asistente del HM (lib/ia/asistente.ts) y el mcp-server.

export const MAX_ITEMS = 8;

export interface EntradaPrioridad {
  vacantes: ResumenVacante[];
  /** Candidatos por decidir en vacantes en ESPERANDO_HM_DECIDE_FINALISTA, por id de vacante. */
  porDecidir: Record<string, number>;
  /** Avisos a candidatos en borrador, pendientes de aprobar (cero ghosting). */
  borradoresPendientes: number;
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

function prioridad(v: ResumenVacante): Item["prioridad"] | null {
  const atrasada = v.semaforo === "atrasada";
  if (atrasada && v.esperando_hm) return 1;
  if (v.esperando_hm) return 2;
  if (atrasada) return 3;
  if (v.semaforo === "en_riesgo") return 4;
  if (v.dias_restantes !== null && v.dias_restantes <= 3) return 5;
  return null;
}

// Lista ordenada por prioridad, calculada en código a partir del resumen real.
export function priorizar(e: EntradaPrioridad): Item[] {
  const candidatos = e.vacantes
    .map((v) => ({ v, p: prioridad(v) }))
    .filter((x): x is { v: ResumenVacante; p: Item["prioridad"] } => x.p !== null)
    .sort((a, b) => a.p - b.p || (a.v.dias_restantes ?? 999) - (b.v.dias_restantes ?? 999));

  const items: Item[] = candidatos.slice(0, MAX_ITEMS).map(({ v, p }, i) => {
    const partes = [
      `${ETIQUETA_PRIORIDAD[p]}`,
      `estado: ${INFO_ESTADO[v.estado].descripcion}`,
      `etapa: ${NOMBRE_ETAPA[v.etapa_actual]}`,
      v.dias_restantes === null
        ? null
        : v.dias_restantes < 0
          ? `vencida hace ${Math.abs(v.dias_restantes)} días hábiles`
          : `${v.dias_restantes} días hábiles restantes`,
      v.bloquea ? `bloquea: ${v.bloquea.nombre ?? v.bloquea.rol}` : null,
      e.porDecidir[v.id] ? `${e.porDecidir[v.id]} candidatos por decidir` : null,
    ].filter(Boolean);
    return { id: `item-${i + 1}`, prioridad: p, titulo: v.titulo, href: `/hm/vacantes/${v.id}`, hechos: partes.join("; ") };
  });

  if (e.borradoresPendientes > 0) {
    // Cero ghosting: los avisos a candidatos esperan aprobación humana.
    const pos = items.findIndex((it) => it.prioridad > 3);
    const aviso: Item = {
      id: "",
      prioridad: 4,
      titulo: "Avisos a candidatos por aprobar",
      href: "/hm",
      hechos: `${e.borradoresPendientes} avisos en borrador en el centro de notificaciones (revisar, personalizar y aprobar)`,
    };
    items.splice(pos === -1 ? items.length : pos, 0, aviso);
  }
  return items.map((it, i) => ({ ...it, id: `item-${i + 1}` }));
}
