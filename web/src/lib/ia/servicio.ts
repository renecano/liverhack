import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerFicha, VERSION_PROMPT, type SalidaExtractor } from "./extractor";

// Capa de persistencia del agente 2. Frontera con Persona A (docs/06):
// aquí SOLO se escriben ficha, fit_score, compatibilidad_nnn y
// cumple_no_negociables de candidato_vacante; etapa/estatus son de A.

export const BUCKET_CV = "cv";

export type Actor = { id: string | null; rol: "hm" | "at" | "hrbp" | "entrevistador" | "admin" | null };

// prueba: la corrida viene de un script de test/dev (ver lib/ia/prueba.ts).
export type OpcionesAudit = { prueba?: boolean };

export async function registrarAudit(params: {
  actor: Actor;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, unknown>;
  prueba?: boolean;
}) {
  const { error } = await createAdminClient()
    .from("audit_log")
    .insert({
      actor_id: params.actor.id,
      actor_rol: params.actor.rol,
      accion: params.accion,
      entidad: params.entidad,
      entidad_id: params.entidad_id,
      detalle: params.prueba ? { ...params.detalle, prueba: true } : params.detalle,
    });
  if (error) throw new Error(`audit_log: ${error.message}`);
}

// Para funciones que no deben lanzar: si el audit falla, se reporta en consola
// y se devuelve false; la operación principal no se cae por eso.
export async function registrarAuditSeguro(params: Parameters<typeof registrarAudit>[0]): Promise<boolean> {
  try {
    await registrarAudit(params);
    return true;
  } catch (err) {
    console.error("[ia] no se pudo escribir audit_log:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function textoDePdf(pdf: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  try {
    const r = await parser.getText();
    return r.text;
  } finally {
    await parser.destroy();
  }
}

// Storage de CVs. El bucket "cv" es infraestructura de Persona A (ya existe en
// el proyecto hosted); aquí solo se sube/lee. cv_url sigue la convención del
// seed: "<bucket>/<ruta>".
export function rutaStorage(cvUrl: string): { bucket: string; ruta: string } | null {
  const i = cvUrl.indexOf("/");
  if (i <= 0) return null;
  return { bucket: cvUrl.slice(0, i), ruta: cvUrl.slice(i + 1) };
}

export async function descargarCv(cvUrl: string): Promise<Uint8Array | null> {
  const r = rutaStorage(cvUrl);
  if (!r) return null;
  const { data, error } = await createAdminClient().storage.from(r.bucket).download(r.ruta);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function contextoVacante(vacanteId: string) {
  const sb = createAdminClient();
  const [v, nn] = await Promise.all([
    sb.from("vacantes").select("id, titulo, descripcion").eq("id", vacanteId).single(),
    sb.from("no_negociables").select("id, texto, tipo").eq("vacante_id", vacanteId).order("id"),
  ]);
  if (v.error || !v.data) throw new Error(`Vacante ${vacanteId} no encontrada`);
  if (nn.error) throw new Error(nn.error.message);
  return { vacante: v.data, noNegociables: nn.data ?? [] };
}

function detalleAudit(s: SalidaExtractor) {
  return {
    agente: "extractor_comparador",
    prompt: VERSION_PROMPT,
    modelo: s.modelo,
    intentos: s.intentos,
    errores_intentos_previos: s.erroresPrevios,
    temperature: 0,
    fit_score: s.resultado.fit_score,
    fit_fuente: s.fitFuente,
    compatibilidad_nnn: s.resultado.compatibilidad_nnn,
    semaforo: s.resultado.cumple_no_negociables.map((c) => c.estado),
    evaluacion_ciega: { campos_ocultados: s.ocultados },
  };
}

// ---------------------------------------------------------------------------
// Carga NUEVA (AT): CV + evaluación → la IA llena la ficha → se guarda.
// La extracción corre ANTES de insertar: si no valida, no queda nada a medias.
// ---------------------------------------------------------------------------
export interface EntradaCarga {
  vacanteId: string;
  candidato: {
    nombre: string;
    email: string;
    telefono?: string | null;
    fuente: "bolsa" | "referido" | "aira" | "directo";
    puesto_actual?: string | null;
    empresa_actual?: string | null;
    compensacion_actual?: number | null;
    compensacion_deseada?: number | null;
  };
  cvPdf?: Uint8Array | null;
  cvTexto?: string | null;
  evaluacion?: { tipo: "assessfirst" | "psicometrica" | "otra"; resumen: string } | null;
  actor: Actor;
  prueba?: boolean;
}

export async function procesarCarga(entrada: EntradaCarga) {
  const sb = createAdminClient();
  const cvTexto = entrada.cvPdf ? await textoDePdf(entrada.cvPdf) : (entrada.cvTexto ?? "");
  if (!cvTexto.trim()) throw new Error("No se pudo leer texto del CV");

  const { vacante, noNegociables } = await contextoVacante(entrada.vacanteId);
  const evaluaciones = entrada.evaluacion?.resumen.trim() ? [entrada.evaluacion] : [];

  const salida = await extraerFicha({
    nombreCandidato: entrada.candidato.nombre,
    cvTexto,
    evaluaciones,
    vacante,
    noNegociables,
  });
  const r = salida.resultado;

  const cand = await sb
    .from("candidatos")
    .insert({ ...entrada.candidato, escolaridad: r.escolaridad })
    .select("id")
    .single();
  if (cand.error) throw new Error(`candidatos: ${cand.error.message}`);
  const candidatoId: string = cand.data.id;

  try {
    let cvUrl: string | null = null;
    if (entrada.cvPdf) {
      const ruta = `${candidatoId}.pdf`;
      const up = await sb.storage
        .from(BUCKET_CV)
        .upload(ruta, entrada.cvPdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`Storage: ${up.error.message}`);
      cvUrl = `${BUCKET_CV}/${ruta}`;
      const u = await sb.from("candidatos").update({ cv_url: cvUrl }).eq("id", candidatoId);
      if (u.error) throw new Error(`candidatos.cv_url: ${u.error.message}`);
    }

    if (evaluaciones.length) {
      const ev = await sb.from("evaluaciones").insert(
        evaluaciones.map((x) => ({ candidato_id: candidatoId, tipo: x!.tipo, resumen: x!.resumen })),
      );
      if (ev.error) throw new Error(`evaluaciones: ${ev.error.message}`);
    }

    // etapa/estatus quedan con sus defaults: los administra el orquestador (Persona A).
    const cv = await sb
      .from("candidato_vacante")
      .insert({
        candidato_id: candidatoId,
        vacante_id: entrada.vacanteId,
        ficha: r.ficha,
        fit_score: r.fit_score,
        compatibilidad_nnn: r.compatibilidad_nnn,
        cumple_no_negociables: r.cumple_no_negociables,
      })
      .select("id")
      .single();
    if (cv.error) throw new Error(`candidato_vacante: ${cv.error.message}`);

    await registrarAudit({
      actor: entrada.actor,
      accion: "cargar_candidato",
      entidad: "candidatos",
      entidad_id: candidatoId,
      prueba: entrada.prueba,
      detalle: { vacante_id: entrada.vacanteId, fuente: entrada.candidato.fuente, cv_url: cvUrl, evaluaciones: evaluaciones.length },
    });
    await registrarAudit({
      actor: entrada.actor,
      accion: "ia_extraer_ficha",
      entidad: "candidato_vacante",
      entidad_id: cv.data.id,
      prueba: entrada.prueba,
      detalle: detalleAudit(salida),
    });

    return { candidatoId, candidatoVacanteId: cv.data.id as string, salida };
  } catch (err) {
    // Rollback manual (supabase-js no tiene transacciones): borra en cascada.
    await sb.from("candidatos").delete().eq("id", candidatoId);
    if (entrada.cvPdf) await sb.storage.from(BUCKET_CV).remove([`${candidatoId}.pdf`]);
    throw err;
  }
}
