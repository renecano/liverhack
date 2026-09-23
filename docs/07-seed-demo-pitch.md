# 07 · Seed data, demo y pitch

## Seed data (ya entregado por el equipo — 10 candidatos reales)
Fuente: `Base_de_Datos_de_Candidatos__10_CVs_.pdf`. Cargar en `supabase/seed/seed.sql` mapeando a `candidatos`, `evaluaciones` (assessfirst), `candidato_vacante` (status_proceso, status_justificacion → `decisiones`), `entrevistas` + `feedback_entrevista`.

Los 10 candidatos (compatibilidad AssessFirst ya incluida):
1. **Ana López** — Gerente Proyectos E-commerce — 92% — **Finalista** — 2 entrevistas ✔.
2. **Carlos Mendoza** — Backend Senior — 88% — **Descartado** (buscaban más liderazgo) — 2 entrevistas ✔.
3. **Sofia Herrera** — Analista de Datos Jr. — 95% — **En Proceso** — 2 entrevistas ✔.
4. Javier Torres — UX/UI Senior — 85% — En Proceso — sin entrevistas.
5. Laura Jimenez — Marketing Digital — 89% — En Proceso.
6. David Peña — Arquitecto Cloud — 91% — **Descartado** (expectativa salarial > presupuesto).
7. Fernanda Morales — Scrum Master — 93% — En Proceso.
8. Ricardo Salas — Frontend — 87% — En Proceso.
9. Mariana Castillo — HRBP — 90% — **Descartado** (candidato interno).
10. Oscar Paredes — Becario QA — 82% — En Proceso.

Candidatos **1, 2 y 3** cumplen el requisito de "3 con historial de múltiples entrevistas y feedback".

Mapeo clave: `assessfirst.{compatibilidad, descripcion, fortalezas, areas_oportunidad, estilo_liderazgo, vision_estrategica, toma_decisiones, recomendaciones}` → `candidato_vacante.ficha`; `entrevistas[]` → `entrevistas` + `feedback_entrevista` (con `veredicto`); `status_justificacion` → `decisiones.justificacion`.

**Completar en el seed (no venía en el PDF):**
- **Usuarios:** HM = Aileen Vargas; entrevistadores = Sofia Rodriguez (Líder Técnico), Carlos Sanchez (Dir. Marketing), Juan Perez (Gerente BI); + 1 AT y 1 HRBP.
- **Posiciones autorizadas** (incluir una NO autorizada para demostrar el candado) y **vacantes** en distintas etapas/niveles, asignando estos candidatos a ellas.
- 1 vacante **atrasada** (semáforo rojo + escalación), 1 en **Selección** con pool listo para comparar, 1 recién creada (para el agente de alineación).
- Marcar 1-2 candidatos como **referido** (badge de prioridad).
- **Notificaciones/alertas** activas (recordatorio, escalación, resultado por aprobar).
- Un descartado (p. ej. **David Peña** o **Carlos Mendoza**) sirve para la demo de **reubicación/reactivación** (sugerir otra vacante y, si un finalista no firma, reactivarlo).

## Guion de demo (~5 min)
1. **Hook (30s):** con 180 vacantes, el HM no sabe en qué va su proceso, el HRBP no tiene visibilidad y de 300 candidatos casi nadie recibe respuesta.
2. **Requisición + candado + alineación (45s):** el HRBP intenta abrir un proceso para una posición no autorizada → bloqueado. Abre una válida; el **agente de alineación** avisa que el rango salarial está bajo para el nivel.
3. **Candidatos + comparativa (60s):** el AT sube CV + evaluación → la IA **llena la ficha y la comparativa lado a lado** con citas y marca no negociables cumplidos.
4. **Entrevista (60s):** dos entrevistadores califican **en tiempo real** la misma sesión; la IA **sugiere preguntas** desde el CV y **consolida el feedback**, marcando un desacuerdo.
5. **Decisión + cero ghosting (45s):** el HM elige finalista **con justificación**; la IA redacta **feedback personalizado** para todos los candidatos; el AT **aprueba el lote** y salen los correos (uno **real**).
6. **Reubicación + reactivación (30s):** a un no seleccionado (p. ej. **Carlos Mendoza**, fuerte pero descartado por liderazgo) se le **sugieren otras vacantes** acordes a su perfil; y si un finalista no firma, el **reactivador** trae a los siguientes mejor evaluados con su historial y les llega un correo real.
7. **Asistente del HM (20s):** el HM abre el chat y pregunta "¿qué tengo que hacer hoy?" → la IA le lista sus pendientes **por prioridad** (lo atrasado, lo que bloquea, lo próximo a vencer). Mismo motor expuesto por MCP para preguntar desde su asistente. "No es un ATS más: es el copiloto del proceso, y se conecta con Aira."

Todo el camino feliz va **pre-cargado y ensayado**, con video de respaldo.

## Pitch (5 min máx.)
- **Problema:** proceso roto en la comunicación HM–AT, sin visibilidad de SLA, sin feedback a candidatos. 180 vacantes, 45 días de time-to-fill.
- **Solución:** plataforma que cumple todo lo pedido (flujo/SLA, directorio, lista y comparativa, entrevistas con feedback, alertas) **y** agrega proactividad: alineación de requisición, comparativa automática con citas, preguntas de entrevista sugeridas, feedback personalizado a todos, sugerencia de vacantes y reactivación.
- **Tecnología:** Next.js/Vercel, Supabase (Postgres, auth por roles, realtime, storage), IA (OpenAI) con gobernanza human-in-the-loop y audit log, MCP para el ecosistema y la conexión con Aira.
- **Impacto para Liverpool:** menos días de cobertura, cero ghosting (mejor marca empleadora), decisiones trazables y justificadas, y un HM que decide en minutos, no leyendo expedientes.

## Preparación de Q&A
| Pregunta probable | Respuesta |
|---|---|
| ¿La IA decide por el HM? | No. La IA asiste (extrae, compara, sugiere); el humano decide lo irreversible, siempre con justificación y auditoría. |
| ¿Se conecta con Aira? | Sí, esa es la idea vía MCP; en el prototipo lo mostramos con datos seed y dejamos la interfaz lista. |
| ¿Cómo evitan sesgo? | Extracción con citas de origen, no negociables explícitos, evaluación ciega a datos demográficos, y todo auditable. |
| ¿Y los 300 candidatos? | Feedback personalizado generado por IA y aprobado por lote: a todos se les informa. |

## Reglas de pitch
- No usar la palabra "hackathon" en materiales.
- Abrir con una persona concreta, no con estadísticas.
- Decir abiertamente qué está sembrado (honestidad técnica = credibilidad).
- Nada de "simulación conversacional" ni "permanencia por distancia": no aplican a este reto.
