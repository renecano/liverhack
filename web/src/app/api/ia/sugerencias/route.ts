import { z } from "zod";
import { SalidaInvalidaError } from "@/lib/ia/llm";
import { esPrueba } from "@/lib/ia/prueba";
import { sugerenciasGuardadasDe, sugerirVacantesDeProceso } from "@/lib/ia/sugeridor";

// Sugerencias de vacantes para un candidato no seleccionado (agente 6).
// GET: lo guardado (sin regenerar). POST: sugiere y reemplaza las 'sugerida'
// anteriores; 'aceptada' y 'descartada' no se tocan.
export const maxDuration = 120;

const Cuerpo = z.object({ candidato_vacante_id: z.guid() });

export async function GET(req: Request) {
  const p = Cuerpo.safeParse({ candidato_vacante_id: new URL(req.url).searchParams.get("candidato_vacante_id") });
  if (!p.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const r = await sugerenciasGuardadasDe(p.data.candidato_vacante_id);
  if ("error" in r && r.error) return Response.json({ error: "Candidato no encontrado en esa vacante" }, { status: 404 });
  return Response.json(r);
}

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
    const r = await sugerirVacantesDeProceso(p.data.candidato_vacante_id, { id: null, rol: null }, { prueba: esPrueba(req) });
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
