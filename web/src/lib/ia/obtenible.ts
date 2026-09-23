// ¿Un no negociable que el candidato NO cumple se puede obtener después
// (certificación, curso, diplomado) o es sustantivo (años de experiencia,
// liderazgo, nivel de idioma, título)? Reglas en código, no con el LLM, para
// que la decisión sea auditable y estable. Módulo puro, sin dependencias.
//
// Orden: primero lo sustantivo (gana si aparece), luego lo obtenible; si no
// coincide nada, NO es obtenible (criterio conservador: se excluye la vacante).

const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
const normalizar = (s: string) => s.normalize("NFD").replace(MARCAS, "").toLowerCase();

const SUSTANTIVO: { regla: string; patron: RegExp }[] = [
  { regla: "años de experiencia", patron: /\b\d+\s*\+?\s*anos?\b|\banos? de experiencia\b/ },
  { regla: "experiencia", patron: /\bexperiencia\b/ },
  { regla: "liderazgo", patron: /\blider\w*/ },
  { regla: "nivel de idioma", patron: /\b(ingles|frances|aleman|portugues|italiano|idiomas?)\b|\b[abc][12]\b/ },
  { regla: "título / grado académico", patron: /\b(licenciatura|ingenieria|titulo|titulad[oa]|grado|carrera|maestria|doctorado|posgrado)\b/ },
];

const OBTENIBLE: { regla: string; patron: RegExp }[] = [
  { regla: "certificación", patron: /\bcertific\w*|\bcertified\b/ },
  { regla: "curso", patron: /\bcursos?\b/ },
  { regla: "diplomado / diploma", patron: /\bdiplom\w*/ },
  { regla: "acreditación / licencia", patron: /\bacredit\w*|\blicencia\b/ },
];

export function clasificarNoNegociable(texto: string): { obtenible: boolean; regla: string } {
  const t = normalizar(texto);
  const sustantivo = SUSTANTIVO.find((r) => r.patron.test(t));
  if (sustantivo) return { obtenible: false, regla: `sustantivo: ${sustantivo.regla}` };
  const obtenible = OBTENIBLE.find((r) => r.patron.test(t));
  if (obtenible) return { obtenible: true, regla: `obtenible: ${obtenible.regla}` };
  return { obtenible: false, regla: "sin coincidencia (conservador: no obtenible)" };
}
