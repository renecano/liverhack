// Acción real de correo (P1) con degradación elegante a modo simulado.
//
// Regla de decisión (real vs simulado):
//   - real   → hay RESEND_API_KEY y ACTIONS_MODE != 'mock'
//   - simulado → en cualquier otro caso (sin key, o ACTIONS_MODE = 'mock')
// Nunca lanza: si el envío real falla, devuelve { ok:false } para que el llamador
// decida (no marca como enviada). En modo simulado loguea y devuelve ok.
//
// Demo con correo real: en web/.env.local pon RESEND_API_KEY y ACTIONS_MODE=real.
// Sin dominio verificado en Resend, el remitente es onboarding@resend.dev y Resend
// SOLO entrega al correo de la cuenta de Resend: los candidatos/usuarios de la demo
// deben tener ese correo. A cualquier otro destinatario Resend responde error (403),
// la notificación se queda en 'aprobada' y el fallo queda en audit_log.

export type ModoEnvio = "real" | "simulado";

export interface ResultadoCorreo {
  ok: boolean;
  modo: ModoEnvio;
  /** id del mensaje devuelto por Resend, si hubo envío real exitoso. */
  id: string | null;
  error?: string;
}

/** Remitente de prueba de Resend: funciona sin dominio verificado. */
export const REMITENTE_POR_DEFECTO = "LivHire <onboarding@resend.dev>";
const LIMITE_ENVIO_MS = 10_000;

/** Real solo si hay API key y no estamos forzados a 'mock'. */
export function envioReal(): boolean {
  return process.env.ACTIONS_MODE !== "mock" && !!process.env.RESEND_API_KEY;
}

// RESEND_FROM se mantiene por compatibilidad con .env.local anteriores.
function remitente(): string {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM || REMITENTE_POR_DEFECTO;
}

export async function enviarCorreo({
  to,
  asunto,
  cuerpo,
}: {
  to: string;
  asunto: string;
  cuerpo: string;
}): Promise<ResultadoCorreo> {
  if (!envioReal()) {
    // Modo simulado: no se envía nada real, pero el flujo continúa.
    console.log(`[correo:simulado] para <${to}> · asunto: ${asunto}`);
    return { ok: true, modo: "simulado", id: null };
  }

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    // Import dinámico: el paquete resend solo se carga cuando de verdad se envía.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`Resend no respondió en ${LIMITE_ENVIO_MS / 1000} s`)), LIMITE_ENVIO_MS);
    });
    const { data, error } = await Promise.race([
      resend.emails.send({ from: remitente(), to, subject: asunto, text: cuerpo }),
      limite,
    ]);
    if (error) {
      // p. ej. validation_error (dominio no verificado / destinatario no permitido),
      // rate_limit_exceeded, invalid_api_key.
      const detalle = `${error.name}: ${error.message}`;
      console.error("[correo:real] error de Resend:", detalle);
      return { ok: false, modo: "real", id: null, error: detalle };
    }
    return { ok: true, modo: "real", id: data?.id ?? null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[correo:real] excepción al enviar:", error);
    return { ok: false, modo: "real", id: null, error };
  } finally {
    clearTimeout(temporizador);
  }
}
