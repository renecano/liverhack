import { supabaseAdmin } from "@/lib/ia/supabase-provisional";
import { descargarCv } from "@/lib/ia/servicio";

// Visor de CV: sirve el PDF desde Storage (bucket privado) al iframe del visor.
export async function GET(_req: Request, ctx: RouteContext<"/api/cv/[candidatoId]">) {
  const { candidatoId } = await ctx.params;
  const { data } = await supabaseAdmin()
    .from("candidatos")
    .select("cv_url")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!data?.cv_url) {
    return Response.json({ error: "El candidato no tiene CV registrado" }, { status: 404 });
  }
  const pdf = await descargarCv(data.cv_url);
  if (!pdf) {
    return Response.json(
      { error: `El PDF (${data.cv_url}) no está cargado en Storage` },
      { status: 404 },
    );
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
