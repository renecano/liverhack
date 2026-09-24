// Empaqueta src/index.ts en dist/index.js con esbuild.
// Reusa la lógica de web/src (orquestador, SLA, prioridad del HM, equidad) importándola
// al empaquetar: el alias "@/..." se resuelve con el tsconfig de cada carpeta y
// `server-only` (propio de Next) se sustituye por un módulo vacío. Las dependencias de
// npm quedan externas y se cargan de mcp-server/node_modules en tiempo de ejecución.
// web/ nunca importa nada de mcp-server/.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const externas = Object.keys(pkg.dependencies ?? {}).flatMap((d) => [d, `${d}/*`]);

const sinServerOnly = {
  name: "sin-server-only",
  setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "vacio" }));
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({ contents: "", loader: "js" }));
  },
};

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: externas,
  plugins: [sinServerOnly],
  logLevel: "info",
});
