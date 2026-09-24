# LivHire — Copiloto de Atracción de Talento
### LiverHack 2026 · El Puerto de Liverpool

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

## Requisitos

- Node.js **20.12+**
- Cuenta de Supabase (gratis)
- (Opcional) API key de OpenAI, de Resend y credenciales OAuth de Google Cloud

## Cuentas y credenciales

- aileen.vargas@liverpool.com.mx
- daniela.rios@liverpool.com.mx
- monica.salinas@liverpool.com.mx
- sofia.rodriguez@liverpool.com.mx
- carlos.sanchez@liverpool.com.mx
- juan.perez@liverpool.com.mx
- admin@liverpool.com.mx

Contraseña:
Liverhack2026!

## 1. Base de datos (Supabase)

1. Crea un proyecto en supabase.com.
2. Aplica las migraciones **en este orden exacto** (SQL Editor del panel, o `supabase db push` si tienes la CLI conectada):

supabase/migrations/20260923191654_init_schema.sql
supabase/migrations/20260923204457_estado_proceso_vacantes.sql
supabase/migrations/20260923221237_campos_constraints_ia.sql
supabase/migrations/20260924120000_google_conexiones.sql

3. Carga `supabase/seed.sql` **después** de las 4 migraciones (10 candidatos, usuarios, vacantes y notificaciones de prueba).

## 2. Variables de entorno

```bash
cd web
cp .env.example .env.local
```

Edita `web/.env.local`:

```bash
# Supabase — obligatorias para levantar la app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# IA — sin esto la app levanta, pero toda función de IA
# (carga de CV, ficha automática, comparativa, asistente del HM) falla al usarse
OPENAI_API_KEY=

# Correo real (opcional)
RESEND_API_KEY=
EMAIL_FROM="LivHire <onboarding@resend.dev>"

# Google Calendar real (opcional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_CALENDAR_SEND_UPDATES=none

# Gobernanza
MAX_USD_DIA=10
ACTIONS_MODE=mock   # "real" para correo/calendario reales; requiere las llaves de arriba
```

Todas las llaves y URLs (Supabase, OpenAI, Resend, Google) se obtienen desde el panel de
cada servicio: Supabase → Project Settings → API; OpenAI → platform.openai.com/api-keys;
Resend → resend.com/api-keys; Google → Google Cloud Console → credenciales OAuth 2.0
(agrega `http://localhost:3000/api/google/callback` como Redirect URI autorizado).

## 3. Instalar y correr

```bash
cd web
npm install
npm run dev
```

Abre `http://localhost:3000`.

## 4. Usuarios de prueba (Supabase Auth)

```bash
npm run seed:auth
```

Sincroniza los `usuarios` del seed con Supabase Auth. Contraseña común: `Liverhack2026!`
(cámbiala con `DEMO_PASSWORD=... npm run seed:auth`).

- `aileen.vargas@liverpool.com.mx` → tablero HM
- `monica.salinas@liverpool.com.mx` → tablero HRBP

## 5. (Opcional) Preparar el camino feliz de la demo

```bash
npm run seed:demo
```

Deja una vacante en la compuerta `ESPERANDO_HM_DECIDE_FINALISTA` con pool listo, para
que el HM tenga algo real que decidir sin correr todo el flujo a mano.

## 6. (Opcional) Verificar el dominio de proceso sin UI

```bash
npm run verify:proceso               # corre y limpia la vacante de prueba
npm run verify:proceso -- --conservar   # la deja para inspeccionarla
```

## 7. (Opcional) Conectar Google Calendar real

Con `ACTIONS_MODE=real` y las credenciales de Google en `.env.local`, el usuario AT debe
además conectar su cuenta desde `/at/entrevistas` (flujo OAuth) para que las entrevistas
se agenden como eventos reales. Sin conexión, caen a modo interno automáticamente.

## 8. (Opcional) Servidor MCP para Claude Desktop

```bash
cd mcp-server
npm install
npm run build      # requiere web/ en el mismo checkout (compila ../web/src)
npm run token       # imprime MCP_AUTH_TOKEN y su SHA-256
cp .env.example .env
```

Edita `mcp-server/.env`:

```bash
MCP_SUPABASE_URL=
MCP_SUPABASE_SERVICE_KEY=
MCP_AUTH_TOKEN_SHA256=
```

Conéctalo desde `claude_desktop_config.json` (Settings → Developer → Edit Config en
Claude Desktop) con el bloque `mcpServers` documentado en `mcp-server/README.md`.
Reinicia Claude Desktop por completo para que cargue la herramienta.

## Comandos disponibles (`web/`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `localhost:3000` |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run seed:auth` | Sincroniza usuarios del seed con Supabase Auth |
| `npm run seed:demo` | Prepara la vacante de demo en su compuerta |
| `npm run verify:proceso` | Prueba end-to-end del orquestador sin UI |

## Comandos disponibles (`mcp-server/`)

| Comando | Qué hace |
|---|---|
| `npm run build` | Compila el servidor (incluye lógica de `web/src`) |
| `npm run token` | Genera un `MCP_AUTH_TOKEN` nuevo y su hash |
| `npm run probar` | Prueba de humo: arranca por stdio y llama a las 4 herramientas |
| `npm start` | Corre `dist/index.js` |
