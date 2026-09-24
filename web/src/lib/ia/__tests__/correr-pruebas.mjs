// Corre las pruebas de lib/ia sin dependencias nuevas (desde web/):
//   node src/lib/ia/__tests__/correr-pruebas.mjs
// Transpila lib/ia (y el cliente admin de lib/supabase que usa) con el `typescript`
// del proyecto a una carpeta temporal y usa el test runner nativo de Node.
//  - `server-only` se sustituye por un módulo vacío (fuera de Next no existe).
//  - El alias `@/…` se resuelve a la carpeta transpilada con un gancho de carga.
// OpenAI y Supabase se simulan dentro de cada prueba (fetch global).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(aqui, "../../../..");
const src = path.join(web, "src");
const ts = createRequire(path.join(web, "package.json"))("typescript");

const salida = fs.mkdtempSync(path.join(os.tmpdir(), "ia-pruebas-"));
const stubs = path.join(salida, "stubs", "node_modules", "server-only");
fs.mkdirSync(stubs, { recursive: true });
fs.writeFileSync(path.join(stubs, "package.json"), JSON.stringify({ name: "server-only", main: "index.js" }));
fs.writeFileSync(path.join(stubs, "index.js"), "");

function transpilar(origen, destino) {
  const st = fs.statSync(origen);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(origen)) transpilar(path.join(origen, f), path.join(destino, f));
    return;
  }
  if (!origen.endsWith(".ts")) return;
  const { outputText } = ts.transpileModule(fs.readFileSync(origen, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path.basename(origen),
  });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino.replace(/\.ts$/, ".js"), outputText);
}
const js = path.join(salida, "src");
transpilar(path.join(src, "lib", "ia"), path.join(js, "lib", "ia"));
transpilar(path.join(src, "lib", "supabase", "admin.ts"), path.join(js, "lib", "supabase", "admin.ts"));
// estados.ts (Persona A): lo usa el asistente del HM (INFO_ESTADO, NOMBRE_ETAPA).
transpilar(path.join(src, "lib", "orquestador", "estados.ts"), path.join(js, "lib", "orquestador", "estados.ts"));

// Gancho: "@/x" → <salida>/src/x
const gancho = path.join(salida, "alias.cjs");
fs.writeFileSync(
  gancho,
  `const Module = require("module");
const base = ${JSON.stringify(js)};
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido.startsWith("@/")) pedido = require("path").join(base, pedido.slice(2));
  return original.call(this, pedido, ...resto);
};`,
);

const dirPruebas = path.join(js, "lib", "ia", "__tests__");
const pruebas = fs.readdirSync(dirPruebas).filter((f) => f.endsWith(".test.js")).map((f) => path.join(dirPruebas, f));
const r = spawnSync(process.execPath, ["--require", gancho, "--test", ...pruebas], {
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: [path.join(salida, "stubs", "node_modules"), path.join(web, "node_modules")].join(path.delimiter) },
});
fs.rmSync(salida, { recursive: true, force: true });
process.exit(r.status ?? 1);
