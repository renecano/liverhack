# 04 · IA y agentes (contratos)

Todos usan OpenAI. **Reglas:** salida JSON validada contra schema; `temperature=0` donde la consistencia importa; **toda afirmación cita su fuente** (documento + fragmento); ningún agente decide lo irreversible ni envía nada sin aprobación humana.

## 0. Evaluación sin discriminación (principio transversal)
- **Evaluador ciego:** al calificar competencias, se le ocultan al LLM el **nombre, género, edad y código postal** (y cualquier PII no relevante). Solo ve experiencia, respuestas y evidencia. Se anonimiza antes de mandar el prompt.
- **fairness_report (agente 9):** reporte de equidad que audita tasas de avance por grupo. La arquitectura lo incluye desde el diseño, no como parche.

## 1. Agente de Alineación (Requisición/Alineación)
Ataca el dolor del HM que pide un "súper candidato" que no existe.
- **Input:** `vacante` (descripción, rango salarial, nivel, no_negociables).
- **Output:** `{ realista: bool, alertas:[{campo, problema, sugerencia}], perfil_sugerido }`. Escribe `alineacion_ok` y `alineacion_notas`. **Sugiere; el HRBP/HM decide.**

## 2. Extractor + Comparador (reemplaza leer PDFs)
- **Input:** `candidato` + `cv_url` (PDF) + `evaluaciones` (AssessFirst/psicométricas) + `vacante.no_negociables`.
- **Output:** llena `candidato_vacante.ficha` (escolaridad, otros_estudios, idiomas, descripcion, fortalezas, areas_oportunidad, estilo_liderazgo, vision_estrategica, analisis_toma_decisiones, recomendaciones), `fit_score` (0-100), `compatibilidad_nnn` (0-100), y **`cumple_no_negociables[]` en semáforo de 3 estados** `{no_negociable_id, estado[cumple|parcial|no_cumple], evidencia, cita}`. Cada campo con `citas[]`.
- Regla: si algún no negociable = `no_cumple`, se marca en rojo y no avanza (el candidato sigue informado y va a sugerencias de vacante).
- Nota seed: los candidatos de prueba ya traen `assessfirst.compatibilidad`; para ellos se usa ese dato; el extractor se demuestra en vivo con una **carga nueva**.

## 3. Generador de preguntas de entrevista
- **Input:** ficha/CV + `vacante.descripcion` + `no_negociables` + tipo de entrevista.
- **Output:** `preguntas_entrevista.preguntas` = `[{pregunta, objetivo, competencia, bandera?}]`, personalizadas al CV (profundizar huecos, validar no negociables, explorar áreas de oportunidad).

## 4. Consolidador de feedback de entrevistas
- **Input:** todos los `feedback_entrevista` de una sesión (varios entrevistadores, en tiempo real).
- **Output:** `{ resumen, promedio_por_competencia, veredicto_agregado, desacuerdos:[{competencia, rango}] }`. Marca discrepancias fuertes. **No decide.**

## 5. Generador de feedback personalizado
- **Input:** decisión + justificación + ficha + veredictos.
- **Output:** borrador de mensaje **personalizado y digno** por candidato (avance o cierre) → `notificaciones(estatus=borrador)`. El reclutador **aprueba el lote con un clic** → se envía. Cubre a los ~300 sin escribir uno por uno.

## 6. Sugeridor de vacantes / reubicación
Cuando un candidato no es seleccionado, se le sugieren otras vacantes acordes a su perfil.
- **Input:** ficha/CV + catálogo de `vacantes` abiertas.
- **Output:** `sugerencias_vacante` = `[{vacante_id, score, motivo}]` por match (embeddings perfil vs descripción + no_negociables). **Los referidos suben de prioridad en el ranking** (incentivo al programa de referidos).

## 7. Reactivador (finalista no firma)
- **Input:** `vacante` cuyo finalista declinó.
- **Output:** trae a los siguientes mejor evaluados con su historial completo (entrevistas + feedback) y los repropone al HM en `ESPERANDO_HM_DECIDE_FINALISTA`. Notifica a los reactivados.

## 8. Asistente del HM (chat) — copiloto conversacional
Chat donde el HM pregunta en lenguaje natural, p. ej. "¿qué tengo que hacer hoy?".
- **Input:** `hm_id` + pregunta. Lee (no inventa): sus vacantes, etapas, estados `ESPERANDO_HM_*`, SLAs en riesgo/atrasados, entrevistas por calificar, decisiones pendientes.
- **Output:** respuesta en lenguaje natural **ordenada por prioridad** (primero lo atrasado y lo que bloquea a otros, luego lo próximo a vencer), con enlaces a la acción. Solo lee y guía; no ejecuta decisiones. Se expone también como herramienta MCP (P2).

## 9. fairness_report (equidad)
- **Input:** `vacante_id` o global.
- **Output:** tasas de avance/descarte por grupo (escolaridad, fuente, etc., **sin exponer PII individual**), señalando posibles sesgos. Vista para HRBP/admin.

## sla-engine y Comunicador
Ver `03-estados-sla.md` (código, no IA): tiempos, semáforos, recordatorios y escalaciones.

## Notas de implementación
- Embeddings (`text-embedding-3-small`) para matching perfil↔vacante (agentes 2 y 6).
- Parseo de texto de CV y del reporte de evaluación antes del LLM.
- Toda salida con efecto (ficha, score, borrador, sugerencia) deja registro en `audit_log`.
- Límite de gasto (`MAX_USD_DIA`) y prompt caching para prompts de sistema y catálogos.
