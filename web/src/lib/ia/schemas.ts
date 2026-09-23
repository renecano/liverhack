import { z } from "zod";

// Contratos de docs/02 (candidato_vacante) y docs/04 (agente 2).
// Este archivo no es server-only: la UI reutiliza los tipos.

export const EstadoNoNegociable = z.enum(["cumple", "parcial", "no_cumple"]);
export type EstadoNoNegociable = z.infer<typeof EstadoNoNegociable>;

export const Idioma = z.object({ idioma: z.string().min(1), nivel: z.string().min(1) });

// Forma que se guarda en candidato_vacante.cumple_no_negociables (jsonb[]).
export const CumpleNoNegociable = z.object({
  no_negociable_id: z.guid(),
  estado: EstadoNoNegociable,
  evidencia: z.string().min(1),
  cita: z.string().min(1),
});
export type CumpleNoNegociable = z.infer<typeof CumpleNoNegociable>;

// Forma que se guarda en candidato_vacante.ficha (jsonb). Igual a la del seed:
// citas[] es texto "campo · fuente: «fragmento»".
export const Ficha = z.object({
  descripcion: z.string().min(1),
  fortalezas: z.array(z.string().min(1)).min(1),
  areas_oportunidad: z.array(z.string().min(1)).min(1),
  estilo_liderazgo: z.string().min(1),
  vision_estrategica: z.string().min(1),
  analisis_toma_decisiones: z.string().min(1),
  idiomas: z.array(Idioma),
  otros_estudios: z.array(z.string()),
  recomendaciones: z.string().min(1),
  citas: z.array(z.string()).min(1),
});
export type Ficha = z.infer<typeof Ficha>;

// ---------------------------------------------------------------------------
// Salida cruda del LLM. Sin .min/.max en el schema que ve OpenAI (structured
// outputs strict no acepta todas las restricciones); los rangos y la
// consistencia se validan después en validarExtraccion().
// ---------------------------------------------------------------------------
// "Vacante" solo para brechas: la cita es el requisito que no se evidencia.
export const FuenteCita = z.enum(["CV", "Evaluacion", "Vacante"]);

export const SalidaLLM = z.object({
  escolaridad: z.string().nullable(),
  otros_estudios: z.array(z.string()),
  idiomas: z.array(z.object({ idioma: z.string(), nivel: z.string() })),
  descripcion: z.string(),
  fortalezas: z.array(z.string()),
  areas_oportunidad: z.array(z.string()),
  estilo_liderazgo: z.string(),
  vision_estrategica: z.string(),
  analisis_toma_decisiones: z.string(),
  recomendaciones: z.string(),
  fit_score: z.number(),
  fit_justificacion: z.string(),
  cumple_no_negociables: z.array(
    z.object({
      no_negociable_id: z.string(),
      estado: EstadoNoNegociable,
      evidencia: z.string(),
      fuente: FuenteCita,
      fragmento: z.string(),
    }),
  ),
  citas: z.array(
    z.object({
      campo: z.string(),
      fuente: FuenteCita,
      fragmento: z.string(),
    }),
  ),
});
export type SalidaLLM = z.infer<typeof SalidaLLM>;

// Resultado final del extractor, listo para escribir en candidato_vacante.
export const ResultadoExtraccion = z.object({
  ficha: Ficha,
  fit_score: z.number().int().min(0).max(100),
  compatibilidad_nnn: z.number().int().min(0).max(100),
  cumple_no_negociables: z.array(CumpleNoNegociable),
  escolaridad: z.string().nullable(),
});
export type ResultadoExtraccion = z.infer<typeof ResultadoExtraccion>;

// ---------------------------------------------------------------------------
// Agente 3: preguntas de entrevista (docs/04 §3).
// preguntas_entrevista.preguntas = [{pregunta, objetivo, competencia, bandera?, origen}]
// `origen` es una extensión trazable: qué campo de la ficha o qué no negociable
// motivó la pregunta.
// ---------------------------------------------------------------------------
export const TipoEntrevista = z.enum(["competencias", "panel"]); // enum tipo_entrevista de la BD
export type TipoEntrevista = z.infer<typeof TipoEntrevista>;

