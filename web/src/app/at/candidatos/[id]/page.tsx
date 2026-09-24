import { PanelAnalisisLiv } from "@/components/ia/PanelAnalisisLiv";
import { PantallaDetalleCandidato } from "@/components/ia/PantallaDetalleCandidato";

export const dynamic = "force-dynamic";

// Detalle de un candidato en una vacante (id = candidato_vacante.id). El layout del rol
// exige la sesión; la visibilidad la decide RLS dentro de la pantalla. En la vista del AT
// se suma el análisis de Liv (consejo; la decisión es del AT).
export default async function DetalleCandidatoPage({ params }: PageProps<"/at/candidatos/[id]">) {
  const { id } = await params;
  return <PantallaDetalleCandidato base="/at/candidatos" id={id} extra={<PanelAnalisisLiv ids={[id]} />} />;
}
