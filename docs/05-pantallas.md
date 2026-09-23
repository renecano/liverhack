# 05 · Pantallas por rol

Web responsiva. Auth con roles (Supabase). RLS por rol. El candidato tiene portal mínimo.

## HM (Hiring Manager) — vista estrella
- **Dashboard de mis vacantes:** tarjeta por vacante con **semáforo de etapa**, etapa actual, días restantes, fecha estimada de cobertura y **quién bloquea** si va atrasada.
- **Asistente (chat IA):** widget donde el HM pregunta "¿qué tengo que hacer hoy?" y recibe sus pendientes **ordenados por prioridad** con enlaces a la acción (ver agente 8).
- **Lista/comparativa de candidatos:** tabla con campos clave; seleccionar varios → **comparativa lado a lado** (estructura del Excel: fit, compatibilidad, fortalezas, áreas de oportunidad, estilo de liderazgo, etc.) con desglose y citas.
- **Semáforo de los 3 no negociables** por candidato: verde (cumple) / amarillo (parcial) / rojo (no cumple), con la evidencia.
- **Distintivo de referido:** badge visible de prioridad en los candidatos referidos.
- **Visor de CV en PDF** integrado.
- **Decisión:** botones acotados (Avanzar a oferta / Re-emparejar / Enviar al pool / Finalista / Descartado) **con justificación obligatoria**.

## AT (Reclutamiento) — vista operativa
- **Pipeline** por etapa. **Carga de candidatos** (CV + evaluaciones) → la IA llena ficha, fit, compatibilidad y semáforo de no negociables con citas.
- **Agenda** de entrevistas (multi-entrevistador) → evento real en Calendar (P1).
- **Centro de comunicaciones:** borradores de la IA → **aprobar lote con un clic**.
- **Sugerencias de reubicación** para no seleccionados (referidos priorizados).

## HRBP — vista estratégica
- **Directorio:** por vacante, quién es HM / AT / HRBP.
- **Tablero de SLA por área:** qué va a tiempo / en riesgo / atrasado y **qué área bloquea**.
- **Requisición** con **candado de posición** (solo posiciones autorizadas).
- **fairness_report:** vista de equidad (tasas de avance por grupo, sin PII individual).

## Entrevistador — calificación en tiempo real
- Ficha del candidato + **preguntas sugeridas por IA** (desde el CV).
- **Scorecard** por competencia + veredicto **Recomendado / No recomendado** + notas; varios entrevistadores escriben **simultáneamente** (Realtime).

## Candidato — portal ligero
- **Estatus** del proceso y siguiente paso. **Feedback recibido** (personalizado). Si no fue seleccionado: **vacantes sugeridas**.

## Transversal
- **Centro de alertas/notificaciones** (borrador/aprobada/enviada). Distintivo de referido consistente en todas las listas. Todo consistente con `audit_log`.
