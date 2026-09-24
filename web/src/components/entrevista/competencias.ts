// Nombres de competencias del scorecard. Las claves se guardan en
// feedback_entrevista.scores (jsonb) sin acentos ni espacios: "resolucion_problemas".

const NOMBRE: Record<string, string> = {
  liderazgo: "Liderazgo",
  comunicacion: "Comunicación",
  conocimiento_tecnico: "Conocimiento técnico",
  resolucion_problemas: "Resolución de problemas",
  orientacion_resultados: "Orientación a resultados",
  gestion_proyectos: "Gestión de proyectos",
  pensamiento_analitico: "Pensamiento analítico",
  aprendizaje: "Aprendizaje",
  sql: "SQL",
  trabajo_equipo: "Trabajo en equipo",
  vision_estrategica: "Visión estratégica",
};

/** Normaliza un texto libre a clave de competencia ("Gestión de Proyectos" → "gestion_de_proyectos"). */
export function clave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function nombreCompetencia(k: string): string {
  if (NOMBRE[k]) return NOMBRE[k];
  const t = k.replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
