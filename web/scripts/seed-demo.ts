// seed:demo — deja "Gerente de Proyectos E-commerce" (V1) en la compuerta
// ESPERANDO_HM_DECIDE_FINALISTA, con pool listo, para que el HM tome una decisión
// real en la demo (elegir finalista con justificación).
//
//   cd web && npm run seed:demo
//
// Usa el orquestador (avanzarEtapa / confirmarPasoHM) — NUNCA un UPDATE directo, para
// respetar el CHECK estado/etapa/estatus y dejar traza en audit_log. Es idempotente:
// si ya está en la compuerta no avanza, y solo asegura el pool si falta. Solo toca
// esta vacante; no borra nada.

import { createAdminClient } from "@/lib/supabase/admin";
import { avanzarEtapa, confirmarPasoHM } from "@/lib/orquestador/maquina";
import type { EstadoProceso } from "@/lib/supabase/types";

const V1 = "33333333-3333-3333-3333-000000000001";
const OBJETIVO: EstadoProceso = "ESPERANDO_HM_DECIDE_FINALISTA";

// Estados iguales o posteriores al objetivo: no se retrocede ni se toca.
const POSTERIORES: EstadoProceso[] = ["OFERTA_EN_CURSO", "CUBIERTA", "CANCELADA"];

// Justificaciones de ejemplo para cada compuerta general del HM.
const JUSTIFICACIONES: Partial<Record<EstadoProceso, string>> = {
  ESPERANDO_HM_VALIDA_NNN: "Demo: no negociables validados (licenciatura, inglés B2, liderazgo de 5+).",
  ESPERANDO_HM_SELECCIONA_PERFILES: "Demo: perfiles de interés confirmados con Atracción de Talento.",
  ESPERANDO_HM_DEFINE_POOL: "Demo: pool definido; el pool pasa a la etapa de selección.",
};

// Pool semilla (ids de supabase/seed.sql) por si la vacante no tuviera candidatos.
const ANA = "55555555-5555-5555-5555-000000000001"; // Ana López
const POOL_SEED: { candidato_id: string; estatus: "activo" | "finalista" }[] = [
  { candidato_id: ANA, estatus: "finalista" }, // Ana López
  { candidato_id: "55555555-5555-5555-5555-000000000007", estatus: "activo" }, // Fernanda Morales
  { candidato_id: "55555555-5555-5555-5555-000000000005", estatus: "activo" }, // Laura Jiménez
];

const db = createAdminClient();

type FilaPool = { candidato_id: string; estatus: string; candidatos: { nombre: string } | { nombre: string }[] | null };

/** Candidatos de V1 que el HM puede comparar (activo/finalista), con nombre. */
async function leerPool(): Promise<{ candidato_id: string; estatus: string; nombre: string }[]> {
  const { data, error } = await db
    .from("candidato_vacante")
    .select("candidato_id, estatus, candidatos(nombre)")
    .eq("vacante_id", V1)
    .in("estatus", ["activo", "finalista"]);
  if (error) throw new Error(`leer pool: ${error.message}`);
  return ((data ?? []) as FilaPool[]).map((r) => ({
    candidato_id: r.candidato_id,
    estatus: r.estatus,
    nombre: Array.isArray(r.candidatos) ? r.candidatos[0]?.nombre ?? "?" : r.candidatos?.nombre ?? "?",
  }));
}

/** Garantiza que haya pool (y que Ana López esté) para la comparación del HM. */
async function asegurarPool(): Promise<void> {
  let pool = await leerPool();
  if (pool.length === 0) {
    console.log("Pool sin candidatos comparables: asignando el pool semilla…");
    const { error } = await db.from("candidato_vacante").upsert(
      POOL_SEED.map((p) => ({ candidato_id: p.candidato_id, vacante_id: V1, etapa: "seleccion", estatus: p.estatus })),
      { onConflict: "candidato_id,vacante_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`asignar pool: ${error.message}`);
    pool = await leerPool();
  } else if (!pool.some((c) => c.candidato_id === ANA)) {
    console.log("Pool sin Ana López: agregándola para la comparación…");
    const { error } = await db.from("candidato_vacante").upsert(
      [{ candidato_id: ANA, vacante_id: V1, etapa: "seleccion", estatus: "finalista" }],
      { onConflict: "candidato_id,vacante_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`asignar Ana López: ${error.message}`);
    pool = await leerPool();
  }
  console.log(`Pool de ${pool.length} candidato(s) para comparar:`);
  for (const c of pool) console.log(`  · ${c.nombre} — ${c.estatus}`);
  if (!pool.some((c) => c.candidato_id === ANA)) console.warn("  ⚠ Ana López no aparece en el pool.");
}

async function main() {
  const { data: vac, error } = await db
    .from("vacantes")
    .select("id, titulo, hm_id, at_id, estado_proceso")
    .eq("id", V1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!vac) throw new Error(`No existe la vacante ${V1}`);

  const hmId = vac.hm_id as string | null;
  const atId = vac.at_id as string | null;
  let estado = vac.estado_proceso as EstadoProceso;
  console.log(`Vacante "${vac.titulo}" — estado actual: ${estado}`);

  if (POSTERIORES.includes(estado)) {
    console.log(`Está en ${estado} (igual o posterior al objetivo). No se toca.`);
    return;
  }

  if (estado === OBJETIVO) {
    console.log(`Ya está en ${OBJETIVO} (idempotente): no se avanza.`);
  } else {
    if (!hmId) throw new Error("La vacante no tiene hm_id; no puedo cruzar sus compuertas.");
    const ctxAT = { db, actor: { id: atId, rol: "at" as const } };
    const ctxHM = { db, actor: { id: hmId, rol: "hm" as const } };
    let pasos = 0;
    while (estado !== OBJETIVO) {
      if (pasos++ > 12) throw new Error(`Demasiados pasos; estado atascado en ${estado}`);
      if (estado.startsWith("ESPERANDO_HM_")) {
        const just = JUSTIFICACIONES[estado] ?? "Demo: compuerta confirmada por el HM.";
        const r = await confirmarPasoHM(V1, hmId, just, ctxHM);
        console.log(`✔ confirmarPasoHM  ${r.estado_anterior} → ${r.estado_nuevo}`);
        estado = r.estado_nuevo;
      } else {
        const r = await avanzarEtapa(V1, ctxAT);
        console.log(`✔ avanzarEtapa     ${r.estado_anterior} → ${r.estado_nuevo}`);
        estado = r.estado_nuevo;
      }
    }
    console.log(`→ "${vac.titulo}" quedó en ${estado}.`);
  }

  // Pool para que el HM compare finalistas (Ana López incluida).
  await asegurarPool();

  console.log(`\nListo: la vacante está en ${OBJETIVO} con pool. El HM ya puede decidir en vivo.`);
}

main().catch((e) => {
  console.error("\n✖ seed:demo falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
