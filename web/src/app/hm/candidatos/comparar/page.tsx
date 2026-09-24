import { PantallaComparativa } from "@/components/ia/PantallaComparativa";

export const dynamic = "force-dynamic";

// Montada dentro de app/hm/layout.tsx (Persona A): exige rol "hm" y pone el AppShell.
export default async function CompararPage({ searchParams }: PageProps<"/hm/candidatos/comparar">) {
  const { ids } = await searchParams;
  return <PantallaComparativa base="/hm/candidatos" ids={typeof ids === "string" ? ids : undefined} />;
}
