// `server-only` es un paquete de Next que solo existe en web/; el build lo sustituye por
// un módulo vacío (build.mjs). Esta declaración solo sirve para el typecheck.
declare module "server-only";
