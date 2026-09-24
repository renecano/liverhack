# LivHire · servidor MCP (etapa 1: solo lectura)

Expone el estado del reclutamiento de LivHire como herramientas MCP para consultarlo en
lenguaje natural desde **Claude Desktop** (transporte **stdio**, local). Las acciones
(crear, decidir) llegan en la etapa 2; hoy **ninguna herramienta escribe**.

| Herramienta | Para qué | Lógica que reusa |
|---|---|---|
| `listar_vacantes(estatus?)` | Vacantes con etapa, estado, semáforo, días restantes, cobertura estimada y quién bloquea | `resumenVacantes` (orquestador + motor de SLA) |
| `estado_vacante(titulo_o_id)` | Detalle de una vacante: etapas/SLA, HM/AT/HRBP, candidatos en el proceso, decisiones | `resumenVacantes` + consultas de pipeline y decisiones |
| `pendientes_hm(nombre_hm)` | Pendientes de un HM por prioridad | `priorizar` (mismo orden que el asistente del HM, agente 8) |
| `reporte_equidad(dimension?, vacante?)` | Fairness report: tasas por grupo y señales (regla 4/5) | `reporteEquidad` (agente 9) |

## Cómo está hecho

- Paquete aparte (`mcp-server/`), con su `package.json`. **`web/` no importa nada de aquí.**
- `npm run build` empaqueta con esbuild `src/index.ts` **y la lógica de `web/src`** que usa
  (orquestador, SLA, prioridad del HM, equidad) en `dist/index.js`: no se reimplementa
  scoring ni SLA. Si cambia esa lógica en `web/`, basta con volver a hacer build.
  Requiere que `web/` esté en el mismo checkout (el build lee `../web/src`).
- Se conecta a la misma base hosted con la **service_role** (`MCP_SUPABASE_URL`,
  `MCP_SUPABASE_SERVICE_KEY`). Solo hace `select`.
- stdout es el canal del protocolo; los logs van a stderr (Claude Desktop los guarda en
  su carpeta `logs`, archivo `mcp-server-livhire.log`).

## Seguridad: token

El servidor exige `MCP_AUTH_TOKEN` (lo manda Claude Desktop en su bloque `env`) y lo
compara con el **SHA-256** guardado en `mcp-server/.env` (`MCP_AUTH_TOKEN_SHA256`). Si
falta o no coincide, **todas las herramientas responden "Acceso rechazado"** y no se hace
ninguna consulta. Falla cerrado: sin hash configurado también rechaza.

Nota honesta: en stdio local el token evita que otro cliente MCP de la máquina use el
servidor sin conocerlo, pero quien pueda leer la config de Claude Desktop lo ve. La
service_role key da acceso total a la base: este servidor es para tu máquina, no para
compartirse ni exponerse en red.

## Build

Requiere Node 20.12+ (probado con Node 24).

```powershell
cd C:\Users\Leo\Documents\LiverhackGithub\liverhack\mcp-server
npm install
npm run build        # genera dist\index.js
npm run token        # imprime un MCP_AUTH_TOKEN nuevo y su SHA-256
copy .env.example .env
# edita .env: MCP_SUPABASE_URL, MCP_SUPABASE_SERVICE_KEY y MCP_AUTH_TOKEN_SHA256
```

Prueba de humo (arranca el servidor por stdio y llama a las 4 herramientas):

```powershell
$env:MCP_AUTH_TOKEN = "<el token que imprimió npm run token>"
npm run probar                       # o: npm run probar -- --hm Aileen --vacante "Gerente de Proyectos"
```

## Conectar a Claude Desktop (Windows)

1. Haz el build y crea `mcp-server\.env` (sección anterior).
2. En Claude Desktop: **Settings → Developer → Edit Config**. Abre
   `claude_desktop_config.json` (en la instalación de Microsoft Store vive en
   `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`; en la
   instalación clásica, en `%APPDATA%\Claude\`).
3. **Agrega** la clave `mcpServers` al objeto de nivel superior (junto a lo que ya haya,
   p. ej. `"preferences"`; no borres nada). Bloque exacto:

```json
"mcpServers": {
  "livhire": {
    "command": "C:\\Program Files\\nodejs\\node.exe",
    "args": ["C:\\Users\\Leo\\Documents\\LiverhackGithub\\liverhack\\mcp-server\\dist\\index.js"],
    "cwd": "C:\\Users\\Leo\\Documents\\LiverhackGithub\\liverhack\\mcp-server",
    "env": {
      "MCP_SUPABASE_URL": "https://<tu-proyecto>.supabase.co",
      "MCP_SUPABASE_SERVICE_KEY": "<service_role key>",
      "MCP_AUTH_TOKEN": "<token de npm run token>"
    }
  }
}
```

   - `args` usa la ruta absoluta, así que funciona aunque Claude Desktop ignore `cwd`.
   - `MCP_SUPABASE_URL` / `MCP_SUPABASE_SERVICE_KEY` pueden ir aquí o solo en
     `mcp-server\.env` (lo del bloque `env` tiene prioridad). `MCP_AUTH_TOKEN` va aquí;
     su SHA-256 va en `.env`.
4. Cierra Claude Desktop **por completo** (también desde el ícono de la bandeja) y ábrelo.
5. En un chat nuevo, el ícono de herramientas debe listar `livhire` con 4 herramientas.
   Prueba: *"¿Cómo van las vacantes de LivHire?"*, *"¿Qué tiene pendiente Aileen?"*,
   *"¿En qué va la vacante de Backend?"*, *"¿Hay algún sesgo por fuente?"*.

Si no aparece o responde "Acceso rechazado": revisa
`...\Claude\logs\mcp-server-livhire.log` (el servidor escribe ahí `RECHAZADO: <motivo>`
o `listo (solo lectura) · token válido`).
