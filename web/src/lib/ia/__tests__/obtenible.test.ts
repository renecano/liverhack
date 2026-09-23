// Reglas de "obtenible" del sugeridor (lib/ia/obtenible.ts).
// Correr desde web/:  node src/lib/ia/__tests__/correr-pruebas.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clasificarNoNegociable } from "../obtenible";

const CASOS: [texto: string, obtenible: boolean][] = [
  // Siglas que ya son una certificación
  ["PMP vigente", true],
  ["PMP", true],
  ["Certificación ITIL v4", true],
  ["CSM o PSM I", true],
  ["CPA vigente", true],
  // Plataformas o métodos: solo con "vigente" cerca
  ["AWS vigente", true],
  ["Azure Solutions Architect vigente", true],
  ["Scrum vigente (CSM/PSM)", true],
  ["vigente en GCP", true],
  ["Manejo de AWS y Azure", false],
  // Lo sustantivo gana siempre
  ["5+ años con Scrum", false],
  ["Experiencia en Salesforce", false],
  ["Certificación en inglés B2", false],
  ["Licenciatura en Diseño", false],
  ["Liderazgo de squad Scrum", false],
  // Sin coincidencia: conservador
  ["Cédula profesional", false],
];

describe("clasificarNoNegociable", () => {
  for (const [texto, esperado] of CASOS) {
    it(`${esperado ? "obtenible" : "no obtenible"}: ${texto}`, () => {
      assert.equal(clasificarNoNegociable(texto).obtenible, esperado, clasificarNoNegociable(texto).regla);
    });
  }
});
