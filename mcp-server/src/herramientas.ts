// Herramientas de LECTURA. Reusan la lógica de web/src (empaquetada por build.mjs):
//  - resumenVacantes (orquestador + motor de SLA): semáforo, días restantes, cobertura, quién bloquea.
//  - priorizar (agente 8, prioridad-hm.ts): mismo orden que el asistente del HM.
//  - reporteEquidad (agente 9, equidad.ts): tasas por grupo y regla 4/5.
// Las consultas extra (pool, decisiones, borradores) replican las de web/src/lib/actions.
// Ninguna escribe: solo select.
import { createAdminClient } from "@/lib/supabase/admin";
import { INFO_ESTADO, NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import { resumenVacantes, type ResumenVacante } from "@/lib/orquestador/resumen";
import { priorizar } from "@/lib/ia/prioridad-hm";
import { MUESTRA_MINIMA, reporteEquidad, type Dimension, type Grupo } from "@/lib/ia/equidad";
import type { EstatusVacante } from "@/lib/supabase/types";

const SEMAFORO: Record<string, string> = {
  a_tiempo: "A tiempo",
  en_riesgo: "En riesgo",
  atrasada: "ATRASADA",
  completada: "Completada",
  pendiente: "Pendiente",
};
const ESTATUS_VACANTE: Record<EstatusVacante, string> = { abierta: "abierta", en_proceso: "en proceso", cubierta: "cubierta", cancelada: "cancelada" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = () => createAdminClient();
function revisar<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}
const persona = (p: { nombre: string | null; rol: string | null } | null) => (p?.nombre ? `${p.nombre}${p.rol ? ` (${p.rol})` : ""}` : p?.rol ?? "—");
const dias = (n: number | null) => (n === null ? "—" : n < 0 ? `vencida hace ${Math.abs(n)} días hábiles` : `${n} días hábiles`);
// Para ilike: el texto del usuario se busca literal.
const literal = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function lineaVacante(v: ResumenVacante, i: number): string {
  return [
    `${i}. ${v.titulo}  [${SEMAFORO[v.semaforo] ?? v.semaforo}]`,
    `   Etapa: ${NOMBRE_ETAPA[v.etapa_actual]} · Estado: ${INFO_ESTADO[v.estado].descripcion}${v.esperando_hm ? " (espera decisión del HM)" : ""}`,
    `   Días restantes de la etapa: ${dias(v.dias_restantes)} · Cobertura estimada: ${v.fecha_estimada_cobertura ?? "—"}`,
    `   Responsable ahora: ${persona(v.responsable)}${v.bloquea ? ` · BLOQUEA: ${persona(v.bloquea)}` : ""}`,
    `   Estatus: ${ESTATUS_VACANTE[v.estatus]} · id: ${v.id}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// listar_vacantes
// ---------------------------------------------------------------------------
export type FiltroEstatus = "activas" | "todas" | EstatusVacante;

export async function listarVacantes(estatus: FiltroEstatus = "activas"): Promise<string> {
  const todas = await resumenVacantes({ incluirCerradas: estatus !== "activas" });
  const vacantes = estatus === "activas" || estatus === "todas" ? todas : todas.filter((v) => v.estatus === estatus);
  if (!vacantes.length) return `No hay vacantes con estatus "${estatus}".`;
  const conteo = (s: string) => vacantes.filter((v) => v.semaforo === s).length;
  return [
    `Vacantes (${estatus}): ${vacantes.length} · atrasadas ${conteo("atrasada")} · en riesgo ${conteo("en_riesgo")} · a tiempo ${conteo("a_tiempo")} · esperando al HM ${vacantes.filter((v) => v.esperando_hm).length}`,
    "",
    ...vacantes.map((v, i) => lineaVacante(v, i + 1)),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// estado_vacante
// ---------------------------------------------------------------------------
async function buscarVacante(tituloOId: string): Promise<{ id: string } | { mensaje: string }> {
  const q = tituloOId.trim();
  if (!q) return { mensaje: "Indica el título (o parte de él) o el id de la vacante." };
  if (UUID.test(q)) {
    const r = revisar<{ id: string }[]>(await db().from("vacantes").select("id").eq("id", q), "la vacante");
    return r.length ? { id: r[0].id } : { mensaje: `No existe una vacante con id ${q}.` };
  }
  const r = revisar<{ id: string; titulo: string; estatus: EstatusVacante }[]>(
    await db().from("vacantes").select("id, titulo, estatus").ilike("titulo", `%${literal(q)}%`).order("fecha_apertura", { ascending: false }),
    "vacantes",
  );
  const exacta = r.filter((v) => v.titulo.toLowerCase() === q.toLowerCase());
  if (exacta.length === 1) return { id: exacta[0].id };
  if (r.length === 1) return { id: r[0].id };
  if (!r.length) return { mensaje: `No encontré vacantes cuyo título contenga "${q}". Usa listar_vacantes para ver los títulos.` };
  return {
    mensaje: [`Hay ${r.length} vacantes que coinciden con "${q}"; indica cuál (título completo o id):`, ...r.map((v) => `- ${v.titulo} (${ESTATUS_VACANTE[v.estatus]}) · id: ${v.id}`)].join("\n"),
  };
}

export async function estadoVacante(tituloOId: string): Promise<string> {
  const encontrada = await buscarVacante(tituloOId);
  if ("mensaje" in encontrada) return encontrada.mensaje;
  const id = encontrada.id;

  const [[v], pool, decisiones] = await Promise.all([
    resumenVacantes({ ids: [id], incluirCerradas: true }),
    db()
      .from("candidato_vacante")
      .select("estatus, etapa, fit_score, compatibilidad_nnn, es_referido, candidatos(nombre, fuente)")
      .eq("vacante_id", id)
      .order("prioridad", { ascending: false })
      .order("fit_score", { ascending: false, nullsFirst: false }),
    db().from("decisiones").select("decision, justificacion, ts, candidatos(nombre), usuarios(nombre)").eq("vacante_id", id).order("ts", { ascending: false }),
  ]);
  if (!v) return "No pude leer el resumen de la vacante.";

  type FilaPool = { estatus: string; etapa: string; fit_score: number | null; compatibilidad_nnn: number | null; es_referido: boolean; candidatos: { nombre: string; fuente: string } | null };
  type FilaDecision = { decision: string; justificacion: string; ts: string; candidatos: { nombre: string } | null; usuarios: { nombre: string } | null };
  const candidatos = revisar<FilaPool[]>(pool as never, "los candidatos");
  const decs = revisar<FilaDecision[]>(decisiones as never, "las decisiones");

  const orden = ["finalista", "activo", "pool", "contratado", "descartado"];
  const porEstatus = orden
    .map((e) => ({ e, lista: candidatos.filter((c) => c.estatus === e) }))
    .filter((g) => g.lista.length)
    .map(({ e, lista }) => [
      `  ${e} (${lista.length}):`,
      ...lista.map(
        (c) =>
          `   - ${c.candidatos?.nombre ?? "—"}${c.es_referido ? " [referido]" : ""} · fit ${c.fit_score ?? "—"} · no negociables ${c.compatibilidad_nnn ?? "—"}% · etapa ${NOMBRE_ETAPA[c.etapa as keyof typeof NOMBRE_ETAPA] ?? c.etapa}`,
      ),
    ].join("\n"));

  const etapas = v.etapas.map(
    (e) => `  - ${NOMBRE_ETAPA[e.etapa]}: ${SEMAFORO[e.semaforo] ?? e.semaforo}${e.fecha_limite ? ` · límite ${e.fecha_limite}` : ""}${e.fecha_cierre ? ` · cerrada ${e.fecha_cierre}` : ""}${e.dueno ? ` · dueño ${e.dueno.nombre}` : ""}`,
  );

  return [
    `${v.titulo}  [${SEMAFORO[v.semaforo] ?? v.semaforo}] · ${ESTATUS_VACANTE[v.estatus]} · nivel ${v.nivel}`,
    `Etapa: ${NOMBRE_ETAPA[v.etapa_actual]} · Estado: ${INFO_ESTADO[v.estado].descripcion}${v.esperando_hm ? " (espera decisión del HM)" : ""}`,
    `Días restantes de la etapa: ${dias(v.dias_restantes)} · Cobertura estimada: ${v.fecha_estimada_cobertura ?? "—"}`,
    `Responsable ahora: ${persona(v.responsable)}${v.bloquea ? ` · BLOQUEA: ${persona(v.bloquea)}` : ""}`,
    `Responsables: HM ${v.directorio.hm ?? "—"} · AT ${v.directorio.at ?? "—"} · HRBP ${v.directorio.hrbp ?? "—"}`,
    "",
    "Etapas (SLA):",
    ...(etapas.length ? etapas : ["  (sin etapas registradas)"]),
    "",
    `Candidatos en el proceso: ${candidatos.length}`,
    ...(porEstatus.length ? porEstatus : ["  (ninguno)"]),
    "",
    `Decisiones tomadas: ${decs.length}`,
    ...(decs.length
      ? decs.map((d) => `  - ${d.ts.slice(0, 10)} · ${d.decision} · ${d.candidatos?.nombre ?? "—"} (por ${d.usuarios?.nombre ?? "—"}): ${d.justificacion}`)
      : ["  (ninguna)"]),
    "",
    `id: ${v.id}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// pendientes_hm
// ---------------------------------------------------------------------------
export async function pendientesHM(nombreHM: string): Promise<string> {
  const q = nombreHM.trim();
  const hms = revisar<{ id: string; nombre: string }[]>(
    await db().from("usuarios").select("id, nombre").eq("rol", "hm").eq("activo", true).ilike("nombre", `%${literal(q)}%`).order("nombre"),
    "los Hiring Managers",
  );
  if (hms.length !== 1) {
    const todos = revisar<{ nombre: string }[]>(await db().from("usuarios").select("nombre").eq("rol", "hm").eq("activo", true).order("nombre"), "los Hiring Managers");
    const lista = todos.map((u) => `- ${u.nombre}`).join("\n") || "(no hay HMs activos)";
    return hms.length
      ? `Hay ${hms.length} HMs que coinciden con "${q}"; indica el nombre completo:\n${hms.map((u) => `- ${u.nombre}`).join("\n")}`
      : `No encontré un Hiring Manager activo que coincida con "${q}". HMs activos:\n${lista}`;
  }
  const hm = hms[0];

  // Mismo cálculo que preguntarAsistente (web/src/lib/actions/asistente.ts) para un HM.
  const ids = revisar<{ id: string }[]>(await db().from("vacantes").select("id").eq("hm_id", hm.id), "las vacantes").map((v) => v.id);
  const vacantes = ids.length ? await resumenVacantes({ ids }) : [];
  const porDecidir: Record<string, number> = {};
  const enDecision = vacantes.filter((v) => v.estado === "ESPERANDO_HM_DECIDE_FINALISTA").map((v) => v.id);
  if (enDecision.length) {
    const filas = revisar<{ vacante_id: string }[]>(
      await db().from("candidato_vacante").select("vacante_id").in("vacante_id", enDecision).in("estatus", ["activo", "finalista"]),
      "los candidatos por decidir",
    );
    for (const f of filas) porDecidir[f.vacante_id] = (porDecidir[f.vacante_id] ?? 0) + 1;
  }
  let borradoresPendientes = 0;
  if (ids.length) {
    const r = await db()
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("estatus", "borrador")
      .eq("destinatario_tipo", "candidato")
      .in("vacante_id", ids);
    if (r.error) throw new Error(`No se pudieron leer los avisos: ${r.error.message}`);
    borradoresPendientes = r.count ?? 0;
  }

  const items = priorizar({ vacantes, porDecidir, borradoresPendientes });
  const esperando = vacantes.filter((v) => v.esperando_hm);
  if (!items.length) {
    return `${hm.nombre} no tiene pendientes urgentes: sus ${vacantes.length} vacantes activas van a tiempo y ninguna espera su decisión.`;
  }
  return [
    `Pendientes de ${hm.nombre}, por prioridad (${vacantes.length} vacantes activas; ${esperando.length} esperan su decisión):`,
    "",
    ...items.map((it, i) => `${i + 1}. ${it.titulo}\n   ${it.hechos}`),
    "",
    "Orden: 1) atrasada y esperando al HM, 2) requiere su decisión, 3) atrasada por otra persona, 4) avisos a candidatos por aprobar / en riesgo, 5) vence en ≤3 días hábiles.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// reporte_equidad
// ---------------------------------------------------------------------------
function lineaGrupo(g: Grupo): string {
  if (g.muestra_pequena) return `  - ${g.grupo}: ${g.postulaciones} postulaciones → muestra pequeña (sin porcentajes)`;
  const base = `  - ${g.grupo}: ${g.postulaciones} postulaciones · avanzó ${g.pct.avanzo}% · finalista ${g.pct.finalista}% · descartado ${g.pct.descartado}% · en proceso ${g.pct.en_proceso}%`;
  const lectura =
    g.resueltas < MUESTRA_MINIMA
      ? `pocos resultados aún (${g.resueltas} con resultado)`
      : g.posible_sesgo
        ? `POSIBLE SESGO: selección ${g.tasa_seleccion}% (${Math.round((g.razon_impacto ?? 0) * 100)}% del grupo que más avanza)`
        : g.razon_impacto !== null
          ? `sin diferencia notable (selección ${g.tasa_seleccion}%)`
          : `selección ${g.tasa_seleccion}%, sin otro grupo para comparar`;
  return `${base}\n      → ${lectura}`;
}

export async function reporteEquidadTexto(dimension?: Dimension, vacante?: string): Promise<string> {
  let vacanteId: string | undefined;
  if (vacante?.trim()) {
    const encontrada = await buscarVacante(vacante);
    if ("mensaje" in encontrada) return encontrada.mensaje;
    vacanteId = encontrada.id;
  }
  const r = await reporteEquidad({ vacanteId });
  if (!r.ok) return r.error;
  const { total, dimensiones } = r.reporte;
  const elegidas = dimension ? dimensiones.filter((d) => d.dimension === dimension) : dimensiones;
  const senales = dimensiones.flatMap((d) => d.grupos.filter((g) => g.posible_sesgo).map((g) => `${d.titulo} → ${g.grupo} (selección ${g.tasa_seleccion}%)`));
  const pct = (x: number) => (total.postulaciones < MUESTRA_MINIMA ? "—" : `${x}%`);
  return [
    `Reporte de equidad${vacanteId ? ` · ${r.vacantes.find((v) => v.id === vacanteId)?.titulo ?? vacanteId}` : " · todas las vacantes"}`,
    `Postulaciones: ${total.postulaciones} · candidatos: ${total.candidatos} · avanzó ${pct(total.pct.avanzo)} · finalista ${pct(total.pct.finalista)} · descartado ${pct(total.pct.descartado)}`,
    `Señales de posible sesgo: ${senales.length ? senales.join("; ") : "ninguna"}`,
    "",
    ...elegidas.flatMap((d) => [`${d.titulo} — ${d.descripcion}`, ...d.grupos.map(lineaGrupo), ""]),
    `Cómo leerlo: "selección" = avanzó / postulaciones con resultado (avanzó o descartado). Regla 4/5: se señala un grupo cuya selección es menor al 80% de la del grupo que más avanza, solo entre grupos con al menos ${MUESTRA_MINIMA} resultados. Grupos con menos de ${MUESTRA_MINIMA} postulaciones no muestran porcentajes. Solo agregados; ningún dato individual.`,
    "Con datos de prueba las cifras son ilustrativas; con el histórico real de Liverpool el reporte detecta sesgos por factor.",
  ].join("\n");
}
