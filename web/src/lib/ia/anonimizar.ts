import "server-only";
// Evaluación ciega (docs/04 §0): antes de mandar texto al LLM se ocultan
// nombre, género, edad y código postal, más PII no relevante (contacto,
// domicilio, estado civil, identificadores oficiales). Lo que queda es
// experiencia, estudios y evidencia.

export type CategoriaOculta =
  | "nombre"
  | "genero"
  | "edad"
  | "codigo_postal"
  | "domicilio"
  | "contacto"
  | "estado_civil"
  | "identificador";

export interface TextoAnonimizado {
  texto: string;
  // Solo conteos por categoría: el audit_log no debe guardar la PII misma.
  ocultados: Partial<Record<CategoriaOculta, number>>;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MARCAS_DIACRITICAS = new RegExp("[\\u0300-\\u036f]", "g");
const sinAcentos = (s: string) => s.normalize("NFD").replace(MARCAS_DIACRITICAS, "");

// "Lopez" atrapa también "López" (y "Pena" a "Peña"): cada vocal/ñ se vuelve clase.
const CLASES: Record<string, string> = {
  a: "[aáàä]",
  e: "[eéèë]",
  i: "[iíìï]",
  o: "[oóòö]",
  u: "[uúùü]",
  n: "[nñ]",
};
const tolerante = (palabra: string) =>
  [...sinAcentos(palabra)].map((c) => CLASES[c.toLowerCase()] ?? escapar(c)).join("");

function patronNombre(nombre: string): RegExp | null {
  const partes = nombre
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  if (partes.length === 0) return null;
  // Primero el nombre completo para que gane a sus partes.
  const alternativas = [partes.map(tolerante).join("\\s+"), ...partes.map(tolerante)].join("|");
  return new RegExp(`(?<!\\p{L})(?:${alternativas})(?!\\p{L})`, "giu");
}

// Etiquetas explícitas: "Edad: 32", "Sexo: F", "C.P. 03100", etc.
const REGLAS: { categoria: CategoriaOculta; patron: RegExp; reemplazo: string }[] = [
  { categoria: "edad", patron: /\b(?:fecha\s+de\s+nacimiento|f\.\s*nac\.?)\s*[:-]?[^\n]*/gi, reemplazo: "[FECHA DE NACIMIENTO OCULTA]" },
  { categoria: "edad", patron: /\bnacid[oa]\s+(?:el|en)\s+[^\n.;]*/gi, reemplazo: "[NACIMIENTO OCULTO]" },
  { categoria: "edad", patron: /\bedad\s*[:-]?\s*\d{1,2}(?:\s*a[ñn]os)?/gi, reemplazo: "[EDAD OCULTA]" },
  { categoria: "edad", patron: /\b\d{1,2}\s*a[ñn]os\s+de\s+edad\b/gi, reemplazo: "[EDAD OCULTA]" },
  { categoria: "genero", patron: /\b(?:sexo|g[eé]nero)\s*[:-]\s*[^\n,;]*/gi, reemplazo: "[GÉNERO OCULTO]" },
  { categoria: "estado_civil", patron: /\bestado\s+civil\s*[:-]?\s*[^\n,;]*/gi, reemplazo: "[ESTADO CIVIL OCULTO]" },
  { categoria: "codigo_postal", patron: /(?:\bc\.\s?p\.|\bcp\b|\bc[oó]digo\s+postal)\s*[:-]?\s*\d{4,5}\b/gi, reemplazo: "[CP OCULTO]" },
  { categoria: "domicilio", patron: /\b(?:domicilio|direcci[oó]n|calle)\s*[:-][^\n]*/gi, reemplazo: "[DOMICILIO OCULTO]" },
  { categoria: "identificador", patron: /\b(?:curp|rfc|nss|ine)\s*[:-]?\s*[A-Z0-9]{8,18}\b/gi, reemplazo: "[ID OCULTO]" },
  { categoria: "identificador", patron: /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g, reemplazo: "[ID OCULTO]" },
  { categoria: "contacto", patron: /[\w.+-]+@[\w-]+\.[\w.-]+/g, reemplazo: "[EMAIL OCULTO]" },
  { categoria: "contacto", patron: /\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/\S*/gi, reemplazo: "[PERFIL OCULTO]" },
];

export function anonimizar(texto: string, nombre: string): TextoAnonimizado {
  const ocultados: TextoAnonimizado["ocultados"] = {};
  const contar = (c: CategoriaOculta) => {
    ocultados[c] = (ocultados[c] ?? 0) + 1;
  };

  let salida = texto;
  for (const { categoria, patron, reemplazo } of REGLAS) {
    salida = salida.replace(patron, () => {
      contar(categoria);
      return reemplazo;
    });
  }

  // Teléfonos: 10-13 dígitos. Deja pasar rangos de años como "2019-2023".
  salida = salida.replace(/\+?\(?\d[\d\s().-]{8,}\d/g, (m) => {
    const digitos = m.replace(/\D/g, "").length;
    if (digitos < 10 || digitos > 13) return m;
    contar("contacto");
    return "[TELÉFONO OCULTO]";
  });

  const pn = patronNombre(nombre);
  if (pn) {
    salida = salida.replace(pn, () => {
      contar("nombre");
      return "[CANDIDATO]";
    });
  }

  return { texto: salida, ocultados };
}
