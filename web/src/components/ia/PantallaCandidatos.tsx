import Link from "next/link";
import { ListaCandidatos } from "@/components/ia/ListaCandidatos";
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--lh-accent)]">Lista de candidatos</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            {vacanteId ? (vacantes.find((v) => v.id === vacanteId)?.titulo ?? "Vacante") : "Todas las vacantes"}
          </h1>
          <p className="mt-1 text-sm text-[var(--lh-muted)]">
            <span className="num">{filas.length}</span> candidatos · <span className="num">{referidos}</span> referidos ·
            selecciona 2 o más para compararlos lado a lado
          </p>
        </div>
        {puedeCargar && (
          <Link
            href="/at/carga"
            className="rounded-sm border border-[var(--lh-ink)] px-4 py-2 text-sm font-medium hover:bg-[var(--lh-ink)] hover:text-white"
          >
            + Cargar candidato
          </Link>
        )}
      </div>

      <nav className="mb-4 flex flex-wrap gap-1.5 text-[13px]" aria-label="Filtrar por vacante">
        <Chip href={base} activo={!vacanteId}>
          Todas
        </Chip>
        {vacantes.map((v) => (
          <Chip key={v.id} href={`${base}?vacante=${v.id}`} activo={v.id === vacanteId}>
            {v.titulo}
          </Chip>
        ))}
      </nav>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--lh-muted)]">
        <Leyenda color="var(--lh-ok)">Cumple</Leyenda>
        <Leyenda color="var(--lh-warn)">Parcial</Leyenda>
        <Leyenda color="var(--lh-bad)">No cumple</Leyenda>
        <span>· Compatibilidad = Potencial Global (AssessFirst) · % junto al semáforo = no negociables cumplidos</span>
      </div>

      {filas.length ? (
        <ListaCandidatos filas={filas} base={base} />
      ) : (
        <p className="rounded-md border border-dashed border-[var(--lh-rule)] p-10 text-center text-sm text-[var(--lh-muted)]">
          Esta vacante aún no tiene candidatos.
        </p>
      )}
    </TemaIA>
  );
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${
        activo
          ? "border-[var(--lh-ink)] bg-[var(--lh-ink)] text-white"
          : "border-[var(--lh-rule)] bg-[var(--lh-card)] hover:border-[var(--lh-ink-2)]"
      }`}
    >
      {children}
    </Link>
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
