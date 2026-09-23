// seed:demo — deja "Gerente de Proyectos E-commerce" (V1) en la compuerta
// ESPERANDO_HM_DECIDE_FINALISTA para que el HM tenga una decisión real en la demo.
//
//   cd web && npm run seed:demo
//
// Usa el orquestador (avanzarEtapa / confirmarPasoHM) — NUNCA un UPDATE directo, para
// respetar el CHECK estado/etapa/estatus y dejar traza en audit_log. Es idempotente:
// si ya está en la compuerta (o más allá), no hace nada. Solo AVANZA esta vacante; no
// borra ni toca ninguna otra.

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

const db = createAdminClient();

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

  if (estado === OBJETIVO) {
    console.log(`Ya está en ${OBJETIVO}. Nada que hacer (idempotente).`);
    return;
  }
  if (POSTERIORES.includes(estado)) {
    console.log(`Está en ${estado} (igual o posterior al objetivo). No se toca.`);
    return;
  }
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

  console.log(`\nListo: "${vac.titulo}" quedó en ${estado}. El HM ya puede decidir en vivo.`);
}

main().catch((e) => {
  console.error("\n✖ seed:demo falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
