import { PantallaCandidatos } from "@/components/ia/PantallaCandidatos";

export const dynamic = "force-dynamic";

// Montada dentro de app/hm/layout.tsx (Persona A): exige rol "hm" y pone el AppShell.
export default async function CandidatosPage({ searchParams }: PageProps<"/hm/candidatos">) {
  const { vacante } = await searchParams;
  return (
    <PantallaCandidatos
      base="/hm/candidatos"
      vacanteId={typeof vacante === "string" ? vacante : undefined}
      puedeCargar={false}
    />
  );
}
