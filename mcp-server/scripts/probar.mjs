// Prueba de humo: arranca dist/index.js por stdio (como Claude Desktop), lista las
// herramientas y llama a cada una. Usa el entorno actual + mcp-server/.env.
//   MCP_AUTH_TOKEN=<tu token> npm run probar
//   npm run probar -- --hm Aileen --vacante Backend
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const servidor = fileURLToPath(new URL("../dist/index.js", import.meta.url));

const transporte = new StdioClientTransport({ command: process.execPath, args: [servidor], env: { ...process.env }, stderr: "inherit" });
const cliente = new Client({ name: "livhire-prueba", version: "0.1.0" });
await cliente.connect(transporte);

const { tools } = await cliente.listTools();
console.log(`Herramientas: ${tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? " (solo lectura)" : ""}`).join(", ")}\n`);

const llamadas = [
  ["listar_vacantes", {}],
  ["estado_vacante", { titulo_o_id: arg("vacante", "Backend") }],
  ["pendientes_hm", { nombre_hm: arg("hm", "Aileen") }],
  ["reporte_equidad", { dimension: "fuente" }],
];
let fallas = 0;
for (const [nombre, args] of llamadas) {
  const r = await cliente.callTool({ name: nombre, arguments: args });
  const texto = r.content.map((c) => c.text).join("\n");
  if (r.isError) fallas++;
  console.log(`==== ${nombre} ${JSON.stringify(args)}${r.isError ? "  [ERROR]" : ""}\n${texto}\n`);
}
await cliente.close();
process.exit(fallas ? 1 : 0);
