import "server-only";
import OpenAI from "openai";

// gpt-4.1 acepta temperature=0 y structured outputs (los gpt-5.x de razonamiento
// no aceptan temperature). Se puede cambiar con OPENAI_MODEL sin tocar código.
export const MODELO_EXTRACCION = process.env.OPENAI_MODEL ?? "gpt-4.1";

let cliente: OpenAI | null = null;

export function openai(): OpenAI {
  if (cliente) return cliente;
  if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
  cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cliente;
}
