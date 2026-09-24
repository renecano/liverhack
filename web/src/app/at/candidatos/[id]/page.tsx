import { PantallaDetalleCandidato } from "@/components/ia/PantallaDetalleCandidato";

export const dynamic = "force-dynamic";

// Detalle de un candidato en una vacante (id = candidato_vacante.id). El layout del rol
// exige la sesión; la visibilidad la decide RLS dentro de la pantalla.
export default async function DetalleCandidatoPage({ params }: PageProps<"/at/candidatos/[id]">) {
  const { id } = await params;
  return <PantallaDetalleCandidato base="/at/candidatos" id={id} />;
}
