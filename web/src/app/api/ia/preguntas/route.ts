import { z } from "zod";
import { SalidaInvalidaError } from "@/lib/ia/llm";
import { generarPreguntasParaCandidato, preguntasGuardadasDe } from "@/lib/ia/preguntas";
import { esPrueba } from "@/lib/ia/prueba";
import { TipoEntrevista } from "@/lib/ia/schemas";
import { NO_ENCONTRADO, ROLES, sesionIA, veCandidatoVacante } from "@/lib/ia/acceso";

// Preguntas de entrevista de un candidato_vacante (agente 3).
// GET: set guardado (sin regenerar). POST: genera, guarda (reemplaza el set del
// mismo tipo) y devuelve el resultado. Ambas exigen sesión y rol; la visibilidad
// del candidato la decide RLS con el cliente de sesión.
export const maxDuration = 120;

const Cuerpo = z.object({
  candidato_vacante_id: z.guid(),
  tipo: TipoEntrevista,
});

export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = Cuerpo.safeParse({ candidato_vacante_id: u.searchParams.get("candidato_vacante_id"), tipo: u.searchParams.get("tipo") });
  if (!p.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const s = await sesionIA(ROLES.verPreguntas);
  if (!s.ok) return s.respuesta;
  const r = await preguntasGuardadasDe(s.supabase, p.data.candidato_vacante_id, p.data.tipo);
  if ("error" in r) return Response.json({ error: "Candidato no encontrado en esa vacante" }, { status: 404 });
  return Response.json({ set: r.set });
}

export async function POST(req: Request) {
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return Response.json(
      { error: "Datos inválidos", detalles: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const s = await sesionIA(ROLES.generarIA);
  if (!s.ok) return s.respuesta;
  if (!(await veCandidatoVacante(s.supabase, p.data.candidato_vacante_id))) return NO_ENCONTRADO();
  try {
    // La generación escribe con el rol de servicio (HM no tiene permiso RLS de
    // escritura en preguntas_entrevista); el acceso ya se validó arriba con la sesión.
    const r = await generarPreguntasParaCandidato(p.data.candidato_vacante_id, p.data.tipo, s.actor, {
      prueba: esPrueba(req),
    });
    if ("error" in r && r.error) {
      const errores = {
        no_encontrado: [404, "Candidato no encontrado en esa vacante"],
        sin_ficha: [409, "El candidato aún no tiene ficha: corre primero el extractor"],
        manual: [409, "Ya hay un set de preguntas escrito a mano para este tipo; la IA no lo sobrescribe"],
      } as const;
      const [status, error] = errores[r.error];
      return Response.json({ error }, { status });
    }
    return Response.json({
      tipo: p.data.tipo,
      preguntas: r.salida.preguntas,
      persistido: r.persistido,
      ts: r.ts,
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
