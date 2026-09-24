import { PantallaCandidatos } from "@/components/ia/PantallaCandidatos";

export const dynamic = "force-dynamic";

// Montada dentro de app/at/layout.tsx (Persona A): exige rol "at" y pone el AppShell.
export default async function CandidatosPage({ searchParams }: PageProps<"/at/candidatos">) {
  const { vacante } = await searchParams;
  return (
    <PantallaCandidatos
      base="/at/candidatos"
      vacanteId={typeof vacante === "string" ? vacante : undefined}
      puedeCargar={true}
    />
  );
}
