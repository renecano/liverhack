import type { CumpleNoNegociable, EstadoNoNegociable } from "./schemas";

// Semáforo de no negociables compartido por el extractor (agente 2) y el
// filtro del sugeridor (agente 6): mismas definiciones para el LLM y misma
// validación en código (un registro por id, cita literal en su fuente).

export const REGLAS_SEMAFORO = `- Semáforo por cada no negociable (usa su id exacto, uno por cada id, sin omitir ninguno):
  "cumple" = evidencia clara y suficiente; "parcial" = evidencia incompleta o de menor nivel; "no_cumple" = contradice el requisito o no hay ninguna evidencia.
  Si es "no_cumple" por falta de evidencia, deja "fragmento" vacío.`;

// Normaliza para comparar fragmentos con el texto fuente (acentos, mayúsculas,
// espacios y puntuación no deben invalidar una cita literal).
const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(MARCAS, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function crearVerificadorCitas<F extends string>(fuentes: Record<F, string>) {
  const norm = Object.fromEntries(Object.entries(fuentes).map(([k, v]) => [k, normalizar(v as string)])) as Record<F, string>;
  return (fuente: F, fragmento: string) => {
    const f = normalizar(fragmento);
    return f.length > 0 && (norm[fuente] ?? "").includes(f);
  };
}

export interface ItemSemaforoLLM<F extends string> {
  no_negociable_id: string;
  estado: EstadoNoNegociable;
  evidencia: string;
  fuente: F;
  fragmento: string;
}

// Valida el semáforo crudo del LLM contra los no negociables esperados y
// devuelve la forma de candidato_vacante.cumple_no_negociables, en el orden
// de `noNegociables`.
export function validarSemaforo<F extends string>(
  items: ItemSemaforoLLM<F>[],
  noNegociables: { id: string }[],
  citaExiste: (fuente: F, fragmento: string) => boolean,
): { semaforo: CumpleNoNegociable[]; errores: string[] } {
  const errores: string[] = [];
  const esperados = new Set(noNegociables.map((n) => n.id));
  const vistos = new Set<string>();
  const semaforo: CumpleNoNegociable[] = [];
  for (const r of items) {
    if (!esperados.has(r.no_negociable_id)) {
      errores.push(`no_negociable_id desconocido: ${r.no_negociable_id}`);
      continue;
    }
    if (vistos.has(r.no_negociable_id)) {
      errores.push(`no_negociable_id repetido: ${r.no_negociable_id}`);
      continue;
    }
    vistos.add(r.no_negociable_id);
    const sinEvidencia = r.estado === "no_cumple" && r.fragmento.trim() === "";
    if (!sinEvidencia && !citaExiste(r.fuente, r.fragmento)) {
      errores.push(`La cita del no negociable ${r.no_negociable_id} no aparece literal en ${r.fuente}: "${r.fragmento}"`);
    }
    semaforo.push({
      no_negociable_id: r.no_negociable_id,
      estado: r.estado,
      evidencia: r.evidencia.trim() || "Sin evidencia",
      cita: sinEvidencia ? `${r.fuente}: sin evidencia` : `${r.fuente}: «${r.fragmento.trim()}»`,
    });
  }
  for (const id of esperados) if (!vistos.has(id)) errores.push(`Falta el no negociable ${id}`);
  const orden = noNegociables.map((n) => n.id);
  semaforo.sort((a, b) => orden.indexOf(a.no_negociable_id) - orden.indexOf(b.no_negociable_id));
  return { semaforo, errores };
}
