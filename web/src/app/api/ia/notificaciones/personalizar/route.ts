import { z } from "zod";
import { personalizarBorrador, personalizarSimulado, type ErrorPersonalizar } from "@/lib/ia/notificaciones";
import { esPrueba } from "@/lib/ia/prueba";
import { ROLES, sesionIA } from "@/lib/ia/sesion";

// Agente 5: reescribe con IA el texto de borradores que creó el orquestador.
// { id } o { ids: [...] } (máx. 50). dry_run: genera y valida sin actualizar la fila.
// `simulado` (borrador en memoria, sin fila) solo se acepta con dry_run: true.
export const maxDuration = 300;

const Cuerpo = z
  .object({
    id: z.guid().optional(),
    ids: z.array(z.guid()).min(1).max(50).optional(),
    dry_run: z.boolean().default(false),
    simulado: z
      .object({
        candidato_id: z.guid(),
        vacante_id: z.guid(),
        tipo: z.enum(["cambio_etapa", "resultado"]),
        contenido: z.string().min(1),
      })
      .optional(),
  })
  .refine((b) => Boolean(b.id) || Boolean(b.ids?.length) || Boolean(b.simulado), { message: "Indica id, ids o simulado" })
  .refine((b) => !b.simulado || b.dry_run, { message: "simulado solo se permite con dry_run: true" });

const HTTP: Record<ErrorPersonalizar, [number, string]> = {
  no_encontrada: [404, "Notificación no encontrada"],
  salida_invalida: [422, "La IA no produjo un mensaje válido; no se modificó nada."],
  timeout: [504, "La IA tardó demasiado; no se modificó nada."],
  interno: [500, "Error interno al personalizar"],
  no_es_candidato: [422, "Solo se personalizan avisos a candidatos"],
  tipo_no_soportado: [422, "Solo se personalizan avisos de cambio_etapa o resultado"],
  sin_vacante: [422, "El aviso no está ligado a una vacante"],
  no_es_borrador: [409, "La notificación ya no está en borrador (aprobada o enviada); no se modifica"],
  sin_contexto: [422, "No hay ficha del candidato para esa vacante"],
};

export async function POST(req: Request) {
  const s = await sesionIA(ROLES.personalizarNotificaciones);
  if (!s.ok) return s.respuesta;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    return Response.json({ error: "Datos inválidos", detalles: p.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const { id, ids, dry_run, simulado } = p.data;
  const prueba = esPrueba(req);
  const actor = s.actor;
  // ¿Ve el usuario esta notificación? Lo decide RLS (notificaciones_select) con la sesión.
  const visible = async (nid: string) =>
    Boolean((await s.supabase.from("notificaciones").select("id").eq("id", nid).maybeSingle()).data);

  // personalizarBorrador / personalizarSimulado nunca lanzan: toda falla llega como { ok: false }.
  const ejecutar = async (fn: () => ReturnType<typeof personalizarBorrador>, clave: string | null) => {
    const r = await fn();
    if (!r.ok) {
      const [status, error] = HTTP[r.error];
      return { id: clave, ok: false, status, error, codigo: r.error, detalle: r.detalle };
    }
    return {
        id: clave,
        ok: true,
        status: 200,
        actualizado: r.actualizado,
        tono: r.resultado.tono,
        palabras: r.resultado.palabras,
        intentos: r.resultado.intentos,
        fortalezas: r.resultado.fortalezas,
        mensaje: r.resultado.mensaje,
    };
  };

  if (simulado) {
    // Herramienta de desarrollo (borrador en memoria): solo admin.
    if (actor.rol !== "admin") {
      return Response.json({ error: "simulado solo está disponible para admin", codigo: "NO_AUTORIZADO" }, { status: 403 });
    }
    const r = await ejecutar(
      () =>
        personalizarSimulado(
          { candidatoId: simulado.candidato_id, vacanteId: simulado.vacante_id, tipo: simulado.tipo, contenidoBase: simulado.contenido },
          { prueba, actor },
        ),
      null,
    );
    return Response.json(r, { status: r.status });
  }

  const lista = [...new Set(ids ?? [id!])];
  const resultados = [];
  for (const nid of lista) {
    if (!(await visible(nid))) {
      resultados.push({ id: nid, ok: false, status: 404, error: "Notificación no encontrada", codigo: "no_encontrada" });
      continue;
    }
    // Escribe con el rol de servicio (UPDATE condicionado a estatus='borrador').
    resultados.push(await ejecutar(() => personalizarBorrador(nid, { dryRun: dry_run, prueba, actor }), nid));
  }
  if (lista.length === 1) return Response.json(resultados[0], { status: resultados[0].status });
  return Response.json({ dry_run, resultados });
}
