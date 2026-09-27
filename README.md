# LivHire — Talent Acquisition Copilot
### LiverHack 2026 · El Puerto de Liverpool

## Purpose

LivHire is an **internal** web platform that unifies and adds proactivity to El Puerto de Liverpool's talent acquisition process (corporate and distribution centers), from **requisition to offer**. It is not an app for floor candidates, nor does it replace the external ATS (**Aira**), which already handles applications: LivHire is the **copilot for the internal process** for three roles:

- **HM (Hiring Manager):** opens the requisition and makes decisions. Has no time to read lengthy files; needs to compare and decide in just a few clicks.
- **AT (Talent Acquisition / Recruiter):** operates the process, loads candidates and assessments, schedules, communicates.
- **HRBP (HR Business Partner):** strategic partner; needs a directory and SLA visibility by area.
- **Interviewer:** evaluates candidates (there may be several per session).

## The problem we solve

With ~180 active openings managed from corporate and an average time-to-fill of **45 days**, Liverpool asked for an ecosystem that **standardizes candidate management**, **guarantees traceability**, and **promotes communication between recruiters**. The concrete pain points: the HM doesn't know where their process stands or who's blocking it; candidate comparison lives in a manual spreadsheet (AssessFirst); of ~300 candidates, most never receive a response.

## Our differentiators

- **Real human-in-the-loop governance:** the AI never rejects or makes offers on its own; every irreversible decision is made by a human, **with a mandatory justification**.
- **Zero ghosting by design:** every stage change triggers a notification — the AI drafts it, a human approves it, and it's sent.
- **Automatic comparison with cited evidence:** each candidate's profile is filled in from their CV and assessments, and every claim cites its source.
- **Bias-free evaluation:** the evaluator is blind to name, gender, age, and postal code; a `fairness_report` audits bias by group.
- **Position lock:** a process can't be opened if the opening isn't authorized.
- **"Silver medalist" rescue:** a well-evaluated candidate who didn't win an opening is automatically re-matched with new requisitions, without repeating the search from scratch.
- **Real actions:** schedules on real Google Calendar (OAuth) and sends real email (Resend), with graceful degradation to simulated mode if credentials are missing.
- **Infrastructure, not just an app:** the same brain can be queried from Claude Desktop via MCP.
- **Full traceability:** every relevant change is recorded in an append-only `audit_log`.

## Languages and stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + **TypeScript** + Tailwind CSS 4 |
| Domain backend | TypeScript, inside the `web/` monolith (orchestrator, sla, ia, actions) |
| Database | Supabase (Postgres, Auth, Realtime, Storage) |
| AI | OpenAI API (chat + `text-embedding-3-small`), validation with `zod` |
| Real actions | `googleapis` (Calendar, OAuth2), `resend` (email) |
| CV reading | `pdf-parse` |
| MCP server | Node.js + TypeScript, `@modelcontextprotocol/sdk`, stdio |
| Quality | ESLint, strict TypeScript, end-to-end verification scripts |

## Requirements

- Node.js **20.12+**
- A Supabase account (free)
- (Optional) An OpenAI API key, a Resend key, and Google Cloud OAuth credentials

## Accounts and credentials

- aileen.vargas@liverpool.com.mx
- daniela.rios@liverpool.com.mx
- monica.salinas@liverpool.com.mx
- sofia.rodriguez@liverpool.com.mx
- carlos.sanchez@liverpool.com.mx
- juan.perez@liverpool.com.mx
- admin@liverpool.com.mx

Password:
Liverhack2026!

## 1. Database (Supabase)

1. Create a project at supabase.com.
2. Apply the migrations **in this exact order** (SQL Editor in the dashboard, or `supabase db push` if you have the CLI connected):
- supabase/migrations/20260923191654_init_schema.sql
- supabase/migrations/20260923204457_estado_proceso_vacantes.sql
- supabase/migrations/20260923221237_campos_constraints_ia.sql
- supabase/migrations/20260924120000_google_conexiones.sql
3. Load `supabase/seed.sql` **after** the 4 migrations (10 candidates, users, openings, and test notifications).

## 2. Environment variables

```bash
cd web
cp .env.example .env.local
```

Edit `web/.env.local`:

```bash
# Supabase — required to run the app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI — without this the app boots, but every AI feature
# (CV upload, automatic profile, comparison, HM assistant) fails when used
OPENAI_API_KEY=

# Real email (optional)
RESEND_API_KEY=
EMAIL_FROM="LivHire <onboarding@resend.dev>"

# Real Google Calendar (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_CALENDAR_SEND_UPDATES=none

# Governance
MAX_USD_DIA=10
ACTIONS_MODE=mock   # "real" for real email/calendar; requires the keys above
```

All keys and URLs (Supabase, OpenAI, Resend, Google) are obtained from each service's dashboard: Supabase → Project Settings → API; OpenAI → platform.openai.com/api-keys; Resend → resend.com/api-keys; Google → Google Cloud Console → OAuth 2.0 credentials (add `http://localhost:3000/api/google/callback` as an authorized Redirect URI).

## 3. Install and run

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Test users (Supabase Auth)

```bash
npm run seed:auth
```

Syncs the seed `users` with Supabase Auth. Common password: `Liverhack2026!` (change it with `DEMO_PASSWORD=... npm run seed:auth`).

- `aileen.vargas@liverpool.com.mx` → HM dashboard
- `monica.salinas@liverpool.com.mx` → HRBP dashboard

## 5. (Optional) Prepare the demo happy path

```bash
npm run seed:demo
```

Leaves an opening at the `ESPERANDO_HM_DECIDE_FINALISTA` gate with a ready pool, so the HM has something real to decide without running the whole flow manually.

## 6. (Optional) Verify the process domain without UI

```bash
npm run verify:proceso               # runs and cleans up the test opening
npm run verify:proceso -- --conservar   # leaves it for inspection
```

## 7. (Optional) Connect real Google Calendar

With `ACTIONS_MODE=real` and the Google credentials in `.env.local`, the AT user must also connect their account from `/at/entrevistas` (OAuth flow) for interviews to be scheduled as real events. Without a connection, they fall back to internal mode automatically.

## 8. (Optional) MCP server for Claude Desktop

```bash
cd mcp-server
npm install
npm run build      # requires web/ in the same checkout (compiles ../web/src)
npm run token       # prints MCP_AUTH_TOKEN and its SHA-256
cp .env.example .env
```

Edit `mcp-server/.env`:

```bash
MCP_SUPABASE_URL=
MCP_SUPABASE_SERVICE_KEY=
MCP_AUTH_TOKEN_SHA256=
```

Connect it from `claude_desktop_config.json` (Settings → Developer → Edit Config in Claude Desktop) using the `mcpServers` block documented in `mcp-server/README.md`. Restart Claude Desktop completely so it loads the tool.

## Available commands (`web/`)

| Command | What it does |
|---|---|
| `npm run dev` | Development server at `localhost:3000` |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run seed:auth` | Syncs seed users with Supabase Auth |
| `npm run seed:demo` | Prepares the demo opening at its gate |
| `npm run verify:proceso` | End-to-end orchestrator test without UI |

## Available commands (`mcp-server/`)

| Command | What it does |
|---|---|
| `npm run build` | Compiles the server (includes `web/src` logic) |
| `npm run token` | Generates a new `MCP_AUTH_TOKEN` and its hash |
| `npm run probar` | Smoke test: starts over stdio and calls the 4 tools |
| `npm start` | Runs `dist/index.js` |
