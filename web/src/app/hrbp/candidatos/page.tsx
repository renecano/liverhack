import { PantallaCandidatos } from "@/components/ia/PantallaCandidatos";

export const dynamic = "force-dynamic";

// Montada dentro de app/hrbp/layout.tsx: exige rol "hrbp"/"admin". Solo lectura (el HRBP no carga CVs).
export default async function CandidatosHrbpPage({ searchParams }: PageProps<"/hrbp/candidatos">) {
  const { vacante } = await searchParams;
  return (
    <PantallaCandidatos
      base="/hrbp/candidatos"
      vacanteId={typeof vacante === "string" ? vacante : undefined}
      puedeCargar={false}
    />
  );
}
