// Autocompletado de nombres de candidato en el chat de Liv. Código puro (sin
// server-only): lo usa el componente cliente y se prueba en __tests__.

export interface OpcionNombre {
  nombre: string;
  vacante: string;
}

export interface Sugerencia {
  /** Índice donde empieza el fragmento que se reemplaza en el texto. */
  desde: number;
  opciones: OpcionNombre[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Palabras de la pregunta que nunca disparan sugerencias.
const COMUNES = new Set(
  "que cual cuales como cuando donde quien quienes cuanto cuantos cuantas por para con sin los las del una uno unos unas mas muy hoy esta este esto esa ese eso son hay tengo tiene tienen va van candidato candidata candidatos vacante vacantes proceso".split(" "),
);
const MIN_LETRAS = 3;
const MAX_OPCIONES = 5;

/**
 * Sugerencias para lo que se está escribiendo al final del texto: prueba con las
 * últimas 3, 2 y 1 palabras (para "Ana Lo…" o "Morales"). Coincide si alguna palabra
 * del nombre empieza con el fragmento, o el nombre completo empieza con él.
 */
export function sugerirNombres(texto: string, nombres: OpcionNombre[]): Sugerencia | null {
  if (!nombres.length || /\s$/.test(texto)) return null;
  const palabras = [...texto.matchAll(/[\p{L}]+/gu)];
  if (!palabras.length) return null;
  const ultima = palabras[palabras.length - 1];
  // El fragmento debe estar al final (no sugerir si lo último es "?" u otro signo).
  if (ultima.index! + ultima[0].length !== texto.length) return null;

  for (let n = Math.min(3, palabras.length); n >= 1; n--) {
    const primera = palabras[palabras.length - n];
    const desde = primera.index!;
    const fragmento = norm(texto.slice(desde));
    // Si el nombre ya está escrito completo, no hay nada que sugerir.
    if (nombres.some((o) => norm(o.nombre) === fragmento)) return null;
    if (n === 1 && (fragmento.length < MIN_LETRAS || COMUNES.has(fragmento))) continue;
    const opciones = nombres.filter((o) => {
      const nombre = norm(o.nombre);
      if (n > 1) return nombre.startsWith(fragmento);
      return nombre.split(/\s+/).some((p) => p.startsWith(fragmento));
    });
    if (opciones.length) return { desde, opciones: opciones.slice(0, MAX_OPCIONES) };
  }
  return null;
}

/** Aplica una opción: reemplaza el fragmento por el nombre completo y deja un espacio. */
export function aplicarNombre(texto: string, s: Sugerencia, opcion: OpcionNombre): string {
  return `${texto.slice(0, s.desde)}${opcion.nombre} `;
}
