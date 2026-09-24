import Link from "next/link";
import { ArrowLeft, Quote, TriangleAlert } from "lucide-react";
import { BadgeReferido } from "@/components/ia/BadgeReferido";
import { BotonCv } from "@/components/ia/BotonCv";
import { PanelCvComparativa } from "@/components/ia/PanelCvComparativa";
import { ETIQUETA, SemaforoDetalle } from "@/components/ia/Semaforo";
import { TemaIA } from "@/components/ia/TemaIA";
import { CandidateActions } from "@/components/proceso/candidate-actions";
import { Folder } from "@/components/ui/Folder";
import { Ring } from "@/components/ui/Ring";
import { obtenerCandidatos, type FilaCandidato, type NoNegociableVista } from "@/lib/ia/consultas";
import { mxn } from "@/lib/ia/formato";
import { createClient } from "@/lib/supabase/server";
import type { EstadoProceso } from "@/lib/supabase/types";

// Filas con la estructura del Excel de docs/00 (AssessFirst).
type Fila = { etiqueta: string; render: (c: FilaCandidato) => React.ReactNode; destacar?: boolean };

const lista = (xs?: string[]) =>
  xs && xs.length ? (
    <ul className="space-y-1">
      {xs.map((x) => (
        <li key={x} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-liv" />
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

const CELDA: Record<NonNullable<NoNegociableVista["estado"]> | "nd", string> = {
  cumple: "bg-emerald-50 ring-emerald-600/15 text-emerald-800",
  parcial: "bg-amber-50 ring-amber-600/20 text-amber-900",
  no_cumple: "bg-rose-50 ring-rose-600/15 text-rose-800",
  nd: "bg-stone-50 ring-stone-900/5 text-stone-500",
};
const LUZ: Record<NonNullable<NoNegociableVista["estado"]> | "nd", string> = {
  cumple: "bg-emerald-500",
  parcial: "bg-amber-400",
  no_cumple: "bg-rose-500",
  nd: "bg-stone-300",
};

/** Matriz de no negociables: filas = NN de la vacante, columnas = candidatos. */
function MatrizNoNegociables({ cands }: { cands: FilaCandidato[] }) {
  const nns = cands[0]?.no_negociables ?? [];
  return (
    <div className="surface overflow-x-auto rounded-3xl">
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth: 220 + cands.length * 230 }}>
        <thead>
          <tr className="border-b hairline">
            <th className="w-56 px-5 py-4 text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">No negociable</th>
            {cands.map((c) => (
              <th key={c.id} className="px-3 py-4 text-[13px] font-semibold">
                <span className="flex items-center justify-between gap-2">
                  {c.nombre}
                  <span className="tabular rounded-full bg-stone-900/[0.04] px-2 py-0.5 text-[11.5px] text-stone-600">{c.compatibilidad_nnn ?? "—"}%</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nns.map((nn, i) => (
            <tr key={nn.id} className="border-b hairline last:border-0">
              <th scope="row" className="px-5 py-3 align-top">
                <span className="text-[13px] font-semibold text-stone-800">{nn.texto}</span>
                <span className="mt-0.5 block text-[11px] font-medium capitalize text-stone-400">{nn.tipo.replaceAll("_", " ")}</span>
              </th>
              {cands.map((c, j) => {
                const v = c.no_negociables.find((x) => x.id === nn.id);
                const e = v?.estado ?? "nd";
                return (
                  <td key={c.id} className="px-3 py-3 align-top">
                    <div
                      className={`animate-rise h-full rounded-2xl p-3 ring-1 ring-inset ${CELDA[e]}`}
                      style={{ animationDelay: `${(i * cands.length + j) * 40}ms` }}
                    >
                      <p className="flex items-center gap-2 text-[12.5px] font-bold">
                        <span className={`h-2.5 w-2.5 rounded-full ${LUZ[e]}`} />
                        {v?.estado ? ETIQUETA[v.estado] : "Sin evaluar"}
                      </p>
                      {v?.evidencia && <p className="mt-1.5 text-[12.5px] leading-snug text-stone-700">{v.evidencia}</p>}
                      {v?.cita && (
                        <p className="mt-1.5 flex gap-1 font-mono text-[10.5px] leading-snug text-stone-500">
                          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                          {v.cita}
                        </p>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Comparativa lado a lado (vista HM y AT). Lee con el cliente de SESIÓN (RLS):
// si un id no es visible para el usuario, simplemente no aparece.
// puedeDecidir: solo el HM ve los botones de decisión (y solo en la compuerta de finalista).
export async function PantallaComparativa({
  base,
  ids,
  puedeDecidir = false,
}: {
  base: "/hm/candidatos" | "/at/candidatos";
  ids?: string;
  puedeDecidir?: boolean;
}) {
  const lista_ids = (ids ?? "").split(",").filter(Boolean).slice(0, 6);
  const db = await createClient();
  const cands = await obtenerCandidatos(db, lista_ids);

  if (cands.length < 2) {
    return (
      <TemaIA>
        <div className="surface mx-auto max-w-md rounded-3xl p-8 text-center text-sm">
          <p className="text-[15px] font-semibold">Selecciona al menos 2 candidatos</p>
          <p className="mt-1 text-stone-500">
            Vuelve a la{" "}
            <Link href={base} className="font-semibold text-liv underline-offset-2 hover:underline">
              lista de candidatos
            </Link>{" "}
            y marca 2 o más para compararlos.
          </p>
        </div>
      </TemaIA>
    );
  }

  const vacanteIds = [...new Set(cands.map((c) => c.vacante_id))];
  const variasVacantes = vacanteIds.length > 1;
  const estados = new Map<string, EstadoProceso>();
  if (puedeDecidir) {
    const { data } = await db.from("vacantes").select("id, estado_proceso").in("id", vacanteIds);
    for (const v of data ?? []) estados.set(v.id as string, v.estado_proceso as EstadoProceso);
  }

  const maxFit = Math.max(...cands.map((c) => c.fit_score ?? -1));

  const filas: Fila[] = [
    { etiqueta: "Vacante", render: (c) => <p className="font-medium">{c.vacante_titulo}</p> },
    { etiqueta: "Escolaridad", render: (c) => texto(c.escolaridad ?? undefined) },
    { etiqueta: "Otros estudios", render: (c) => lista(c.ficha.otros_estudios) },
    {
      etiqueta: "Idiomas y nivel",
      render: (c) =>
        c.ficha.idiomas?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {c.ficha.idiomas.map((i) => (
              <span key={i.idioma} className="rounded-full bg-stone-900/[0.04] px-2 py-0.5 text-[12px]">
                {i.idioma} <span className="num font-semibold">{i.nivel}</span>
              </span>
            ))}
          </div>
        ) : (
          <Vacio />
        ),
    },
    {
      etiqueta: "Compensación actual / deseada",
      destacar: true,
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
    { etiqueta: "Recomendaciones", destacar: true, render: (c) => texto(c.ficha.recomendaciones) },
    {
      etiqueta: "Evaluaciones",
      render: (c) =>
        c.evaluaciones.length ? (
          <ul className="space-y-1">
            {c.evaluaciones.map((e, i) => (
              <li key={i}>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--lh-muted)]">{e.tipo}</span>{" "}
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
      <div className="space-y-10">
        <div>
          <Link href={base} className="press group inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 hover:text-liv">
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" /> Lista de candidatos
          </Link>
          <div className="animate-rise mt-4">
            <p className="text-[12px] font-semibold uppercase tracking-[.2em] text-liv">Comparativa lado a lado</p>
            <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[42px]">
              {cands.length} candidatos, <span className="text-gradient-liv">una decisión.</span>
            </h1>
            {variasVacantes && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-[13px] font-medium text-amber-800 ring-1 ring-amber-600/20">
                <TriangleAlert className="h-4 w-4" />
                Candidatos de vacantes distintas: cada semáforo se mide contra los no negociables de su propia vacante.
              </p>
            )}
          </div>
        </div>

        {/* Carpetas de candidato: compatibilidad, CV y decisión. */}
        <div className="grid gap-x-5 gap-y-8 pt-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
          {cands.map((c, i) => {
            const estado = estados.get(c.vacante_id);
            const decide = puedeDecidir && estado === "ESPERANDO_HM_DECIDE_FINALISTA";
            return (
              <Folder key={c.id} className="animate-rise" style={{ animationDelay: `${i * 70}ms` }} cardClassName="h-full p-5">
                <div className="flex items-start gap-4">
                  <Ring valor={c.fit_score} size={64} stroke={6} destacado={c.fit_score === maxFit && maxFit >= 0} label="% compatibilidad (Potencial Global)" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[17px] font-semibold tracking-[-0.01em]">{c.nombre}</p>
                      {c.es_referido && <BadgeReferido />}
                    </div>
                    <p className="text-[12.5px] text-stone-500">
                      {c.puesto_actual ?? "—"}
                      {c.empresa_actual ? ` · ${c.empresa_actual}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[12px] capitalize text-stone-600">
                        {c.etapa} · {c.estatus}
                      </span>
                      {c.tiene_cv && <BotonCv candidatoId={c.candidato_id} nombre={c.nombre} />}
                    </div>
                  </div>
                </div>
                {decide && estado && (
                  <div className="mt-4 border-t hairline pt-4">
                    <CandidateActions vacanteId={c.vacante_id} candidatoId={c.candidato_id} candidatoNombre={c.nombre} estado={estado} compacto />
                  </div>
                )}
              </Folder>
            );
          })}
        </div>

        <section>
          <div className="mb-4">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Matriz de no negociables</h2>
            <p className="mt-1 text-[13.5px] text-stone-500">Verde cumple · ámbar parcial · rojo no cumple. Cada celda cita su fuente.</p>
          </div>
          {variasVacantes ? (
            <div className="grid gap-4 md:grid-cols-2">
              {cands.map((c) => (
                <div key={c.id} className="surface rounded-3xl p-5">
                  <p className="mb-3 text-[14px] font-semibold">
                    {c.nombre} <span className="font-normal text-stone-500">· {c.vacante_titulo}</span>
                  </p>
                  <SemaforoDetalle items={c.no_negociables} />
                </div>
              ))}
            </div>
          ) : (
            <MatrizNoNegociables cands={cands} />
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <div className="mb-4">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Ficha comparativa</h2>
              <p className="mt-1 text-[13.5px] text-stone-500">Estructura del Excel de AssessFirst, extraída por IA con citas de origen.</p>
            </div>
            <div className="surface overflow-x-auto rounded-3xl">
              <table
                className="w-full table-fixed border-collapse text-left text-[13px] leading-relaxed"
                style={{ minWidth: 200 + cands.length * 260 }}
              >
                <thead>
                  <tr className="border-b hairline">
                    <th className="sticky left-0 z-10 w-48 bg-white px-5 py-4 text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">
                      Aspecto
                    </th>
                    {cands.map((c) => (
                      <th key={c.id} className="px-4 py-4 text-[13.5px] font-semibold">
                        {c.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.etiqueta} className={`border-b hairline last:border-0 ${f.destacar ? "bg-liv-50/40" : ""}`}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 px-5 py-3.5 align-top text-[12.5px] font-semibold text-stone-600 ${f.destacar ? "bg-[#fff8fc]" : "bg-white"}`}
                      >
                        {f.etiqueta}
                      </th>
                      {cands.map((c) => (
                        <td key={c.id} className="px-4 py-3.5 align-top text-stone-700">
                          {f.render(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="h-[640px] xl:sticky xl:top-24 xl:h-[calc(100vh-8rem)]">
            <PanelCvComparativa candidatos={cands.map((c) => ({ candidato_id: c.candidato_id, nombre: c.nombre, tiene_cv: c.tiene_cv }))} />
          </aside>
        </section>
      </div>
    </TemaIA>
  );
}
