import Link from "next/link";
import { BadgeReferido } from "@/components/ia/BadgeReferido";
import { BotonCv } from "@/components/ia/BotonCv";
import { SemaforoDetalle } from "@/components/ia/Semaforo";
import { TemaIA } from "@/components/ia/TemaIA";
import { obtenerCandidatos, type FilaCandidato } from "@/lib/ia/consultas";
import { mxn } from "@/lib/ia/formato";
import { createClient } from "@/lib/supabase/server";

// Filas con la estructura del Excel de docs/00 (AssessFirst).
type Fila = { etiqueta: string; render: (c: FilaCandidato) => React.ReactNode; destacar?: boolean };

const lista = (xs?: string[]) =>
  xs && xs.length ? (
    <ul className="space-y-1">
      {xs.map((x) => (
        <li key={x} className="flex gap-2">
          <span className="text-[var(--lh-accent)]">·</span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  ) : (
    <Vacio />
  );

const texto = (s?: string) => (s ? <p>{s}</p> : <Vacio />);

function Vacio() {
  return <span className="text-[var(--lh-muted)]">—</span>;
}

function Porcentaje({ valor, mejor }: { valor: number | null; mejor: boolean }) {
  if (valor === null) return <Vacio />;
  return (
    <div>
      <span
        className={`num font-[family-name:var(--font-data)] text-3xl font-medium ${mejor ? "text-[var(--lh-accent)]" : ""}`}
      >
        {valor}
        <span className="text-lg">%</span>
      </span>
      <div className="mt-1 h-1 w-full max-w-[160px] rounded-full bg-stone-200">
        <div className="h-1 rounded-full bg-[var(--lh-ink)]" style={{ width: `${valor}%` }} />
      </div>
    </div>
  );
}

// Comparativa lado a lado (vista HM y AT). Lee con el cliente de SESIÓN (RLS):
// si un id no es visible para el usuario, simplemente no aparece.
export async function PantallaComparativa({ base, ids }: { base: "/hm/candidatos" | "/at/candidatos"; ids?: string }) {
  const lista_ids = (ids ?? "").split(",").filter(Boolean).slice(0, 6);
  const cands = await obtenerCandidatos(await createClient(), lista_ids);

  if (cands.length < 2) {
    return (
      <TemaIA>
        <p className="text-sm">
          Selecciona al menos 2 candidatos en la{" "}
          <Link href={base} className="underline">
            lista
          </Link>
          .
        </p>
      </TemaIA>
    );
  }

  const maxFit = Math.max(...cands.map((c) => c.fit_score ?? -1));
  const maxNnn = Math.max(...cands.map((c) => c.compatibilidad_nnn ?? -1));
  const variasVacantes = new Set(cands.map((c) => c.vacante_id)).size > 1;

  const filas: Fila[] = [
    { etiqueta: "Vacante", render: (c) => <p className="font-medium">{c.vacante_titulo}</p> },
    {
      etiqueta: "% de compatibilidad (Potencial Global)",
      destacar: true,
      render: (c) => <Porcentaje valor={c.fit_score} mejor={c.fit_score === maxFit} />,
    },
    {
      etiqueta: "No negociables",
      destacar: true,
      render: (c) => (
        <div className="space-y-2">
          <p className="num text-[13px]">
            <span className={c.compatibilidad_nnn === maxNnn ? "font-semibold text-[var(--lh-accent)]" : ""}>
              {c.compatibilidad_nnn ?? "—"}%
            </span>{" "}
            <span className="text-[var(--lh-muted)]">cumplidos</span>
          </p>
          <SemaforoDetalle items={c.no_negociables} />
        </div>
      ),
    },
    { etiqueta: "Escolaridad", render: (c) => texto(c.escolaridad ?? undefined) },
    { etiqueta: "Otros estudios", render: (c) => lista(c.ficha.otros_estudios) },
    {
      etiqueta: "Idiomas y nivel",
      render: (c) =>
        c.ficha.idiomas?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {c.ficha.idiomas.map((i) => (
              <span key={i.idioma} className="rounded-sm bg-stone-100 px-2 py-0.5 text-[12px]">
                {i.idioma} <span className="num font-medium">{i.nivel}</span>
              </span>
            ))}
          </div>
        ) : (
          <Vacio />
        ),
    },
    {
      etiqueta: "Compensación actual / deseada",
      render: (c) => (
        <p className="num text-[13px]">
          {mxn(c.compensacion_actual)} <span className="text-[var(--lh-muted)]">/</span> {mxn(c.compensacion_deseada)}
        </p>
      ),
    },
    { etiqueta: "Descripción del candidato", render: (c) => texto(c.ficha.descripcion) },
    { etiqueta: "Fortalezas", render: (c) => lista(c.ficha.fortalezas) },
    { etiqueta: "Áreas de oportunidad", render: (c) => lista(c.ficha.areas_oportunidad) },
    { etiqueta: "Estilo de liderazgo", render: (c) => texto(c.ficha.estilo_liderazgo) },
    { etiqueta: "Visión estratégica", render: (c) => texto(c.ficha.vision_estrategica) },
    { etiqueta: "Análisis y toma de decisiones", render: (c) => texto(c.ficha.analisis_toma_decisiones) },
    { etiqueta: "Recomendaciones", render: (c) => texto(c.ficha.recomendaciones) },
    {
      etiqueta: "Evaluaciones",
      render: (c) =>
        c.evaluaciones.length ? (
          <ul className="space-y-1">
            {c.evaluaciones.map((e, i) => (
              <li key={i}>
                <span className="text-[11px] uppercase tracking-wider text-[var(--lh-muted)]">{e.tipo}</span>{" "}
                {e.resumen}
              </li>
            ))}
          </ul>
        ) : (
          <Vacio />
        ),
    },
    {
      etiqueta: "Citas de origen",
      render: (c) =>
        c.ficha.citas?.length ? (
          <ul className="num space-y-1 text-[11px] text-[var(--lh-muted)]">
            {c.ficha.citas.map((x) => (
              <li key={x}>↳ {x}</li>
            ))}
          </ul>
        ) : (
          <Vacio />
        ),
    },
  ];

  return (
    <TemaIA>
      <Link href={base} className="text-sm text-[var(--lh-muted)] hover:text-[var(--lh-ink)]">
        ← Lista de candidatos
      </Link>
      <div className="mb-6 mt-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--lh-accent)]">Comparativa lado a lado</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
          {cands.length} candidatos
        </h1>
        {variasVacantes && (
          <p className="mt-1 text-sm text-[var(--lh-warn)]">
            Los candidatos son de vacantes distintas: cada semáforo se mide contra los no negociables de su propia vacante.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--lh-rule)] bg-[var(--lh-card)]">
        <table className="w-full table-fixed border-collapse text-left text-[13px] leading-relaxed" style={{ minWidth: 208 + cands.length * 280 }}>
          <thead>
            <tr className="border-b-2 border-[var(--lh-ink)]">
              <th className="sticky left-0 z-10 w-52 bg-[var(--lh-card)] px-4 py-4 align-bottom text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--lh-muted)]">
                Aspecto
              </th>
              {cands.map((c, i) => (
                <th
                  key={c.id}
                  className="lh-rise border-l border-[var(--lh-rule)] px-4 py-4 align-bottom font-normal"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-[family-name:var(--font-display)] text-xl font-semibold">{c.nombre}</span>
                    {c.es_referido && <BadgeReferido />}
                  </div>
                  <p className="text-xs text-[var(--lh-muted)]">
                    {c.puesto_actual ?? "—"}
                    {c.empresa_actual ? ` · ${c.empresa_actual}` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs capitalize text-[var(--lh-ink-2)]">
                      {c.etapa} · {c.estatus}
                    </span>
                    <BotonCv candidatoId={c.candidato_id} nombre={c.nombre} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta} className={`border-b border-[var(--lh-rule)] ${f.destacar ? "bg-[#fbf7f1]" : ""}`}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-4 py-3 align-top text-[12px] font-semibold text-[var(--lh-ink-2)] ${f.destacar ? "bg-[#fbf7f1]" : "bg-[var(--lh-card)]"}`}
                >
                  {f.etiqueta}
                </th>
                {cands.map((c) => (
                  <td key={c.id} className="border-l border-[var(--lh-rule)] px-4 py-3 align-top">
                    {f.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TemaIA>
  );
}
