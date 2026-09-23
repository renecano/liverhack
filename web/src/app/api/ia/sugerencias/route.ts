import { z } from "zod";
import { SalidaInvalidaError } from "@/lib/ia/llm";
import { sugerirVacantes } from "@/lib/ia/sugeridor";

// Sugiere otras vacantes a un candidato no seleccionado (agente 6).
// Mientras no exista la migración de sugerencias_vacante, NO se guardan.
export const maxDuration = 120;

const Cuerpo = z.object({ candidato_vacante_id: z.guid() });

export async function POST(req: Request) {
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return Response.json(
      { error: "Datos inválidos", detalles: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  try {
    // TODO(auth): tomar el actor de la sesión cuando Persona A publique el login.
    const r = await sugerirVacantes(p.data.candidato_vacante_id, { id: null, rol: null });
    if ("error" in r && r.error) {
      const errores = {
        no_encontrado: [404, "Candidato no encontrado en esa vacante"],
        seleccionado: [409, "Solo se sugieren vacantes a candidatos no seleccionados (descartado o pool)"],
        sin_ficha: [409, "El candidato aún no tiene ficha: corre primero el extractor"],
      } as const;
      const [status, error] = errores[r.error];
      return Response.json({ error }, { status });
    }
    return Response.json(r);
  } catch (err) {
    if (err instanceof SalidaInvalidaError) {
      return Response.json(
        { error: "La IA no produjo motivos válidos; no se guardó nada.", detalles: err.errores },
        { status: 422 },
      );
    }
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
