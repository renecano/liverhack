# LivHire — Copiloto de Atracción de Talento
### LiverHack 2026 · El Puerto de Liverpool

> Nombre de trabajo: **LivHire**.

## Propósito

LivHire es una plataforma web **interna** que unifica y da proactividad al proceso de
atracción de talento de El Puerto de Liverpool (corporativo y centros de distribución),
desde la **requisición hasta la oferta**. No es una app para el candidato de piso ni
reemplaza el ATS externo (**Aira**), que ya resuelve la postulación: LivHire es el
**copiloto del proceso interno** para tres roles:

- **HM (Hiring Manager):** abre la vacante y decide. No tiene tiempo de leer expedientes;
  necesita comparar y decidir en pocos clics.
- **AT (Atracción de Talento / Reclutador):** opera el proceso, carga candidatos y
  evaluaciones, agenda, comunica.
- **HRBP (HR Business Partner):** socio estratégico; necesita directorio y visibilidad de
  SLA por área.
- **Entrevistador:** califica candidatos (puede haber varios por sesión).

## El problema que resolvemos

Con ~180 vacantes activas gestionadas desde corporativo y un time-to-fill promedio de
**45 días**, Liverpool pidió un ecosistema que **estandarice la gestión de candidatos**,
**garantice trazabilidad** y **promueva la comunicación entre reclutadores**. Los dolores
concretos: el HM no sabe en qué va su proceso ni quién lo bloquea; la comparación de
candidatos vive en un Excel manual (AssessFirst); de ~300 candidatos, la mayoría nunca
recibe respuesta.

## Visión

Que el HM decida en minutos, no leyendo expedientes. Que el HRBP tenga visibilidad real
del SLA por área. Que **nadie quede sin respuesta**. Y que el "cerebro" del proceso no
sea una app más que hay que abrir, sino algo consultable como infraestructura (por eso
existe un servidor **MCP** que expone el estado del reclutamiento en lenguaje natural).

## Nuestros diferenciadores

- **Gobernanza human-in-the-loop real:** la IA nunca rechaza ni hace ofertas sola; toda
  decisión irreversible la toma un humano, **con justificación obligatoria**.
- **Cero ghosting por construcción:** cada cambio de etapa dispara notificación —
  la IA redacta, un humano aprueba, se envía.
- **Comparativa automática con evidencia citada:** la ficha de cada candidato se llena
  desde el CV y evaluaciones, y cada afirmación cita su fuente.
- **Evaluación sin discriminación:** el evaluador es ciego a nombre, género, edad y
  código postal; hay un `fairness_report` que audita sesgos por grupo.
- **Candado de posición:** no se abre proceso si la vacante no está autorizada.
- **Rescate de "medallistas de plata":** un candidato bien evaluado que no ganó una
  vacante se re-empareja automáticamente con nuevas requisiciones, sin repetir la
  búsqueda desde cero.
- **Acciones reales:** agenda en Google Calendar real (OAuth) y envía correo real
  (Resend), con degradación elegante a modo simulado si faltan credenciales.
- **Infraestructura, no solo app:** el mismo cerebro se consulta desde Claude Desktop
  vía MCP.
- **Trazabilidad total:** todo cambio relevante queda en un `audit_log` append-only.

> Nota de evolución: una primera versión del proyecto planteaba una simulación
> conversacional del puesto y un score de "permanencia" por distancia/commute. Se
> descartó al confrontarla con el reto real de Liverpool; el propio repositorio lo deja
> explícito en `AGENTS.md` para que nadie lo reintroduzca por error.

## Arquitectura

[Web HM] [Web AT] [Web HRBP] [Web Entrevistador] [Portal candidato ligero]
\ | | | /
Next.js (Vercel)
│ API
[ORQUESTADOR] ── máquina de estados 6 etapas + gobernanza
código determinista, sin IA
┌──────────────┬───────────┼────────────┬───────────────┐
[Supabase] [ia-service] [sla-engine] [acciones] [mcp-server]
Postgres + agentes LLM días hábiles Calendar + expone la
Auth/Realtime (OpenAI) + semáforos correo real plataforma

Storage(CV) (solo lectura)
│
[audit_log] append-only (dentro de Postgres)

- **Orquestador:** máquina de estados de 6 etapas (Requisición → Alineación → Búsqueda
  → Atracción → Selección → Oferta), con sub-estados `ESPERANDO_HM_*` cuando toca decidir
  a una persona. No usa IA.
- **ia-service:** 9 agentes LLM (alineación, extractor/comparador, generador de
  preguntas, consolidador de feedback, feedback personalizado, sugeridor de vacantes,
  reactivador, asistente del HM, fairness_report). Salida JSON validada contra schema.
