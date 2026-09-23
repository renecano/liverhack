/**
 * Punto de entrada del dominio IA para código de otros dominios (orquestador y
 * pantallas de Persona A). Solo servidor.
 *
 * Contrato común de las funciones exportadas aquí:
 *  - **Nunca lanzan.** Toda falla vuelve como `{ ok: false, error, detalle? }`,
 *    incluidas fallas de OpenAI, de la base de datos y de tiempo límite.
 *  - La promesa nunca se rechaza: es seguro llamarlas sin `await`. En serverless
 *    (Vercel), envuélvelas en `after()` de `next/server` para que terminen
 *    después de responder.
 *  - Toda llamada (éxito o falla) deja una entrada en `audit_log` sin datos
 *    personales; `detalle` es corto.
 *
 * @example
 *   import { after } from "next/server";
 *   import { sugerirVacantes } from "@/lib/ia";
 *   // en el evento "reemparejar":
 *   after(() => sugerirVacantes(candidatoId, { vacanteOrigenId, actor }));
 */

export {
  /**
   * Sugiere hasta 3 vacantes abiertas a un candidato no seleccionado (agente 6).
   * Nunca lanza. Tarda ~6-9 s; límite interno 20 s (`error: "timeout"`).
   */
  sugerirVacantes,
  LIMITE_SUGERIR_MS,
  type ResultadoSugerir,
  type SugerenciasOk,
  type ErrorSugerir,
  type OpcionesSugerir,
} from "./sugeridor";

export {
  /**
   * Reescribe con IA el `contenido` de un borrador de notificación ya creado por
   * el orquestador (agente 5). Nunca lanza. Tarda ~4-8 s; límite interno 30 s.
   * Solo toca la fila si sigue en 'borrador'.
   */
  personalizarBorrador,
  LIMITE_PERSONALIZAR_MS,
  type ResultadoPersonalizar,
  type ErrorPersonalizar,
  type OpcionesPersonalizar,
  type ResultadoRedaccion,
  type Tono,
} from "./notificaciones";

export type { Actor } from "./servicio";
export type { Sugerencia } from "./schemas";
