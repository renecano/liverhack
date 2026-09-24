import { PantallaComparativa } from "@/components/ia/PantallaComparativa";

export const dynamic = "force-dynamic";

// Montada dentro de app/at/layout.tsx (Persona A): exige rol "at" y pone el AppShell.
export default async function CompararPage({ searchParams }: PageProps<"/at/candidatos/comparar">) {
  const { ids } = await searchParams;
  return <PantallaComparativa base="/at/candidatos" ids={typeof ids === "string" ? ids : undefined} />;
}
