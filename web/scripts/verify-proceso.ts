// Verificación del dominio Proceso contra la base hosted (sin UI).
//
//   cd web && npm run verify:proceso              # corre y limpia la vacante de prueba
//   cd web && npm run verify:proceso -- --conservar   # la deja para inspeccionarla
//
// Requiere web/.env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//
// Qué hace:
//  1. Resumen de las vacantes del seed (solo lectura): etapa, estado, semáforo, días
//     restantes, cobertura estimada y quién bloquea; detalle por etapa de una vacante.
//  2. Candado: intenta abrir una vacante sobre la posición NO autorizada del seed.
//  3. Abre una vacante de prueba "[VERIFY] ..." (no toca las vacantes del seed), le
//     asigna 2 candidatos del seed y la recorre: avanza, choca con ESPERANDO_HM_*, prueba
//     justificación vacía, confirma compuertas, descarta a uno y elige finalista.
//  4. detectarAtrasos() sobre todas las vacantes (alertas en borrador, sin duplicar).
//  5. Imprime audit_log y las notificaciones borrador generadas en esta corrida.
//  6. Limpieza (salvo --conservar): cancela la vacante de prueba y borra sus borradores.
//     audit_log y decisiones quedan (append-only / inmutables).

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLog, Notificacion } from "@/lib/supabase/types";
import { hoyISO } from "@/lib/sla/dias-habiles";
import { detectarAtrasos } from "@/lib/sla/motor";
import {
  ErrorProceso,
  abrirVacante,
  avanzarEtapa,
  confirmarPasoHM,
  registrarDecision,
  type ResultadoCambio,
} from "@/lib/orquestador/maquina";
import { resumenVacantes, type ResumenVacante } from "@/lib/orquestador/resumen";
import { registrarAudit, revisar } from "@/lib/orquestador/persistencia";

// IDs del seed (supabase/seed.sql)
const HM = "11111111-1111-1111-1111-111111111101"; // Aileen Vargas
const AT = "11111111-1111-1111-1111-111111111102"; // Daniela Rios
const HRBP = "11111111-1111-1111-1111-111111111103"; // Monica Salinas
const POSICION_MARKETING = "22222222-2222-2222-2222-000000000007"; // autorizada, medio
const POSICION_NO_AUTORIZADA = "22222222-2222-2222-2222-000000000099";
const V1 = "33333333-3333-3333-3333-000000000001"; // Selección, pool listo
const LAURA = "55555555-5555-5555-5555-000000000005"; // Marketing Digital
const OSCAR = "55555555-5555-5555-5555-000000000010"; // Becario QA

const conservar = process.argv.includes("--conservar");
const db = createAdminClient();
const hoy = hoyISO();

const titulo = (t: string) => console.log(`\n${"=".repeat(78)}\n${t}\n${"=".repeat(78)}`);
const pad = (s: unknown, n: number) => String(s ?? "—").padEnd(n).slice(0, n);

function lineaVacante(r: ResumenVacante) {
  console.log(
    `${pad(r.titulo, 34)} ${pad(r.etapa_actual, 11)} ${pad(r.estado, 32)} ` +
      `${pad(`${r.semaforo}/${r.color}`, 20)} ${pad(r.dias_restantes, 4)} ` +
      `${pad(r.fecha_estimada_cobertura, 10)}  ${r.bloquea ? `BLOQUEA ${r.bloquea.nombre} (${r.bloquea.rol})` : `resp. ${r.responsable.nombre ?? "—"}`}`,
  );
}

function detalleEtapas(r: ResumenVacante) {
  console.log(`\n"${r.titulo}" — estado ${r.estado}${r.esperando_hm ? " (ESPERANDO AL HM)" : ""}`);
  console.log(`Directorio: HM ${r.directorio.hm} · AT ${r.directorio.at} · HRBP ${r.directorio.hrbp}`);
  console.log(`${pad("etapa", 12)} ${pad("semáforo", 20)} ${pad("inicio", 11)} ${pad("límite", 11)} ${pad("cierre", 11)} ${pad("días", 5)} dueño`);
  for (const e of r.etapas) {
    console.log(
      `${pad(e.etapa, 12)} ${pad(`${e.semaforo}/${e.color}`, 20)} ${pad(e.fecha_inicio, 11)} ` +
        `${pad(e.fecha_limite, 11)} ${pad(e.fecha_cierre, 11)} ${pad(e.dias_restantes, 5)} ${e.dueno?.nombre ?? "—"}`,
    );
  }
  console.log(
    `Fecha estimada de cobertura: ${r.fecha_estimada_cobertura} ` +
      `(${r.dias_habiles_para_cobertura} días hábiles desde hoy ${hoy})`,
  );
}

