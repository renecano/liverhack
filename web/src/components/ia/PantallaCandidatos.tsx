import Link from "next/link";
import { FileUp } from "lucide-react";
import { ListaCandidatos } from "@/components/ia/ListaCandidatos";
import { GlideSelect } from "@/components/ui/GlideSelect";
import { TemaIA } from "@/components/ia/TemaIA";
import { listarCandidatos, listarVacantes } from "@/lib/ia/consultas";
import { createClient } from "@/lib/supabase/server";

// Lista de candidatos (vista HM y AT). Lee con el cliente de SESIÓN: RLS decide
// qué vacantes ve cada usuario. La sesión y el rol los exige el layout del shell.
export async function PantallaCandidatos({
  base,
  vacanteId,
  puedeCargar,
}: {
  base: "/hm/candidatos" | "/at/candidatos";
  vacanteId?: string;
  puedeCargar: boolean;
}) {
  const db = await createClient();
  const [filas, vacantes] = await Promise.all([listarCandidatos(db, vacanteId), listarVacantes(db)]);
  const referidos = filas.filter((f) => f.es_referido).length;

  return (
    <TemaIA>
      <div className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[.2em] text-liv">Lista de candidatos</p>
          <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[42px]">
            {vacanteId ? (vacantes.find((v) => v.id === vacanteId)?.titulo ?? "Vacante") : "Todas las vacantes"}
          </h1>
          <p className="mt-2 text-[14px] text-stone-500">
            <span className="tabular font-semibold text-stone-800">{filas.length}</span> candidatos ·{" "}
            <span className="tabular font-semibold text-liv">{referidos}</span> referidos · selecciona 2 o más para compararlos
            lado a lado
          </p>
        </div>
        {puedeCargar && (
          <Link href="/at/carga" className="press btn-liv inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold">
            <FileUp className="h-4 w-4" /> Cargar candidato
          </Link>
        )}
      </div>

      <div className="mb-4 max-w-full">
        <GlideSelect
          size="sm"
          ariaLabel="Filtrar por vacante"
          value={vacanteId ?? "todas"}
          options={[
            { value: "todas", label: "Todas", href: base },
            ...vacantes.map((v) => ({ value: v.id, label: v.titulo, href: `${base}?vacante=${v.id}` })),
          ]}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-500">
        <Leyenda color="var(--lh-ok)">Cumple</Leyenda>
        <Leyenda color="var(--lh-warn)">Parcial</Leyenda>
        <Leyenda color="var(--lh-bad)">No cumple</Leyenda>
        <span>· Compatibilidad = Potencial Global (AssessFirst) · % junto al semáforo = no negociables cumplidos</span>
      </div>

      {filas.length ? (
        <ListaCandidatos filas={filas} base={base} />
      ) : (
        <p className="rounded-3xl border border-dashed border-stone-900/10 bg-white/50 p-10 text-center text-sm text-stone-500">
          Esta vacante aún no tiene candidatos.
        </p>
      )}
    </TemaIA>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
