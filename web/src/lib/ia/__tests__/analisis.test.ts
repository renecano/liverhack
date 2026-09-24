// Análisis de Liv para el AT (lib/ia/analisis.ts): consejo con evidencia literal, sin decidir.
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conNombres, validar, type Contexto } from "../analisis";

const ctx = [
  { ref: "A", c: { nombre: "Ana Lopez" }, datos: "Fortalezas: Coordinacion multiarea; Comunicacion ejecutiva\nCompatibilidad (Potencial Global): 92", cobertura: { cumple: 3, parcial: 0, no_cumple: 0, total: 3 } },
  { ref: "B", c: { nombre: "Laura Jimenez" }, datos: "Áreas de oportunidad: Gestion de proveedores tecnologicos\nCompatibilidad (Potencial Global): 89", cobertura: { cumple: 2, parcial: 1, no_cumple: 0, total: 3 } },
] as unknown as Contexto[];

const punto = (texto: string, evidencia: string, fuente = "ficha" as const) => ({ texto, evidencia, fuente });
const base = {
  resumen: "Candidato A destaca en coordinación; Candidato B tiene un área por validar en proveedores.",
  no_negociables: "Candidato A cubre los tres no negociables.",
  candidatos: [
    { ref: "A", fortalezas: [punto("Coordina varias áreas.", "Coordinacion multiarea")], riesgos: [punto("Validar comunicación.", "Comunicacion ejecutiva")] },
    { ref: "B", fortalezas: [punto("Compatibilidad alta.", "Potencial Global): 89", "compatibilidad" as never)], riesgos: [punto("Proveedores.", "Gestion de proveedores tecnologicos")] },
  ],
};

describe("validar (análisis de Liv)", () => {
  it("acepta un análisis con evidencia literal de cada candidato", () => {
    assert.equal(validar(base, ctx).ok, true);
  });
  it("rechaza evidencia que no está en los datos de ese candidato", () => {
    const x = structuredClone(base);
    x.candidatos[0].fortalezas[0].evidencia = "Gestion de proveedores tecnologicos"; // es de B, no de A
    const r = validar(x, ctx);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.errores.join(" "), /no aparece literal/);
  });
  it("rechaza lenguaje de decisión y cifras inventadas", () => {
    const x = structuredClone(base);
    x.resumen = "Contrata a Candidato A: tiene 97 de compatibilidad.";
    const r = validar(x, ctx);
    assert.equal(r.ok, false);
    const e = r.ok ? "" : r.errores.join(" ");
    assert.match(e, /lenguaje de decisión/);
    assert.match(e, /97/);
  });
  it("exige nombrar a cada candidato por separado", () => {
    const x = structuredClone(base);
    x.no_negociables = "Los Candidatos A y B cubren lo principal.";
    assert.equal(validar(x, ctx).ok, false);
    x.no_negociables = "Candidato A y B tienen pendiente el inglés.";
    assert.equal(validar(x, ctx).ok, false);
    x.no_negociables = "Candidato A y Candidato B tienen pendiente el inglés.";
    assert.equal(validar(x, ctx).ok, true);
  });
  it("exige incluir a todos los candidatos", () => {
    const x = structuredClone(base);
    x.candidatos = [x.candidatos[0]];
    assert.equal(validar(x, ctx).ok, false);
  });
});

describe("conNombres", () => {
  const refs = [{ ref: "A", nombre: "Ana Lopez" }];
  it("repone el nombre y absorbe el artículo", () => {
    assert.equal(conNombres("El Candidato A destaca.", refs), "Ana Lopez destaca.");
    assert.equal(conNombres("La fortaleza del candidato A es clara.", refs), "La fortaleza de Ana Lopez es clara.");
    assert.equal(conNombres("Le falta al Candidato A validar inglés.", refs), "Le falta a Ana Lopez validar inglés.");
    assert.equal(conNombres("Candidata A cumple.", refs), "Ana Lopez cumple.");
  });
});
