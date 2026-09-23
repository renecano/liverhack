import { z } from "zod";
import { ExtraccionInvalidaError } from "@/lib/ia/extractor";
import { procesarCarga } from "@/lib/ia/servicio";

// Carga de candidato nuevo (vista AT): CV + evaluación → extractor → BD.
export const maxDuration = 120;

const vacio = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const texto = z.preprocess(vacio, z.string().trim().optional());
const monto = z.preprocess(vacio, z.coerce.number().nonnegative().optional());

const Formulario = z.object({
  vacante_id: z.guid(),
  nombre: z.string().trim().min(2),
  email: z.string().trim().email(),
  telefono: texto,
  fuente: z.enum(["bolsa", "referido", "aira", "directo"]),
  puesto_actual: texto,
  empresa_actual: texto,
  compensacion_actual: monto,
  compensacion_deseada: monto,
  cv_texto: texto,
  evaluacion_tipo: z.enum(["assessfirst", "psicometrica", "otra"]).default("assessfirst"),
  evaluacion_resumen: texto,
});

const MAX_PDF = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const campos = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const p = Formulario.safeParse(campos);
  if (!p.success) {
    return Response.json(
      { error: "Datos inválidos", detalles: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const f = p.data;

  const archivo = form.get("cv_pdf");
  let cvPdf: Uint8Array | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.type !== "application/pdf") {
      return Response.json({ error: "El CV debe ser PDF" }, { status: 400 });
    }
    if (archivo.size > MAX_PDF) {
      return Response.json({ error: "El PDF excede 10 MB" }, { status: 400 });
    }
    cvPdf = new Uint8Array(await archivo.arrayBuffer());
  }
  if (!cvPdf && !f.cv_texto) {
    return Response.json({ error: "Sube el CV en PDF (o pega su texto)" }, { status: 400 });
  }

  try {
    const r = await procesarCarga({
      vacanteId: f.vacante_id,
      candidato: {
        nombre: f.nombre,
        email: f.email,
        telefono: f.telefono ?? null,
        fuente: f.fuente,
        puesto_actual: f.puesto_actual ?? null,
        empresa_actual: f.empresa_actual ?? null,
        compensacion_actual: f.compensacion_actual ?? null,
        compensacion_deseada: f.compensacion_deseada ?? null,
      },
      cvPdf,
      cvTexto: f.cv_texto ?? null,
      evaluacion: f.evaluacion_resumen ? { tipo: f.evaluacion_tipo, resumen: f.evaluacion_resumen } : null,
      // TODO(auth): tomar el actor de la sesión cuando Persona A publique el login.
      actor: { id: null, rol: null },
    });
    return Response.json({
      candidato_id: r.candidatoId,
      candidato_vacante_id: r.candidatoVacanteId,
      intentos: r.salida.intentos,
      modelo: r.salida.modelo,
      fit_fuente: r.salida.fitFuente,
      resultado: r.salida.resultado,
    });
  } catch (err) {
    if (err instanceof ExtraccionInvalidaError) {
      return Response.json(
        { error: "La IA no produjo una ficha válida; no se guardó nada.", detalles: err.errores },
        { status: 422 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = /duplicate key|candidatos_email_key/.test(msg) ? 409 : 500;
    return Response.json({ error: status === 409 ? "Ya existe un candidato con ese email" : msg }, { status });
  }
}
