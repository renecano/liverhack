import "server-only";
// Ejecución "que nunca lanza" para las funciones que llama código de otro
// dominio (orquestador de Persona A). Módulo puro, sin dependencias.
//
// Garantías de conLimite():
//  - Nunca rechaza: devuelve el resultado o { timeout: true }.
//  - Al vencer el límite aborta `signal` (cancela las llamadas a OpenAI) y
//    bloquea cualquier escritura posterior (escribir() lanza TimeoutIA).
//  - Si una escritura YA empezó, el límite deja de aplicar y se espera a que
//    termine: son rápidas, y así nunca se reporta "timeout" de algo que sí se guardó.

const MARGEN_ESCRITURA_MS = 10_000;

export class TimeoutIA extends Error {
  constructor() {
    super("Se agotó el tiempo límite");
    this.name = "TimeoutIA";
  }
}

export interface Ejecucion {
  signal: AbortSignal;
  /** Marca el punto de no retorno: tras empezar a escribir, el límite ya no corta. */
  escribir<T>(fn: () => PromiseLike<T>): Promise<T>;
}

export async function conLimite<R>(ms: number, fn: (e: Ejecucion) => Promise<R>): Promise<R | { timeout: true }> {
  const control = new AbortController();
  let escribiendo = false;
  let resolverTimeout: (v: { timeout: true }) => void = () => {};
  const vencido = new Promise<{ timeout: true }>((r) => (resolverTimeout = r));

  let gracia: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    if (escribiendo) {
      // Punto de no retorno: se espera el resultado real, pero no para siempre
      // (una BD colgada no debe colgar al llamador).
      gracia = setTimeout(() => resolverTimeout({ timeout: true }), MARGEN_ESCRITURA_MS);
      return;
    }
    control.abort(new TimeoutIA());
    resolverTimeout({ timeout: true });
  }, ms);

  const ejecucion: Ejecucion = {
    signal: control.signal,
    async escribir(f) {
      if (control.signal.aborted) throw new TimeoutIA();
      escribiendo = true;
      return await f();
    },
  };

  // Si gana el límite, el trabajo sigue vivo y luego se rechaza (p. ej. la llamada
  // abortada a OpenAI); Promise.race ya está suscrito a ese rechazo, así que no
  // queda como unhandledRejection (lo cubre la prueba "modelo colgado").
  try {
    return await Promise.race([fn(ejecucion), vencido]);
  } finally {
    clearTimeout(timer);
    if (gracia) clearTimeout(gracia);
  }
}

export type ErrorGenerico = "salida_invalida" | "timeout" | "interno";

export function clasificarError(err: unknown): ErrorGenerico {
  const nombre = err instanceof Error ? err.name : "";
  if (nombre === "SalidaInvalidaError") return "salida_invalida";
  if (nombre === "TimeoutIA" || nombre === "AbortError" || nombre === "APIUserAbortError") return "timeout";
  return "interno";
}

// Texto corto y sin datos personales para audit_log / respuesta: sin emails,
// teléfonos ni texto de validación (que puede citar la ficha).
export function detalleSeguro(err: unknown): string {
  if (err instanceof Error && err.name === "SalidaInvalidaError") {
    const n = (err as Error & { errores?: unknown[] }).errores?.length ?? 0;
    return `La salida del modelo no pasó ${n} validación(es) tras los reintentos`;
  }
  const base = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return base
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[número]")
    .slice(0, 140);
}
