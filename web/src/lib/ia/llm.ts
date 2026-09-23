import "server-only";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { openai } from "./openai";

// Ciclo común de los agentes: LLM con temperature 0 y salida con schema →
// zod → validación de negocio → reintento con el motivo del fallo.
// Si nunca valida, lanza SalidaInvalidaError (la API responde 422) y nada se guarda.

export class SalidaInvalidaError extends Error {
  constructor(
    public errores: string[],
    public intentos: number,
  ) {
    super(`La salida del LLM no validó tras ${intentos} intentos: ${errores.join("; ")}`);
  }
}

type Validacion<R> = { ok: true; valor: R } | { ok: false; errores: string[] };

export async function generarValidado<S extends z.ZodType, R>(opts: {
  modelo: string;
  sistema: string;
  usuario: string;
  schema: S;
  nombreSchema: string;
  validar: (crudo: z.infer<S>) => Validacion<R>;
  maxIntentos?: number;
}): Promise<{ valor: R; modelo: string; intentos: number; erroresPrevios: string[] }> {
  const max = opts.maxIntentos ?? 3;
  const mensajes: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: opts.sistema },
    { role: "user", content: opts.usuario },
  ];
  const erroresPrevios: string[] = [];
  let errores: string[] = [];

  for (let intento = 1; intento <= max; intento++) {
    const r = await openai().chat.completions.create({
      model: opts.modelo,
      temperature: 0,
      seed: 7,
      messages: mensajes,
      response_format: zodResponseFormat(opts.schema, opts.nombreSchema),
    });
    const msg = r.choices[0]?.message;
    const contenido = msg?.content ?? "";

    let v: Validacion<R>;
    try {
      const crudo = opts.schema.safeParse(JSON.parse(contenido));
      v = crudo.success
        ? opts.validar(crudo.data)
        : { ok: false, errores: crudo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    } catch {
      v = { ok: false, errores: [msg?.refusal ? `El modelo se negó: ${msg.refusal}` : "La respuesta no es JSON"] };
    }

    if (v.ok) return { valor: v.valor, modelo: r.model, intentos: intento, erroresPrevios };

    errores = v.errores;
    erroresPrevios.push(...errores.map((e) => `intento ${intento}: ${e}`));
    mensajes.push({ role: "assistant", content: contenido || "(vacío)" });
    mensajes.push({
      role: "user",
      content: `Tu respuesta no pasó la validación:\n- ${errores.join("\n- ")}\nDevuelve la respuesta completa corregida.`,
    });
  }
  throw new SalidaInvalidaError(errores, max);
}
