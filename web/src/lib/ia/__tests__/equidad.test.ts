// Reporte de equidad (lib/ia/equidad.ts → calcularEquidad, agrupadores).
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularEquidad, nivelEscolaridad, rangoCompensacion, type PostulacionAnonima } from "../equidad";

let k = 0;
function p(x: Partial<PostulacionAnonima>): PostulacionAnonima {
  return { candidato_id: `c${++k}`, estatus: "activo", escolaridad: "Lic. en Derecho", fuente: "bolsa", compensacion_deseada: 50_000, decision_favorable: false, ...x };
}

describe("agrupadores", () => {
  it("escolaridad por nivel, sin institución", () => {
    assert.equal(nivelEscolaridad("Ing. en Sistemas Computacionales (UNAM)"), "Licenciatura / ingeniería");
    assert.equal(nivelEscolaridad("Lic. en Informatica (UPIICSA) + PSM II"), "Licenciatura / ingeniería");
    assert.equal(nivelEscolaridad("Pasante de Ing. en Software (UNAM)"), "Pasante / en curso");
    assert.equal(nivelEscolaridad("Maestría en Finanzas (ITAM)"), "Posgrado");
    assert.equal(nivelEscolaridad(null), "Sin dato");
  });
  it("compensación por rango", () => {
    assert.equal(rangoCompensacion(14_000), "Menos de $30k");
    assert.equal(rangoCompensacion(30_000), "$30k a $60k");
    assert.equal(rangoCompensacion(145_000), "$100k o más");
    assert.equal(rangoCompensacion(null), "Sin dato");
  });
});

describe("calcularEquidad", () => {
  // Bolsa: 4 postulaciones, 3 con resultado, 1 avanza (selección 33 %). Referido: 3 de 3 (100 %).
  // AIRA: 1 (muestra pequeña).
  const ps = [
    p({ fuente: "bolsa", estatus: "finalista" }),
    p({ fuente: "bolsa", estatus: "descartado" }),
    p({ fuente: "bolsa", estatus: "descartado" }),
    p({ fuente: "bolsa" }),
    p({ fuente: "referido", decision_favorable: true }),
    p({ fuente: "referido", estatus: "contratado" }),
    p({ fuente: "referido", estatus: "finalista" }),
    p({ fuente: "aira", estatus: "descartado" }),
  ];
  const reporte = calcularEquidad(ps);
  const fuente = reporte.dimensiones.find((d) => d.dimension === "fuente")!.grupos;
  const g = (nombre: string) => fuente.find((x) => x.grupo === nombre)!;

  it("tasas por grupo sobre postulaciones", () => {
    assert.deepEqual(g("Bolsa de trabajo").pct, { avanzo: 25, finalista: 25, descartado: 50, en_proceso: 25 });
    assert.equal(g("Referido").pct.avanzo, 100);
    assert.equal(reporte.total.postulaciones, 8);
  });
  it("regla de las 4/5: marca al grupo que avanza < 80 % del mayor", () => {
    assert.equal(g("Bolsa de trabajo").tasa_seleccion, 33);
    assert.equal(g("Bolsa de trabajo").razon_impacto, 0.33);
    assert.equal(g("Bolsa de trabajo").posible_sesgo, true);
    assert.equal(g("Referido").posible_sesgo, false);
  });
  it("muestra pequeña (< 3) se marca y no entra en la comparación", () => {
    assert.equal(g("AIRA").muestra_pequena, true);
    assert.equal(g("AIRA").razon_impacto, null);
    assert.equal(g("AIRA").posible_sesgo, false);
  });
  it("sin comparación si solo un grupo tiene muestra suficiente", () => {
    const solo = calcularEquidad([p({}), p({}), p({}), p({ fuente: "aira" })]).dimensiones.find((d) => d.dimension === "fuente")!.grupos;
    assert.ok(solo.every((x) => x.razon_impacto === null && !x.posible_sesgo));
  });
  it("lo que sigue en proceso no cuenta: sin resultados suficientes no se compara ni se señala", () => {
    const enProceso = [p({}), p({}), p({}), p({}), p({ fuente: "referido", estatus: "finalista" }), p({ fuente: "referido", estatus: "finalista" }), p({ fuente: "referido", estatus: "descartado" })];
    const grupos = calcularEquidad(enProceso).dimensiones.find((d) => d.dimension === "fuente")!.grupos;
    const bolsa = grupos.find((x) => x.grupo === "Bolsa de trabajo")!;
    assert.equal(bolsa.resueltas, 0);
    assert.equal(bolsa.tasa_seleccion, null);
    assert.ok(grupos.every((x) => !x.posible_sesgo));
  });
  it("la salida no incluye ids de candidatos ni texto libre", () => {
    const json = JSON.stringify(reporte);
    assert.ok(!/"c\d+"/.test(json));
    assert.ok(!json.includes("candidato_id"));
    assert.ok(!json.includes("Derecho"));
  });
});
