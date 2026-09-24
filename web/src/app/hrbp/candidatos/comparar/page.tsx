import { PantallaComparativa } from "@/components/ia/PantallaComparativa";

export const dynamic = "force-dynamic";

// Montada dentro de app/hrbp/layout.tsx. Sin botones de decisión: decide el HM.
export default async function CompararHrbpPage({ searchParams }: PageProps<"/hrbp/candidatos/comparar">) {
  const { ids } = await searchParams;
  return <PantallaComparativa base="/hrbp/candidatos" ids={typeof ids === "string" ? ids : undefined} />;
}
