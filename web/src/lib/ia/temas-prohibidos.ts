import "server-only";
// Temas prohibidos en preguntas de entrevista (evaluación sin discriminación,
// regla de oro 6). Se valida sobre texto normalizado (sin acentos, minúsculas).
// Módulo puro, sin dependencias, para poder probarlo aislado.

// Ojo con falsos positivos: "generó" normaliza a "genero", "programación en
// pareja", "familia de productos" o "negociación con el sindicato" (relaciones
// laborales) son preguntas legítimas; por eso los patrones van en frase.
export const TEMAS_PROHIBIDOS: { tema: string; patron: RegExp }[] = [
  { tema: "edad", patron: /\b(edad|cuantos anos tienes?|fecha de nacimiento|(donde|cuando|en que ano) naci(ste|o))\b/ },
  { tema: "estado civil", patron: /\b(estado civil|casad[oa]s?|solter[oa]s?|divorciad[oa]s?|viud[oa]s?|conyuge|espos[oa]s?|(tu|su) pareja|tienes pareja)\b/ },
  { tema: "familia", patron: /\b((tu|su) familia|familiares|vida familiar|hij[oa]s?|embaraz\w*|maternidad|paternidad|planes de tener)\b/ },
  { tema: "religión", patron: /\b(religion\w*|religios[oa]s?|iglesia|creencias religiosas|fe religiosa)\b/ },
  { tema: "salud", patron: /\b((tu|su) salud|estado de salud|enfermedad\w*|padecimiento\w*|discapacidad\w*|medicamentos?|incapacidad medica)\b/ },
  { tema: "género / orientación", patron: /\b((tu|su) (genero|sexo)|orientacion sexual|identidad de genero)\b/ },
  { tema: "origen", patron: /\b(nacionalidad|origen etnico|etnia|raza|de donde eres|lugar de origen)\b/ },
  { tema: "domicilio", patron: /\b(donde vives|domicilio|codigo postal|colonia vives)\b/ },
  { tema: "afiliación política/sindical", patron: /\b(partido politico|afiliacion (politica|sindical)|(perteneces|pertenece) a (algun|un) sindicato)\b/ },
];

const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
const normalizar = (s: string) => s.normalize("NFD").replace(MARCAS, "").toLowerCase();

export function temasProhibidos(texto: string): string[] {
  const t = normalizar(texto);
  return TEMAS_PROHIBIDOS.filter((x) => x.patron.test(t)).map((x) => x.tema);
}
