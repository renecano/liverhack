import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Carpeta mcp-server/ (este archivo vive en dist/ o src/).
export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Carga mcp-server/.env sin pisar lo que ya viene en el entorno: lo que ponga la
 * config de Claude Desktop (bloque "env") manda sobre el .env.
 */
export function cargarEnv(): void {
  const archivo = join(RAIZ, ".env");
  if (!existsSync(archivo)) return;
  for (const [clave, valor] of Object.entries(parseEnv(readFileSync(archivo, "utf8")))) {
    if (process.env[clave] === undefined && valor !== undefined) process.env[clave] = valor;
  }
}

/**
 * createAdminClient() (web/src/lib/supabase/admin.ts) lee NEXT_PUBLIC_SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY; aquí se alimentan desde las envs propias del MCP.
 */
export function configurarSupabase(): string | null {
  const url = process.env.MCP_SUPABASE_URL?.trim();
  const clave = process.env.MCP_SUPABASE_SERVICE_KEY?.trim();
  if (!url || !clave) return "Faltan MCP_SUPABASE_URL o MCP_SUPABASE_SERVICE_KEY (config de Claude Desktop o mcp-server/.env).";
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = clave;
  return null;
}

export const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

/**
 * El cliente (Claude Desktop) manda MCP_AUTH_TOKEN; el servidor guarda solo su SHA-256
 * en MCP_AUTH_TOKEN_SHA256 (mcp-server/.env). Falla cerrado: sin hash esperado, rechaza.
 */
export function verificarToken(): { ok: true } | { ok: false; motivo: string } {
  const esperado = process.env.MCP_AUTH_TOKEN_SHA256?.trim().toLowerCase();
  const token = process.env.MCP_AUTH_TOKEN;
  if (!esperado || !/^[0-9a-f]{64}$/.test(esperado)) {
    return { ok: false, motivo: "El servidor no tiene MCP_AUTH_TOKEN_SHA256 válido en mcp-server/.env (genéralo con `npm run token`)." };
  }
  if (!token) return { ok: false, motivo: "Falta MCP_AUTH_TOKEN en el bloque env de la configuración de Claude Desktop." };
  const iguales = timingSafeEqual(Buffer.from(sha256(token), "hex"), Buffer.from(esperado, "hex"));
  return iguales ? { ok: true } : { ok: false, motivo: "MCP_AUTH_TOKEN no coincide con el esperado." };
}
