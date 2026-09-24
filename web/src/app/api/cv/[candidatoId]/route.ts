import { descargarCv } from "@/lib/ia/servicio";
import { NO_ENCONTRADO, ROLES, sesionIA } from "@/lib/ia/sesion";

// Visor de CV: sirve el PDF desde Storage al iframe del visor.
// 1) Sesión + rol (HM/AT/admin). 2) cv_url se lee con el cliente de SESIÓN: si RLS
// (puede_ver_candidato) no deja ver al candidato, 404. 3) Solo la descarga usa el
// rol de servicio: el bucket "cv" es privado y no tiene políticas de Storage por usuario.
export async function GET(_req: Request, ctx: RouteContext<"/api/cv/[candidatoId]">) {
  const s = await sesionIA(ROLES.verCandidatos);
  if (!s.ok) return s.respuesta;
  const { candidatoId } = await ctx.params;
  const { data } = await s.supabase.from("candidatos").select("cv_url").eq("id", candidatoId).maybeSingle();
  if (!data) return NO_ENCONTRADO();
  if (!data.cv_url) return Response.json({ error: "El candidato no tiene CV registrado" }, { status: 404 });
  const pdf = await descargarCv(data.cv_url);
  if (!pdf) return Response.json({ error: "El PDF no está cargado en Storage" }, { status: 404 });
  return new Response(pdf as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
  });
}
