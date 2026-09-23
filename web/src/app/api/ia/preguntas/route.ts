import { z } from "zod";
import { SalidaInvalidaError } from "@/lib/ia/llm";
import { generarPreguntasParaCandidato } from "@/lib/ia/preguntas";
import { TipoEntrevista } from "@/lib/ia/schemas";

// Genera preguntas de entrevista para un candidato_vacante (agente 3).
// Mientras no exista la migración de preguntas_entrevista, NO se guardan:
// la respuesta trae persistido=false y la UI muestra el resultado de la llamada.
export const maxDuration = 120;

const Cuerpo = z.object({
  candidato_vacante_id: z.guid(),
  tipo: TipoEntrevista,
});

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
    const r = await generarPreguntasParaCandidato(p.data.candidato_vacante_id, p.data.tipo, { id: null, rol: null });
    if ("error" in r) {
      return r.error === "no_encontrado"
        ? Response.json({ error: "Candidato no encontrado en esa vacante" }, { status: 404 })
        : Response.json({ error: "El candidato aún no tiene ficha: corre primero el extractor" }, { status: 409 });
    }
    return Response.json({
      tipo: p.data.tipo,
      preguntas: r.salida.preguntas,
      persistido: r.persistido,
      modelo: r.salida.modelo,
      intentos: r.salida.intentos,
    });
  } catch (err) {
    if (err instanceof SalidaInvalidaError) {
      return Response.json(
        { error: "La IA no produjo preguntas válidas; no se guardó nada.", detalles: err.errores },
        { status: 422 },
      );
    }
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