- **sla-engine:** días hábiles, semáforos, predicción de cobertura, alertas — código, no IA.
- **acciones:** Google Calendar (OAuth) + Resend, con `ACTIONS_MODE=real|mock`.
- **mcp-server:** herramientas MCP de solo lectura para Claude Desktop.
- **Supabase:** Postgres + Auth con roles (RLS) + Realtime + Storage.

## Lenguajes y stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + **TypeScript** + Tailwind CSS 4 |
| Backend de dominio | TypeScript, dentro del monolito `web/` (orquestador, sla, ia, acciones) |
| Base de datos | Supabase (Postgres, Auth, Realtime, Storage) |
| IA | OpenAI API (chat + `text-embedding-3-small`), validación con `zod` |
| Acciones reales | `googleapis` (Calendar, OAuth2), `resend` (correo) |
| Lectura de CVs | `pdf-parse` |
| Servidor MCP | Node.js + TypeScript, `@modelcontextprotocol/sdk`, stdio |
| Calidad | ESLint, TypeScript estricto, scripts de verificación end-to-end |

## Estructura del repositorio (contenido del ZIP)

/AGENTS.md, /CLAUDE.md reglas de oro del proyecto (no romper)
/docs/ 00-reto · 01-arquitectura · 02-modelo-datos ·
03-estados-sla · 04-ia-agentes · 05-pantallas ·
06-equipo · 07-seed-demo-pitch
/web/ Next.js — frontend + backend de dominio
/src/app/(hm|at|hrbp|entrevistador|candidato)/...
/src/lib/{orquestador,sla,ia,acciones,auth,supabase}/
/supabase/
/migrations/*.sql esquema (fuente única de verdad)
/seed.sql 10 candidatos reales + usuarios + vacantes de prueba
/mcp-server/ servidor MCP de solo lectura (paquete aparte)


## Cómo usar el ZIP

1. **Base de datos:** crea un proyecto en Supabase y corre en orden las migraciones de
   `supabase/migrations/`. Carga `supabase/seed.sql` (10 candidatos, usuarios, vacantes
   en distintas etapas, alertas activas).
2. **Variables de entorno:** dentro de `web/`, copia `.env.example` a `.env.local` y
   completa mínimo:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

3. **Instalar y correr:**
```bash
   cd web
   npm install
   npm run dev
```
4. **Usuarios de prueba:** sincroniza el seed con Supabase Auth:
```bash
   npm run seed:auth
```
   Contraseña común: `Liverhack2026!` (configurable con `DEMO_PASSWORD`).
   Ej.: `aileen.vargas@liverpool.com.mx` → tablero HM;
   `monica.salinas@liverpool.com.mx` → tablero HRBP.
5. **(Opcional) Verificar el dominio de proceso sin UI:**
```bash
   npm run verify:proceso
```
6. **(Opcional) Acciones reales:** agrega `OPENAI_API_KEY`, `RESEND_API_KEY` y las
   credenciales de Google Cloud (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI`) y pon `ACTIONS_MODE=real`. Sin esto, el sistema sigue
   funcionando en modo simulado sin romper el flujo.
7. **(Opcional) Servidor MCP:**
```bash
   cd mcp-server
   npm install
   npm run build
   npm run token   # genera MCP_AUTH_TOKEN y su SHA-256
```
   Copia `.env.example` a `.env`, completa credenciales de Supabase y el hash del
   token, y conéctalo desde `claude_desktop_config.json` (ver `mcp-server/README.md`
   para el bloque exacto).

## Reglas de oro (no se rompen)

1. El humano decide lo irreversible; toda decisión lleva justificación obligatoria.
2. Cero ghosting: cada cambio de etapa notifica al candidato.
3. Candado de posición: sin posición autorizada no hay proceso.
4. Trazabilidad total en `audit_log` (append-only).
5. Ninguna afirmación de IA sin cita de origen.
6. Evaluación ciega a datos demográficos, con `fairness_report`.

## Estado del prototipo

Núcleo P0 (auth+roles, candado, orquestador 6 etapas, SLA+semáforos, comparativa con IA,
entrevistas en tiempo real, notificaciones, asistente-chat del HM) más gran parte de P1
(agente de alineación, feedback por lote, sugeridor de vacantes, reactivador, acciones
reales de Calendar/correo) construidos y probados; P2 (servidor MCP) también construido
y documentado.

## Equipo

División en 2 dominios de backend + sus pantallas: **Dominio Proceso** (flujo, SLA,
gobernanza) y **Dominio Inteligencia** (IA de candidatos), integrando sobre un esquema y
contratos acordados desde el día 0.
