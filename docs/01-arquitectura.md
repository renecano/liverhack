# 01 · Arquitectura

## Principio
La plataforma web (lo que pide el reto) se apoya en una capa de **agentes + IA determinista** que la vuelve **proactiva**. El corazón es un **orquestador (máquina de estados)** que controla las 6 etapas y dispara herramientas de IA; **la IA nunca decide lo irreversible**.

```
[Web HM] [Web AT] [Web HRBP] [Web Entrevistador] [Portal candidato (ligero)]
        \        |          |            |                 /
         \_______|__________|____________|________________/
                         Next.js (Vercel)
                              │  API
                        [ORQUESTADOR]  ── máquina de estados 6 etapas + gobernanza
                     código determinista, sin IA
        ┌──────────────┬───────────┼────────────┬───────────────┐
   [Supabase]     [ia-service]  [sla-engine] [acciones]   [mcp-server]
   Postgres +     agentes LLM   días hábiles  Calendar +   expone la
   Auth/Realtime  (OpenAI)      + semáforos   correo real  plataforma
   + Storage(CV)                                           (P1)
                              │
                        [audit_log]  append-only (dentro de Postgres)
```

## Componentes
- **Web (Next.js/Vercel):** SPAs por rol que consumen la API del orquestador. HM compara candidatos en tabla; entrevistadores califican en tiempo real (Supabase Realtime).
- **Orquestador:** módulo determinista que avanza estados, aplica SLA y gobernanza, y deja el proceso en `ESPERANDO_HUMANO` cuando se requiere decisión del HM. No usa IA.
- **ia-service:** agentes LLM (ver `04-ia-agentes.md`). Alineación de requisición, extracción de CV/evaluaciones, comparativa, generación de preguntas, consolidación de feedback, feedback personalizado, sugerencia de vacantes. Determinista donde importa (temperature 0, salida JSON con schema).
- **sla-engine:** cálculo de días hábiles, semáforos, predicción de fecha de cobertura, disparo de alertas. Código, no IA.
- **acciones:** integración real con Google Calendar (agendar) y correo (Resend/Gmail). Feature flag `ACTIONS_MODE=real|mock` por acción.
- **mcp-server (P1):** expone consultas de la plataforma como herramientas MCP (ej. "¿en qué va mi vacante?"). Puerta a integración con Aira.
- **Supabase:** Postgres (datos + audit_log), Auth con roles, Realtime (feedback simultáneo), Storage (CVs PDF).

## Estructura de repo
```
/AGENTS.md
/docs/                      (este contexto)
/web/                       Next.js (App Router)
  /app/(hm|at|hrbp|entrevistador|candidato)/...
  /components/  /lib/supabase.ts  /lib/api.ts
/supabase/
  /migrations/*.sql         esquema (ver 02-modelo-datos.md)
  /seed/seed.sql            seed data (ver 07)
/orquestador/               estados + gobernanza + sla-engine
/ia-service/                agentes LLM + prompts + schemas de salida
/acciones/                  calendar.ts  email.ts  (ACTIONS_MODE)
/mcp-server/                (P1)
```

## Reglas técnicas
- Roles de Supabase Auth: `hm`, `at`, `hrbp`, `entrevistador`, `admin`. RLS por rol y por vacante.
- Toda mutación relevante escribe en `audit_log`.
- Salidas de IA: JSON validado contra schema; si no valida, se reintenta, no se guarda basura.
- Nada de acciones externas (correo/calendar) sin pasar por la gobernanza del orquestador.
