// Corre las pruebas de lib/ia sin dependencias nuevas (desde web/):
//   node src/lib/ia/__tests__/correr-pruebas.mjs
// Transpila lib/ia con el `typescript` del proyecto a una carpeta temporal y usa
// el test runner nativo de Node. `server-only` se sustituye por un módulo vacío
// (fuera de Next no existe). OpenAI y Supabase se simulan dentro de cada prueba.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ia = path.resolve(aqui, "..");
const web = path.resolve(ia, "../../..");
const ts = createRequire(path.join(web, "package.json"))("typescript");

const salida = fs.mkdtempSync(path.join(os.tmpdir(), "ia-pruebas-"));
const stubs = path.join(salida, "stubs", "node_modules", "server-only");
fs.mkdirSync(stubs, { recursive: true });
fs.writeFileSync(path.join(stubs, "package.json"), JSON.stringify({ name: "server-only", main: "index.js" }));
fs.writeFileSync(path.join(stubs, "index.js"), "");

function transpilar(dir, destino) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const origen = path.join(dir, f.name);
    if (f.isDirectory()) transpilar(origen, path.join(destino, f.name));
    else if (f.name.endsWith(".ts")) {
      const { outputText } = ts.transpileModule(fs.readFileSync(origen, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        fileName: f.name,
      });
      fs.mkdirSync(destino, { recursive: true });
      fs.writeFileSync(path.join(destino, f.name.replace(/\.ts$/, ".js")), outputText);
    }
  }
}
const js = path.join(salida, "ia");
transpilar(ia, js);

const r = spawnSync(process.execPath, ["--test", path.join(js, "__tests__", "nunca-lanza.test.js")], {
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: [path.join(salida, "stubs", "node_modules"), path.join(web, "node_modules")].join(path.delimiter) },
});
fs.rmSync(salida, { recursive: true, force: true });
process.exit(r.status ?? 1);
