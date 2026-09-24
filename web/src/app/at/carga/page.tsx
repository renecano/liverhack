import { FormCarga } from "@/components/ia/FormCarga";
import { TemaIA } from "@/components/ia/TemaIA";
import { Encabezado } from "@/components/proceso/piezas";
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
      <div className="space-y-8">
        <Encabezado
          eyebrow="Carga mágica de candidatos"
          titulo={
            <>
              CV + evaluación <span className="text-gradient-liv">→ ficha con citas.</span>
            </>
          }
        >
          La IA llena la ficha comparativa, la compatibilidad y el semáforo de los no negociables. Si la salida no pasa la
          validación, se reintenta y no se guarda nada a medias.
        </Encabezado>
        <FormCarga vacantes={vacantes} hrefLista="/at/candidatos" />
      </div>
    </TemaIA>
  );
}