function paso(etiqueta: string, r: ResultadoCambio) {
  console.log(
    `✔ ${pad(etiqueta, 30)} ${r.estado_anterior} → ${r.estado_nuevo}` +
      `${r.esperando_hm ? "  [se detiene: compuerta del HM]" : ""}  (+${r.notificaciones.length} borradores)`,
  );
}

async function esperaError(etiqueta: string, codigo: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    throw new Error(`FALLA: "${etiqueta}" debía rechazarse con ${codigo}`);
  } catch (e) {
    if (e instanceof ErrorProceso && e.codigo === codigo) {
      console.log(`✔ ${pad(etiqueta, 30)} rechazado → ${e.message}`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const inicio = new Date().toISOString();
  console.log(`verify:proceso — hoy (America/Mexico_City) = ${hoy}${conservar ? " — modo --conservar" : ""}`);

  // 1. Seed: resumen (solo lectura)
  titulo("1. Vacantes del seed — etapa, estado, semáforo, días restantes, cobertura, quién bloquea");
  const seed = (await resumenVacantes({ db, hoy })).filter((r) => !r.titulo.startsWith("[VERIFY]"));
  console.log(`${pad("vacante", 34)} ${pad("etapa", 11)} ${pad("estado", 32)} ${pad("semáforo", 20)} ${pad("días", 4)} ${pad("cobertura", 10)}  quién`);
  seed.forEach(lineaVacante);
  const v1 = seed.find((r) => r.id === V1);
  if (v1) detalleEtapas(v1);

  // 2. Candado
  titulo("2. Candado de posición");
  await esperaError("abrir posición NO autorizada", "CANDADO_POSICION", () =>
    abrirVacante(
      { posicion_id: POSICION_NO_AUTORIZADA, titulo: "Director de Innovacion", hm_id: HM, hrbp_id: HRBP, at_id: AT },
      { db, hoy },
    ),
  );

  // 3. Vacante de prueba: recorrido con gobernanza
  titulo("3. Vacante de prueba: apertura → etapas → compuertas del HM → decisiones");
  const { vacante } = await abrirVacante(
    {
      posicion_id: POSICION_MARKETING,
      titulo: `[VERIFY] Especialista Marketing Digital ${new Date().toISOString().slice(11, 19)}`,
      descripcion: "Vacante creada por scripts/verify-proceso.ts",
      rango_salarial_min: 35000,
      rango_salarial_max: 45000,
      hm_id: HM,
      hrbp_id: HRBP,
      at_id: AT,
    },
    { db, hoy },
  );
  console.log(`✔ abrirVacante → ${vacante.id} (nivel ${vacante.nivel}), REQUISICION_EN_CURSO`);
  detalleEtapas((await resumenVacantes({ db, ids: [vacante.id], hoy }))[0]);

  revisar(
    await db.from("candidato_vacante").insert([
      { candidato_id: LAURA, vacante_id: vacante.id, etapa: "requisicion", fit_score: 89 },
      { candidato_id: OSCAR, vacante_id: vacante.id, etapa: "requisicion", fit_score: 60 },
    ]),
    "asignar candidatos",
  );
  console.log("✔ candidatos asignados: Laura Jimenez, Oscar Paredes\n");

  const actorAT = { db, hoy, actor: { id: AT, rol: "at" as const } };
  const actorHRBP = { db, hoy, actor: { id: HRBP, rol: "hrbp" as const } };
  const ctxHM = { db, hoy };

  paso("avanzarEtapa (HRBP)", await avanzarEtapa(vacante.id, actorHRBP));
  await esperaError("avanzarEtapa otra vez", "ESPERANDO_HM", () => avanzarEtapa(vacante.id, actorAT));
  await esperaError("decisión sin justificación", "JUSTIFICACION_OBLIGATORIA", () =>
    registrarDecision(vacante.id, OSCAR, HM, "descartado", "   ", ctxHM),
  );
  await esperaError("finalista fuera de compuerta", "TRANSICION_INVALIDA", () =>
    registrarDecision(vacante.id, LAURA, HM, "finalista", "Muy buen perfil", ctxHM),
  );
  paso("confirmarPasoHM (valida NNN)", await confirmarPasoHM(vacante.id, HM, "No negociables validados: SEM/SEO, analítica, presupuesto.", ctxHM));
  paso("avanzarEtapa (AT)", await avanzarEtapa(vacante.id, actorAT));
  paso("confirmarPasoHM (perfiles)", await confirmarPasoHM(vacante.id, HM, "Perfiles de interés: performance + analítica.", ctxHM));
  paso("avanzarEtapa (AT)", await avanzarEtapa(vacante.id, actorAT));
  paso("avanzarEtapa (AT)", await avanzarEtapa(vacante.id, actorAT));
  paso("confirmarPasoHM (pool)", await confirmarPasoHM(vacante.id, HM, "Pasan Laura y Oscar a entrevistas.", ctxHM));
  paso("avanzarEtapa (AT)", await avanzarEtapa(vacante.id, actorAT));

  const desc = await registrarDecision(vacante.id, OSCAR, HM, "descartado",
    "Perfil junior; el puesto requiere 5+ años gestionando presupuesto de pauta.", ctxHM);
  console.log(`✔ ${pad("registrarDecision descartado", 30)} Oscar → ${desc.estatus_candidato}; vacante sigue en ${desc.estado_vacante}`);
  const fin = await registrarDecision(vacante.id, LAURA, HM, "finalista",
    "Mejor dominio de SEM/SEO y analítica; entrevistas recomendadas por ambos panelistas.", ctxHM);
  console.log(`✔ ${pad("registrarDecision finalista", 30)} Laura → ${fin.estatus_candidato}; vacante → ${fin.estado_vacante} (decisión ${fin.decision.id})`);

  detalleEtapas((await resumenVacantes({ db, ids: [vacante.id], hoy }))[0]);

  // 4. Alertas SLA
  titulo("4. detectarAtrasos() — recordatorios/escalaciones en borrador");
  const alertas = await detectarAtrasos(db, hoy);
  if (alertas.length === 0) console.log("(sin etapas en riesgo ni atrasadas)");
  for (const a of alertas) {
    console.log(
      `${pad(a.estatus, 10)} ${pad(a.titulo, 34)} ${pad(a.etapa, 11)} días ${pad(a.dias_restantes, 4)} ` +
        `bloquea ${a.bloquea.nombre} (${a.bloquea.rol}) → ${a.notificacion ? `${a.notificacion.tipo} creada` : "ya existía hoy"}`,
    );
  }

  // 5. audit_log + notificaciones de esta corrida
  titulo("5. audit_log (últimas entradas de esta corrida)");
  const audit = revisar<AuditLog[]>(
    await db.from("audit_log").select("*").gte("ts", inicio).order("ts", { ascending: true }),
    "audit_log",
  );
  console.log(`${audit.length} entradas nuevas; se muestran las que no son generar_notificacion_borrador:`);
  for (const a of audit.filter((a) => a.accion !== "generar_notificacion_borrador")) {
    const d = a.detalle as Record<string, unknown>;
    const resumen =
      a.accion === "cambio_estado" ? `${d.estado_anterior} → ${d.estado_nuevo}`
      : "justificacion" in d ? `"${d.justificacion}"`
      : JSON.stringify(d).slice(0, 90);
    console.log(`${a.ts.slice(11, 19)} ${pad(a.actor_rol ?? "sistema", 8)} ${pad(a.accion, 30)} ${pad(a.entidad, 18)} ${resumen}${a.decision_id ? " [decision_id]" : ""}`);
  }

  titulo("   Notificaciones en BORRADOR generadas en esta corrida");
  const notifs = revisar<Notificacion[]>(
    await db.from("notificaciones").select("*").gte("ts", inicio).eq("estatus", "borrador").order("ts"),
    "notificaciones",
  );
  for (const n of notifs) {
    console.log(`[${n.tipo}/${n.destinatario_tipo}/${n.canal}] ${n.contenido}`);
  }
  console.log(`Total: ${notifs.length} borradores (${notifs.filter((n) => n.destinatario_tipo === "candidato").length} a candidatos)`);

  // 6. Limpieza
  titulo("6. Limpieza");
  if (conservar) {
    console.log(`--conservar: la vacante de prueba ${vacante.id} queda en OFERTA_EN_CURSO.`);
    return;
  }
  await registrarAudit(db, { id: null, rol: null }, "cancelar_vacante_verify", "vacantes", vacante.id, {
    motivo: "limpieza de scripts/verify-proceso.ts",
  });
  revisar(await db.from("vacantes").update({ estatus: "cancelada" }).eq("id", vacante.id), "cancelar");
  revisar(await db.from("notificaciones").delete().eq("vacante_id", vacante.id).eq("estatus", "borrador"), "borradores");
  revisar(await db.from("candidato_vacante").delete().eq("vacante_id", vacante.id), "candidato_vacante");
  console.log(
    `Vacante de prueba cancelada; sus borradores y fichas borrados. ` +
      `audit_log y decisiones se conservan (append-only). Las alertas del paso 4 sobre el seed se quedan.`,
  );
}

main().catch((e) => {
  console.error("\n✖ verify:proceso falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
