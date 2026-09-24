import { FormCarga } from "@/components/ia/FormCarga";
import { TemaIA } from "@/components/ia/TemaIA";
import { listarVacantes } from "@/lib/ia/consultas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Montada dentro de app/at/layout.tsx (Persona A): exige rol "at" y pone el AppShell.
// Las vacantes se leen con la sesión (RLS: solo las que el AT puede ver).
export default async function CargaPage() {
  const vacantes = (await listarVacantes(await createClient())).filter(
    (v) => v.estatus !== "cubierta" && v.estatus !== "cancelada",
  );
  return (
    <TemaIA>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--lh-accent)]">Carga de candidatos</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
          CV + evaluación → ficha con citas
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--lh-muted)]">
          La IA llena la ficha comparativa, la compatibilidad y el semáforo de los no negociables. Si la salida no pasa
          la validación, se reintenta y no se guarda nada a medias.
        </p>
      </div>
      <FormCarga vacantes={vacantes} hrefLista="/at/candidatos" />
    </TemaIA>
  );
}
