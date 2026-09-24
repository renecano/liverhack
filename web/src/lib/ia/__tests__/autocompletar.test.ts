// Autocompletado de nombres en el chat de Liv (lib/ia/autocompletar.ts).
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aplicarNombre, sugerirNombres } from "../autocompletar";

const nombres = [
  { nombre: "Ana Lopez", vacante: "Gerente de Proyectos E-commerce" },
  { nombre: "Laura Jimenez", vacante: "Gerente de Proyectos E-commerce" },
  { nombre: "Fernanda Morales", vacante: "Gerente de Proyectos E-commerce" },
  { nombre: "Sofia Herrera", vacante: "Analista de Datos Jr." },
];
const nombresDe = (t: string) => sugerirNombres(t, nombres)?.opciones.map((o) => o.nombre) ?? [];

describe("sugerirNombres", () => {
  it("sugiere por nombre o apellido, sin acentos ni mayúsculas", () => {
    assert.deepEqual(nombresDe("¿En qué va fer"), ["Fernanda Morales"]);
    assert.deepEqual(nombresDe("¿En qué va Mora"), ["Fernanda Morales"]);
    assert.deepEqual(nombresDe("¿Cómo va jiménez"), ["Laura Jimenez"]);
  });
  it("usa varias palabras si el nombre va a medias", () => {
    assert.deepEqual(nombresDe("¿Y Ana Lo"), ["Ana Lopez"]);
  });
  it("no sugiere con palabras comunes, fragmentos cortos, signos al final o nombre completo", () => {
    assert.deepEqual(nombresDe("¿En qué va la"), []);
    assert.deepEqual(nombresDe("¿Qué"), []);
    assert.deepEqual(nombresDe("¿Cómo va Sofia?"), []);
    assert.deepEqual(nombresDe("Sofia Herrera"), []);
    assert.deepEqual(nombresDe("¿Cómo va Sofia "), []);
  });
  it("aplicar reemplaza solo el fragmento", () => {
    const t = "¿En qué va fer";
    const s = sugerirNombres(t, nombres)!;
    assert.equal(aplicarNombre(t, s, s.opciones[0]), "¿En qué va Fernanda Morales ");
  });
});
