import { z } from "zod";
import { esPrueba } from "@/lib/ia/prueba";
import { NO_ENCONTRADO, ROLES, sesionIA, veCandidatoVacante } from "@/lib/ia/acceso";
import { sugerenciasGuardadasDe, sugerirVacantesDeProceso } from "@/lib/ia/sugeridor";

// Sugerencias de vacantes para un candidato no seleccionado (agente 6).
// GET: lo guardado (sin regenerar). POST: sugiere y reemplaza las 'sugerida'
// anteriores; 'aceptada' y 'descartada' no se tocan.
export const maxDuration = 120;

const Cuerpo = z.object({ candidato_vacante_id: z.guid() });

export async function GET(req: Request) {
  const p = Cuerpo.safeParse({ candidato_vacante_id: new URL(req.url).searchParams.get("candidato_vacante_id") });
  if (!p.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const s = await sesionIA(ROLES.verCandidatos);
  if (!s.ok) return s.respuesta;
  const r = await sugerenciasGuardadasDe(s.supabase, p.data.candidato_vacante_id);
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
  const s = await sesionIA(ROLES.generarIA);
  if (!s.ok) return s.respuesta;
  if (!(await veCandidatoVacante(s.supabase, p.data.candidato_vacante_id))) return NO_ENCONTRADO();
  // Escribe con el rol de servicio (RLS solo deja escribir sugerencias a AT/admin y el
  // sugeridor debe leer TODAS las vacantes abiertas); el acceso ya se validó con la sesión.
  // sugerirVacantesDeProceso nunca lanza: toda falla llega como { ok: false, error }.
  const r = await sugerirVacantesDeProceso(p.data.candidato_vacante_id, { actor: s.actor, prueba: esPrueba(req) });
  if (r.ok) return Response.json(r);
  const HTTP: Record<typeof r.error, [number, string]> = {
    no_encontrado: [404, "Candidato no encontrado en esa vacante"],
    seleccionado: [409, "Solo se sugieren vacantes a candidatos no seleccionados (descartado o pool)"],
    sin_ficha: [409, "Aún no analizamos el CV de este candidato. Genera sus preguntas de entrevista (analiza el CV en el momento) o vuelve a cargar su CV."],
    sin_proceso_no_seleccionado: [409, "El candidato no tiene un proceso en descartado o pool"],
    salida_invalida: [422, "La IA no produjo motivos válidos; no se guardó nada."],
    timeout: [504, "La IA tardó demasiado; no se guardó nada."],
    interno: [500, "Error interno al sugerir vacantes"],
  };
  const [status, error] = HTTP[r.error];
  return Response.json({ error, codigo: r.error, detalle: r.detalle }, { status });
}
