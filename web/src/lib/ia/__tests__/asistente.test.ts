// Orden de prioridad del asistente del HM (lib/ia/asistente.ts → priorizar).
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ResumenVacante } from "@/lib/orquestador/resumen";
import { esPreguntaDePendientes, priorizar } from "../asistente";

function vacante(p: Partial<ResumenVacante> & Pick<ResumenVacante, "id" | "titulo">): ResumenVacante {
  return {
    nivel: "medio",
    estatus: "en_proceso",
    etapa_actual: "seleccion",
    estado: "SELECCION_EN_CURSO",
    esperando_hm: false,
    semaforo: "a_tiempo",
    color: "verde",
    dias_restantes: 10,
    fecha_estimada_cobertura: null,
    dias_habiles_para_cobertura: null,
    responsable: { id: null, nombre: null, rol: null },
    bloquea: null,
    directorio: { hm: null, at: null, hrbp: null },
    etapas: [],
    ...p,
  };
}

describe("priorizar (asistente del HM)", () => {
  const vacantes = [
    vacante({ id: "a", titulo: "A tiempo con holgura" }),
    vacante({ id: "b", titulo: "En riesgo", semaforo: "en_riesgo", dias_restantes: 2 }),
    vacante({ id: "c", titulo: "Atrasada de otro", semaforo: "atrasada", dias_restantes: -4, bloquea: { id: "x", nombre: "Daniela Rios", rol: "at" } }),
    vacante({ id: "d", titulo: "Decide finalista", estado: "ESPERANDO_HM_DECIDE_FINALISTA", esperando_hm: true, dias_restantes: 3 }),
    vacante({ id: "e", titulo: "Atrasada y me espera", estado: "ESPERANDO_HM_DEFINE_POOL", esperando_hm: true, semaforo: "atrasada", dias_restantes: -1 }),
    vacante({ id: "f", titulo: "Vence pronto", dias_restantes: 1 }),
  ];
  const items = priorizar({ vacantes, porDecidir: { d: 3 }, borradoresPendientes: 2 });
  const titulos = items.map((i) => i.titulo);

  it("primero lo atrasado que espera al HM, luego sus decisiones, luego lo atrasado de otros", () => {
    assert.deepEqual(titulos.slice(0, 3), ["Atrasada y me espera", "Decide finalista", "Atrasada de otro"]);
  });
  it("los avisos por aprobar van después de lo atrasado y antes de lo que está en riesgo", () => {
    assert.equal(titulos[3], "Avisos a candidatos por aprobar");
    assert.equal(titulos[4], "En riesgo");
  });
  it("lo próximo a vencer va al final; lo que va a tiempo con holgura no aparece", () => {
    assert.equal(titulos.at(-1), "Vence pronto");
    assert.ok(!titulos.includes("A tiempo con holgura"));
  });
  it("ids consecutivos en orden y hechos con quién bloquea y candidatos por decidir", () => {
    assert.deepEqual(items.map((i) => i.id), items.map((_, k) => `item-${k + 1}`));
    assert.match(items.find((i) => i.titulo === "Atrasada de otro")!.hechos, /bloquea: Daniela Rios/);
    assert.match(items.find((i) => i.titulo === "Decide finalista")!.hechos, /3 candidatos por decidir/);
  });
  it("sin pendientes → lista vacía", () => {
    assert.equal(priorizar({ vacantes: [vacantes[0]], porDecidir: {}, borradoresPendientes: 0 }).length, 0);
  });
});

describe("priorizar por rol (Liv para AT/HRBP)", () => {
  const AT = "u-at";
  const vs = [
    vacante({ id: "a", titulo: "Espera al HM", estado: "ESPERANDO_HM_DEFINE_POOL", esperando_hm: true, responsable: { id: "u-hm", nombre: "Aileen", rol: "hm" } }),
    vacante({ id: "b", titulo: "Me toca y atrasada", semaforo: "atrasada", dias_restantes: -2, responsable: { id: AT, nombre: "Daniela", rol: "at" } }),
    vacante({ id: "c", titulo: "Me toca", dias_restantes: 8, responsable: { id: AT, nombre: "Daniela", rol: "at" } }),
  ];
  const items = priorizar({ vacantes: vs, porDecidir: {}, borradoresPendientes: 0, yo: { id: AT, rol: "at" } });
  it("para el AT, lo suyo es lo que tiene en la mano, no las compuertas del HM", () => {
    assert.deepEqual(items.map((i) => i.titulo), ["Me toca y atrasada", "Me toca"]);
    assert.match(items[0].hechos, /te toca a ti/);
  });
  it("los enlaces apuntan a pantallas del rol", () => {
    assert.equal(items[0].href, "/at/candidatos?vacante=b");
  });
  it("sin yo, se comporta como la vista del HM (mcp-server)", () => {
    assert.deepEqual(priorizar({ vacantes: vs, porDecidir: {}, borradoresPendientes: 0 }).map((i) => i.titulo), ["Espera al HM", "Me toca y atrasada"]);
  });
});

describe("esPreguntaDePendientes", () => {
  it("detecta preguntas de prioridades y deja libres las demás", () => {
    for (const q of ["¿Qué tengo que hacer hoy?", "¿Qué es lo más urgente?", "¿Por dónde empiezo?", "mis pendientes"]) assert.ok(esPreguntaDePendientes(q), q);
    for (const q of ["¿Cuál está más atrasada?", "¿Quién bloquea la de Backend?", "¿Cuántas en riesgo?", "¿En qué va Ana López?"]) assert.ok(!esPreguntaDePendientes(q), q);
  });
});
