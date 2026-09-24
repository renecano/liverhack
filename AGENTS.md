# AGENTS.md — LivHire (LiverHack 2026)

> Nombre de trabajo: **LivHire** (provisional). Codex lee este archivo en cada tarea. No inventes arquitectura fuera de lo aquí descrito; si algo falta, pregunta.

## Qué es
Plataforma web **interna** que unifica y le da **proactividad** al proceso de atracción de talento de El Puerto de Liverpool (corporativo y centros de distribución), desde la **requisición hasta la oferta**. No es una app para el candidato de piso; es el copiloto del proceso para tres roles internos:
- **HM (Hiring Manager):** abre la vacante y toma las decisiones. No tiene tiempo de leer expedientes; necesita comparar y decidir en pocos clics.
- **AT (Atracción de Talento / Reclutador):** opera el proceso, carga candidatos y evaluaciones, agenda, comunica.
- **HRBP (HR Business Partner):** socio estratégico; necesita directorio claro y visibilidad de SLA por área.
- **Entrevistador:** califica candidatos (puede haber varios por sesión).

La postulación externa ya la resuelve su ATS actual (**Aira**). Nosotros hacemos el **flujo interno** y podemos complementar/conectar Aira vía MCP.

## Reglas de oro (NO romper)
1. **Humano decide lo irreversible.** La IA nunca rechaza ni hace ofertas sola. El HM decide; **toda decisión lleva justificación obligatoria**.
2. **Cero ghosting.** Cada cambio de etapa genera notificación al candidato: la IA redacta, un humano aprueba, se envía. A los ~300 candidatos se les informa siempre.
3. **Candado de posición.** No se abre proceso si la posición no existe/está autorizada.
4. **Trazabilidad total.** Todo va a `audit_log` (append-only): quién, qué, cuándo, por qué.
5. **Nada de IA sin fuente.** Cada dato extraído o score cita el documento/fragmento de origen.
6. **Evaluación sin discriminación.** El Evaluador es **ciego**: no usa nombre, género, edad ni código postal para calificar competencias. La arquitectura incluye un **`fairness_report`** de equidad.
7. **Lo que NO va (era de otra versión, descartado):** simulación conversacional del puesto, score de "permanencia" por distancia/commute, framing de "embudo/mercado continuo". Si lo ves en algún borrador, ignóralo.

**Añadidos recientes (ya en los docs):** asistente conversacional para el HM ("¿qué tengo que hacer hoy?", por prioridad), semáforo de 3 estados para los no negociables, badge de prioridad para candidatos referidos, y evaluación ciega + fairness report.

## Stack
- **Frontend:** Next.js (App Router) + Tailwind → deploy en **Vercel**.
- **Backend/BD/Auth/Realtime/Storage:** **Supabase** (Postgres + Auth con roles + Realtime para calificación simultánea + Storage para CVs en PDF).
- **IA:** OpenAI API (verificar IDs de modelo vigentes el día 0) + embeddings para matching.
- **Acciones reales (demo):** Google Calendar (agendar entrevistas) + correo (Resend o Gmail API).
- **MCP (P1):** la plataforma se expone como servidor MCP.

## Cómo trabajar (Codex)
- Respeta los contratos de `docs/02-modelo-datos.md` y `docs/04-ia-agentes.md`. No cambies nombres de campos ni firmas sin avisar al equipo.
- Tareas chicas y verificables. Antes de construir una capa, confirma el esquema.
- Sigue las prioridades P0 → P1 → P2 de `docs/06-equipo.md`. Si P0 no corre completo a mitad del tiempo, se congela P1/P2.
- Genera y mantén seed data realista desde el inicio (`docs/07`).

## Índice de docs/
- `00-reto.md` — el reto tal cual lo dio Liverpool (verdad de referencia).
- `01-arquitectura.md` — arquitectura, stack, estructura de repo.
- `02-modelo-datos.md` — esquema Postgres (fuente única de verdad).
- `03-estados-sla.md` — máquina de estados de 6 etapas + motor de SLA + gobernanza.
- `04-ia-agentes.md` — funciones de IA y agentes + contratos (incluye preguntas de entrevista, feedback personalizado y sugerencia de vacantes).
- `05-pantallas.md` — pantallas por rol.
- `06-equipo.md` — división de 5 + plan de tiempo.
- `07-seed-demo-pitch.md` — seed data, guion de demo, pitch y Q&A.
