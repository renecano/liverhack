import "server-only";
import { openai } from "./openai";

// Embeddings para matching (docs/04 notas de implementación). La similitud se
// calcula en código: no hay pgvector ni cambios en la BD.
export const MODELO_EMBEDDINGS = "text-embedding-3-small";

export async function embeber(textos: string[], signal?: AbortSignal): Promise<{ vectores: number[][]; tokens: number }> {
  if (textos.length === 0) return { vectores: [], tokens: 0 };
  const r = await openai().embeddings.create({ model: MODELO_EMBEDDINGS, input: textos }, { signal });
  return { vectores: r.data.sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: r.usage?.total_tokens ?? 0 };
}

export function coseno(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
