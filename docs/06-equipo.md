# 06 · División de equipo (2 personas, backend partido en 2) y plan

Equipo de **2**, alcance completo (P0+P1, P2 si da tiempo). El **backend se divide en 2 dominios** y cada persona es dueña de **su dominio backend + las pantallas que lo consumen** (rebanada vertical). Así ninguno se bloquea y no se recorta nada. Codex programa el grueso; Claude revisa en los checkpoints. Día 0: acuerdan esquema (§02) y contratos (§04) **antes de codear**.

## Persona A — Dominio Proceso (flujo, SLA, gobernanza) + sus pantallas
**Backend A (proceso, determinista):**
- Supabase base: schema de §02, auth con roles, RLS, Storage de CVs, `audit_log`, seed data.
- Candado de posición.
- Orquestador: máquina de estados de 6 etapas, gobernanza (`ESPERANDO_HUMANO`), decisiones con justificación.
- sla-engine: días hábiles, semáforos, predicción de fecha de cobertura, alertas/escalación.
- Comunicador (envío) + acciones reales (Calendar/correo, P1).
- fairness_report + MCP server (P2).

**Frontend A (lo que consume el proceso):** dashboard HM con semáforo y "quién bloquea", asistente-chat del HM, directorio y tablero SLA del HRBP, requisición con candado, centro de notificaciones (aprobar lote), botones de decisión con justificación.

**"Hecho" A:** una vacante recorre las 6 etapas con semáforo correcto; candado bloquea posiciones inexistentes; el HM ve sus pendientes por prioridad; correo real sale; decisiones exigen justificación y quedan en audit_log.

## Persona B — Dominio Inteligencia (IA de candidatos) + sus pantallas
**Backend B (IA / ia-service):**
- Extractor + Comparador (ficha, fit, compatibilidad, **semáforo de no negociables**, citas).
- Evaluador ciego + Generador de preguntas + Consolidador de feedback.
- Feedback personalizado (borradores) + Sugeridor de vacantes (**referidos priorizados**).
- Reactivador + Asistente del HM (lógica LLM del chat).

**Frontend B (lo que consume la IA):** lista + **comparativa lado a lado** con visor de CV PDF, semáforo de no negociables y badge de referido; carga de candidatos; pantalla de entrevista con **calificación en tiempo real** (Realtime) y preguntas sugeridas; portal del candidato (feedback + vacantes sugeridas).

**"Hecho" B:** subir CV+evaluación llena la ficha con citas; comparativa de 2+ candidatos con semáforo; 2 entrevistadores califican en vivo con preguntas sugeridas; el chat del HM responde con datos reales.

## Contrato compartido (lo crítico con 2 personas)
- **A entrega el schema (§02) y las firmas del API el día 0**; **B construye contra mocks** sin esperar. La frontera A↔B es la tabla `candidato_vacante` (A escribe estado/etapa; B escribe ficha/fit/compatibilidad) y el `audit_log`.
- Integración temprana y continua; un tablero compartido con las tareas P0.

## Prioridades
- **P0:** auth+roles, candado, modelo de datos, orquestador 6 etapas, SLA+semáforos, lista+comparativa con extracción IA + semáforo NN, entrevistas Realtime con feedback y decisión justificada, notificaciones (cero ghosting), asistente-chat del HM, deploy en Vercel, seed data.
- **P1:** alineación, generador de preguntas, feedback personalizado por lote, sugeridor de vacantes (referidos), reactivador, acciones reales, predicción de cobertura, fairness_report.
- **P2:** MCP server, trazabilidad de referidos avanzada, SLA por área avanzado.

## Plan de tiempo (relativo a T; confirmar hora límite del jueves)
- **0–5% T:** schema + contratos + repo + deploy vacío + seed (los 2).
- **5–45%:** A construye proceso+SLA+pantallas de proceso; B construye IA+pantallas de candidatos, contra mocks. Paralelo.
- **45–60%:** integración end-to-end del flujo Daniela (P0 completo). **Checkpoint: si P0 no corre, se congela P1/P2.**
- **60–80%:** P1.
- **80–90%:** P2 si hay estabilidad; grabar video de respaldo.
- **90–100%:** freeze; ensayo y pitch.

## Revisiones con Claude
1. Al cerrar schema y contratos. 2. Al integrar end-to-end. 3. Antes del freeze.
