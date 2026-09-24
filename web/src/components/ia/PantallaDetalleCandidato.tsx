import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { BadgeReferido } from "@/components/ia/BadgeReferido";
import { SemaforoDetalle } from "@/components/ia/Semaforo";
import { TemaIA } from "@/components/ia/TemaIA";
import { VisorCvInline } from "@/components/ia/VisorCv";
import { Ring } from "@/components/ui/Ring";
import { NOMBRE_ETAPA } from "@/lib/orquestador/estados";
import { obtenerCandidatos } from "@/lib/ia/consultas";
import { mxn } from "@/lib/ia/formato";
import { createClient } from "@/lib/supabase/server";
import type { EtapaProceso } from "@/lib/supabase/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Vacio() {
  return <span className="text-[var(--lh-muted)]">—</span>;
}
const texto = (s?: string | null) => (s ? <p className="leading-relaxed">{s}</p> : <Vacio />);
const lista = (xs?: string[]) =>
  xs && xs.length ? (
    <ul className="space-y-1.5">
      {xs.map((x) => (
        <li key={x} className="flex gap-2 leading-snug">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-liv" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  ) : (
    <Vacio />
  );

function Bloque({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`surface rounded-3xl p-5 ${className}`}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">{titulo}</h2>
      <div className="text-[13.5px] text-stone-700">{children}</div>
    </section>
  );
}

/**
 * Detalle completo de un candidato en una vacante (candidato_vacante.id): ficha desglosada,
 * semáforo de no negociables con evidencia, scores y CV. Lee con el cliente de SESIÓN (RLS):
 * si el usuario no ve al candidato, 404. Solo muestra datos existentes.
 */
export async function PantallaDetalleCandidato({
  base,
  id,
  historial,
  extra,
}: {
  base: "/hm/candidatos" | "/at/candidatos" | "/hrbp/candidatos";
  id: string;
  /** Sección de historial (decisiones y entrevistas), si se muestra. */
  historial?: ReactNode;
  /** Panel adicional debajo de la ficha (p. ej. el análisis de Liv para el AT). */
  extra?: ReactNode;
}) {
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const [c] = await obtenerCandidatos(db, [id]);
  if (!c) notFound();

  const f = c.ficha;
  const cumplidos = c.no_negociables.filter((n) => n.estado === "cumple").length;

  return (
    <TemaIA>
      <div className="space-y-8">
        <div>
          <Link
            href={`${base}?vacante=${c.vacante_id}`}
            className="press group inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 hover:text-liv"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" /> Candidatos de {c.vacante_titulo}
          </Link>

          <header className="animate-rise mt-4 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[.2em] text-liv">Detalle del candidato</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px]">{c.nombre}</h1>
                {c.es_referido && <BadgeReferido />}
              </div>
              <p className="mt-1 text-[14px] text-stone-500">
                {c.puesto_actual ?? "—"}
                {c.empresa_actual ? ` · ${c.empresa_actual}` : ""}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-full bg-stone-900/[0.04] px-2.5 py-1 font-medium text-stone-700">{c.vacante_titulo}</span>
                <span className="rounded-full bg-stone-900/[0.04] px-2.5 py-1 text-stone-600">
                  Etapa {NOMBRE_ETAPA[c.etapa as EtapaProceso] ?? c.etapa}
                </span>
                <span className="rounded-full bg-liv-50 px-2.5 py-1 font-semibold capitalize text-liv-deep ring-1 ring-liv/20">{c.estatus}</span>
                <span className="rounded-full bg-stone-900/[0.04] px-2.5 py-1 capitalize text-stone-600">Fuente: {c.fuente}</span>
              </p>
            </div>

            {/* Scores */}
            <dl className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-3">
                <Ring valor={c.fit_score} size={64} stroke={6} label="% compatibilidad (Potencial Global)" />
                <div className="leading-tight">
                  <dt className="text-[11px] font-semibold uppercase tracking-[.12em] text-stone-400">Compatibilidad</dt>
                  <dd className="text-[12px] text-stone-500">Potencial Global</dd>
                </div>
              </div>
              <div className="leading-tight">
                <dt className="text-[11px] font-semibold uppercase tracking-[.12em] text-stone-400">No negociables</dt>
                <dd className="mt-1 text-[26px] font-semibold tabular text-stone-900">{c.compatibilidad_nnn ?? "—"}%</dd>
                <dd className="text-[12px] text-stone-500">
                  {cumplidos} de {c.no_negociables.length} cumplidos
                </dd>
              </div>
            </dl>
          </header>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 space-y-5">
            <Bloque titulo={`No negociables de ${c.vacante_titulo} · evidencia y cita`}>
              {c.no_negociables.length ? <SemaforoDetalle items={c.no_negociables} /> : <Vacio />}
            </Bloque>

            <Bloque titulo="Descripción">{texto(f.descripcion)}</Bloque>

            <div className="grid gap-5 md:grid-cols-2">
              <Bloque titulo="Fortalezas">{lista(f.fortalezas)}</Bloque>
              <Bloque titulo="Áreas de oportunidad">{lista(f.areas_oportunidad)}</Bloque>
              <Bloque titulo="Estilo de liderazgo">{texto(f.estilo_liderazgo)}</Bloque>
              <Bloque titulo="Visión estratégica">{texto(f.vision_estrategica)}</Bloque>
              <Bloque titulo="Análisis y toma de decisiones">{texto(f.analisis_toma_decisiones)}</Bloque>
              <Bloque titulo="Idiomas">
                {f.idiomas?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {f.idiomas.map((i) => (
                      <span key={i.idioma} className="rounded-full bg-stone-900/[0.04] px-2.5 py-1 text-[12.5px]">
                        {i.idioma} <span className="num font-semibold">{i.nivel}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <Vacio />
                )}
              </Bloque>
              <Bloque titulo="Escolaridad y otros estudios">
                {texto(c.escolaridad)}
                {f.otros_estudios?.length ? <div className="mt-2">{lista(f.otros_estudios)}</div> : null}
              </Bloque>
              <Bloque titulo="Compensación actual / deseada">
                <p className="num text-[15px] font-semibold text-stone-900">
                  {mxn(c.compensacion_actual)} <span className="font-normal text-[var(--lh-muted)]">/</span> {mxn(c.compensacion_deseada)}
                </p>
              </Bloque>
            </div>

            <Bloque titulo="Recomendaciones (IA)">{texto(f.recomendaciones)}</Bloque>

            <Bloque titulo="Evaluaciones">
              {c.evaluaciones.length ? (
                <ul className="space-y-2">
                  {c.evaluaciones.map((e, i) => (
                    <li key={i}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--lh-muted)]">{e.tipo}</span>{" "}
                      {e.resumen ?? "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <Vacio />
              )}
            </Bloque>

            {f.citas?.length ? (
              <Bloque titulo="Citas de origen de la ficha">
                <ul className="num space-y-1 text-[11.5px] text-[var(--lh-muted)]">
                  {f.citas.map((x) => (
                    <li key={x}>↳ {x}</li>
                  ))}
                </ul>
              </Bloque>
            ) : null}

            {extra}
            {historial}
          </div>

          <aside className="h-[640px] xl:sticky xl:top-24 xl:h-[calc(100vh-8rem)]">
            <div className="surface flex h-full flex-col gap-3 rounded-3xl p-3">
              <p className="flex items-center gap-2 px-1 pt-1 text-[13px] font-semibold">
                <FileText className="h-4 w-4 text-liv" /> CV
              </p>
              <div className="min-h-0 flex-1">
                {c.tiene_cv ? (
                  <VisorCvInline candidatoId={c.candidato_id} nombre={c.nombre} />
                ) : (
                  <div className="grid h-full place-items-center rounded-2xl bg-stone-50 p-6 text-center text-[13px] text-stone-500 ring-1 ring-stone-900/5">
                    {c.nombre} no tiene un CV en PDF cargado.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </TemaIA>
  );
}
