// Orden de prioridad del asistente del HM (lib/ia/asistente.ts → priorizar).
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ResumenVacante } from "@/lib/orquestador/resumen";
import { priorizar } from "../asistente";

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