export const CAMPOS_FICHA_ORIGEN = [
  "descripcion",
  "fortalezas",
  "areas_oportunidad",
  "estilo_liderazgo",
  "vision_estrategica",
  "analisis_toma_decisiones",
  "idiomas",
  "otros_estudios",
  "recomendaciones",
] as const;

export const Bandera = z.enum([
  "no_negociable_parcial",
  "no_negociable_no_cumple",
  "confirmacion_no_negociable", // no negociable ya en "cumple": confirmación breve
  "hueco_cv",
  "area_oportunidad",
]);

export const OrigenPregunta = z.object({
  tipo: z.enum(["no_negociable", "ficha"]),
  // no_negociable → su id; ficha → nombre del campo (CAMPOS_FICHA_ORIGEN)
  referencia: z.string(),
});

export const Pregunta = z.object({
  pregunta: z.string().min(1),
  objetivo: z.string().min(1),
  competencia: z.string().min(1),
  bandera: Bandera.optional(),
  origen: OrigenPregunta,
});
export type Pregunta = z.infer<typeof Pregunta>;

// Lectura de lo guardado: tolera sets del seed o manuales (sin `origen`, bandera libre).
export const PreguntaGuardada = z.object({
  pregunta: z.string(),
  objetivo: z.string().optional(),
  competencia: z.string().optional(),
  bandera: z.string().optional(),
  origen: OrigenPregunta.optional(),
});
export type PreguntaGuardada = z.infer<typeof PreguntaGuardada>;

// Salida cruda del LLM: sin opcionales (structured outputs strict); bandera nullable.
export const SalidaPreguntasLLM = z.object({
  preguntas: z.array(
    z.object({
      pregunta: z.string(),
      objetivo: z.string(),
      competencia: z.string(),
      bandera: Bandera.nullable(),
      origen: OrigenPregunta,
    }),
  ),
});
export type SalidaPreguntasLLM = z.infer<typeof SalidaPreguntasLLM>;

// ---------------------------------------------------------------------------
// Agente 6: sugeridor de vacantes (docs/04 §6).
// sugerencias_vacante = {vacante_id_sugerida, score 0-100, motivo, estatus 'sugerida'}
// ---------------------------------------------------------------------------
export const CAMPOS_PERFIL_MOTIVO = ["escolaridad", ...CAMPOS_FICHA_ORIGEN, "evidencia_no_negociables"] as const;

export const Sugerencia = z.object({
  vacante_id_sugerida: z.guid(),
  vacante_titulo: z.string(),
  score: z.number().int().min(0).max(100),
  motivo: z.string().min(1),
  campo_ficha: z.enum(CAMPOS_PERFIL_MOTIVO),
  estatus: z.literal("sugerida"),
});
export type Sugerencia = z.infer<typeof Sugerencia>;

export const SalidaMotivosLLM = z.object({
  motivos: z.array(
    z.object({
      vacante_id: z.string(),
      motivo: z.string(),
      campo_ficha: z.string(),
    }),
  ),
});
export type SalidaMotivosLLM = z.infer<typeof SalidaMotivosLLM>;

// Verificación de no negociables de las vacantes candidatas (filtro del agente 6).
// Mismo semáforo que el extractor; la única fuente citable es el perfil anonimizado.
export const SalidaVerificacionLLM = z.object({
  vacantes: z.array(
    z.object({
      vacante_id: z.string(),
      cumple_no_negociables: z.array(
        z.object({
          no_negociable_id: z.string(),
          estado: EstadoNoNegociable,
          evidencia: z.string(),
          fuente: z.enum(["Perfil"]),
          fragmento: z.string(),
        }),
      ),
    }),
  ),
});
export type SalidaVerificacionLLM = z.infer<typeof SalidaVerificacionLLM>;
