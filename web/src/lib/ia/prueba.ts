import "server-only";
// Marca de corridas de prueba: los scripts de test/dev mandan el encabezado
// `x-livhire-prueba: 1` y la entrada de audit_log lleva `prueba: true` en detalle.
// Solo etiqueta: la fila se escribe igual (el audit sigue siendo completo).
export const ENCABEZADO_PRUEBA = "x-livhire-prueba";

export const esPrueba = (req: Request) => req.headers.get(ENCABEZADO_PRUEBA) === "1";
