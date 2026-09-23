// Acción real de correo (P1) con degradación elegante a modo simulado.
//
// Regla de decisión (real vs simulado):
//   - real   → hay RESEND_API_KEY y ACTIONS_MODE != 'mock'
//   - simulado → en cualquier otro caso (sin key, o ACTIONS_MODE = 'mock')
// Nunca lanza: si el envío real falla, devuelve { ok:false } para que el llamador
// decida (no marca como enviada). En modo simulado loguea y devuelve ok.

export type ModoEnvio = "real" | "simulado";

export interface ResultadoCorreo {
  ok: boolean;
  modo: ModoEnvio;
  /** id del mensaje devuelto por Resend, si hubo envío real exitoso. */
  id: string | null;
  error?: string;
}

/** Real solo si hay API key y no estamos forzados a 'mock'. */
function envioReal(): boolean {
  return process.env.ACTIONS_MODE !== "mock" && !!process.env.RESEND_API_KEY;
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

  try {
    // Import dinámico: el paquete resend solo se carga cuando de verdad se envía.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM || "LivHire <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({ from, to, subject: asunto, text: cuerpo });
    if (error) {
      console.error("[correo:real] error de Resend:", error.message);
      return { ok: false, modo: "real", id: null, error: error.message };
    }
    return { ok: true, modo: "real", id: data?.id ?? null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[correo:real] excepción al enviar:", error);
    return { ok: false, modo: "real", id: null, error };
  }
}
