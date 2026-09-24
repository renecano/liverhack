// Servidor MCP de LivHire (etapa 1: SOLO LECTURA) sobre stdio, para Claude Desktop.
// stdout es el canal del protocolo: todo log va a stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cargarEnv, configurarSupabase, verificarToken } from "./config";
import { estadoVacante, listarVacantes, pendientesHM, reporteEquidadTexto, type FiltroEstatus } from "./herramientas";

console.log = console.error; // nada de la lógica reusada puede ensuciar stdout

cargarEnv();
const auth = verificarToken();
const errorConfig = configurarSupabase();
if (!auth.ok) console.error(`[livhire-mcp] RECHAZADO: ${auth.motivo}`);
if (errorConfig) console.error(`[livhire-mcp] ${errorConfig}`);

type Resultado = { content: { type: "text"; text: string }[]; isError?: boolean };
const texto = (t: string, isError = false): Resultado => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

/** Todas las herramientas pasan por aquí: token, configuración y errores legibles. */
async function ejecutar(nombre: string, fn: () => Promise<string>): Promise<Resultado> {
  if (!auth.ok) return texto(`Acceso rechazado por el servidor LivHire: ${auth.motivo}`, true);
  if (errorConfig) return texto(`El servidor LivHire no está configurado: ${errorConfig}`, true);
  const t0 = Date.now();
  try {
    const salida = await fn();
    console.error(`[livhire-mcp] ${nombre} ok en ${Date.now() - t0} ms`);
    return texto(salida);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error(`[livhire-mcp] ${nombre} falló: ${detalle}`);
    return texto(`No pude consultar LivHire (${nombre}): ${detalle}`, true);
  }
}

const soloLectura = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const server = new McpServer({ name: "livhire", version: "0.1.0" });

server.registerTool(
  "listar_vacantes",
  {
    title: "Listar vacantes de LivHire",
    description:
      "Lista las vacantes de reclutamiento de LivHire (El Puerto de Liverpool) con su etapa, estado del proceso, semáforo de SLA (a tiempo / en riesgo / atrasada), días hábiles restantes de la etapa, fecha estimada de cobertura y quién bloquea. Úsala para preguntas generales como '¿cómo van las vacantes?', '¿qué vacantes están atrasadas?' o '¿cuáles esperan al Hiring Manager?'. Por defecto solo las activas (abiertas y en proceso).",
    inputSchema: {
      estatus: z
        .enum(["activas", "todas", "abierta", "en_proceso", "cubierta", "cancelada"])
        .optional()
        .describe("Filtro por estatus. 'activas' (por defecto) = abiertas + en proceso; 'todas' incluye cubiertas y canceladas."),
    },
    annotations: soloLectura,
  },
  async ({ estatus }) => ejecutar("listar_vacantes", () => listarVacantes((estatus ?? "activas") as FiltroEstatus)),
);

server.registerTool(
  "estado_vacante",
  {
    title: "Estado de una vacante",
    description:
      "Detalle de UNA vacante de LivHire: etapa y estado del proceso, semáforo y fechas de SLA por etapa, responsables (HM, AT, HRBP), quién bloquea, candidatos en el proceso (con fit y cumplimiento de no negociables) y decisiones del HM con su justificación. Úsala para '¿en qué va la vacante de X?' o '¿quiénes son los finalistas de X?'. Acepta parte del título o el id.",
    inputSchema: {
      titulo_o_id: z.string().min(1).describe("Título de la vacante (o una parte, p. ej. 'Backend') o su id (uuid)."),
    },
    annotations: soloLectura,
  },
  async ({ titulo_o_id }) => ejecutar("estado_vacante", () => estadoVacante(titulo_o_id)),
);

server.registerTool(
  "pendientes_hm",
  {
    title: "Pendientes de un Hiring Manager",
    description:
      "Qué tiene pendiente un Hiring Manager en LivHire, ordenado por prioridad (misma lógica que el asistente del HM en la plataforma): primero lo atrasado que lo espera a él, luego las decisiones que le tocan (p. ej. elegir finalista), lo atrasado por otras personas, avisos a candidatos por aprobar, lo que está en riesgo y lo que vence pronto. Úsala para '¿qué tiene que hacer hoy Aileen?' o '¿qué decisiones tiene pendientes el HM?'.",
    inputSchema: {
      nombre_hm: z.string().min(1).describe("Nombre (o parte del nombre) del Hiring Manager, p. ej. 'Aileen'."),
    },
    annotations: soloLectura,
  },
  async ({ nombre_hm }) => ejecutar("pendientes_hm", () => pendientesHM(nombre_hm)),
);

server.registerTool(
  "reporte_equidad",
  {
    title: "Reporte de equidad (fairness report)",
    description:
      "Reporte de equidad del proceso de LivHire: tasas de avance, finalista y descarte por grupo NO sensible (escolaridad, fuente de la candidatura, rango de compensación deseada) y señales de posible sesgo con la regla de las 4/5. Solo agregados, sin datos individuales. Úsala para '¿el proceso trata igual a todos?' o '¿hay algún sesgo por fuente?'. Con datos de prueba las cifras son ilustrativas.",
    inputSchema: {
      dimension: z
        .enum(["escolaridad", "fuente", "compensacion"])
        .optional()
        .describe("Limitar el detalle a una dimensión. Sin valor: las tres."),
      vacante: z.string().optional().describe("Opcional: título o id de una vacante para limitar el reporte a ella."),
    },
    annotations: soloLectura,
  },
  async ({ dimension, vacante }) => ejecutar("reporte_equidad", () => reporteEquidadTexto(dimension, vacante)),
);

await server.connect(new StdioServerTransport());
console.error(`[livhire-mcp] listo (solo lectura) · token ${auth.ok ? "válido" : "INVÁLIDO"}${errorConfig ? " · sin configuración de Supabase" : ""}`);
