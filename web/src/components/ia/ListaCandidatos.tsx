"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { FilaCandidato } from "@/lib/ia/consultas";
import { mxn } from "@/lib/ia/formato";
import { BadgeReferido } from "./BadgeReferido";
import { PanelPreguntas } from "./PanelPreguntas";
import { PanelSugerencias } from "./PanelSugerencias";
import { Semaforo, SemaforoDetalle } from "./Semaforo";
import { VisorCv } from "./VisorCv";

const NO_SELECCIONADO = ["descartado", "pool"];

const ESTATUS: Record<string, string> = {
  activo: "text-[var(--lh-ink-2)]",
  finalista: "text-[var(--lh-ok)] font-semibold",
  descartado: "text-[var(--lh-muted)] line-through decoration-1",
  pool: "text-[var(--lh-ink-2)]",
  contratado: "text-[var(--lh-ok)] font-semibold",
};

function Barra({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-[var(--lh-muted)]">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="num w-9 text-right text-[13px] font-medium">{valor}%</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
        <span className="block h-full rounded-full bg-gradient-to-r from-stone-900 to-liv transition-[width] duration-700" style={{ width: `${valor}%` }} />
      </span>
    </div>
  );
}

// base: ruta de la lista según el rol ("/hm/candidatos", "/at/candidatos" o "/hrbp/candidatos").
export function ListaCandidatos({ filas, base }: { filas: FilaCandidato[]; base: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cv, setCv] = useState<FilaCandidato | null>(null);
  // Panel de preguntas: se queda montado tras abrirse para no perder lo generado
  // (aún no se persiste en preguntas_entrevista).
  const [preguntasDe, setPreguntasDe] = useState<string | null>(null);
  const [panelesMontados, setPanelesMontados] = useState<string[]>([]);
  const alternarPreguntas = (id: string) => {
    setPreguntasDe((x) => (x === id ? null : id));
    setPanelesMontados((xs) => (xs.includes(id) ? xs : [...xs, id]));
  };
  // Sugerencias de reubicación: solo para no seleccionados (descartado / pool).
  const [sugerenciasDe, setSugerenciasDe] = useState<string | null>(null);
  const [sugMontadas, setSugMontadas] = useState<string[]>([]);
  const alternarSugerencias = (id: string) => {
    setSugerenciasDe((x) => (x === id ? null : id));
    setSugMontadas((xs) => (xs.includes(id) ? xs : [...xs, id]));
  };

  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="surface overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--lh-rule)] whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-[var(--lh-muted)]">
              <th className="w-10 px-4 py-3" />
              <th className="px-3 py-3 font-medium">Candidato</th>
              <th className="px-3 py-3 font-medium">Vacante</th>
              <th className="px-3 py-3 font-medium">Escolaridad</th>
              <th className="px-3 py-3 font-medium" title="Compensación actual / deseada (MXN)">Comp. act. / des.</th>
              <th className="px-3 py-3 font-medium">Compatibilidad</th>
              <th className="px-3 py-3 font-medium">No negociables</th>
              <th className="px-3 py-3 font-medium">Estatus</th>
              <th className="px-3 py-3 font-medium">CV</th>
              <th className="px-3 py-3 font-medium">IA</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const marcado = sel.includes(f.id);
              return (
                <Fragment key={f.id}>
                  <tr
                    id={`cv-${f.id}`}
                    className={`lh-rise scroll-mt-28 border-b target:bg-liv-50 target:shadow-[inset_3px_0_0_var(--lh-accent)] border-[var(--lh-rule)] transition-colors duration-300 ${marcado ? "bg-liv-50" : "hover:bg-stone-50/80"}`}
                    style={{ animationDelay: `${i * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(f.id)}
                        aria-label={`Seleccionar a ${f.nombre}`}
                        className="h-4 w-4 cursor-pointer accent-[var(--lh-accent)]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`${base}/${f.id}`} className="group block rounded-lg" title={`Ver el detalle de ${f.nombre}`}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium underline-offset-2 group-hover:text-liv-deep group-hover:underline">{f.nombre}</span>
                          {f.es_referido && <BadgeReferido />}
                        </span>
                        <span className="block text-xs text-[var(--lh-muted)]">
                          {f.puesto_actual ?? "—"}
                          {f.empresa_actual ? ` · ${f.empresa_actual}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-[13px]">{f.vacante_titulo}</td>
                    <td className="max-w-[220px] px-3 py-3 text-[13px] text-[var(--lh-ink-2)]">{f.escolaridad ?? "—"}</td>
                    <td className="num px-3 py-3 text-[12px]">
                      {mxn(f.compensacion_actual)}
                      <span className="text-[var(--lh-muted)]"> / </span>
                      {mxn(f.compensacion_deseada)}
                    </td>
                    <td className="px-3 py-3">
                      <Barra valor={f.fit_score} />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setAbierto(abierto === f.id ? null : f.id)}
                        className="press flex items-center gap-2 rounded-full px-2 py-1 hover:bg-stone-100"
                        aria-expanded={abierto === f.id}
                      >
                        <Semaforo items={f.no_negociables} />
                        <span className="num text-xs text-[var(--lh-muted)]">{f.compatibilidad_nnn ?? "—"}%</span>
                        <span className="text-xs text-[var(--lh-muted)]">{abierto === f.id ? "▴" : "▾"}</span>
                      </button>
                    </td>
                    <td className={`px-3 py-3 text-[13px] capitalize ${ESTATUS[f.estatus] ?? ""}`}>{f.estatus}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setCv(f)}
                        className="press whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-stone-900/10 hover:text-liv-deep hover:ring-liv/40"
                      >
                        Ver PDF
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-stretch gap-1.5">
                        <button
                          onClick={() => alternarPreguntas(f.id)}
                          aria-expanded={preguntasDe === f.id}
                          className={`press whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                            preguntasDe === f.id
                              ? "border-liv bg-liv text-white"
                              : "border-[var(--lh-rule)] bg-white hover:border-liv/50 hover:text-liv-deep"
                          }`}
                        >
                          Preguntas
                        </button>
                        {NO_SELECCIONADO.includes(f.estatus) && (
                          <button
                            onClick={() => alternarSugerencias(f.id)}
                            aria-expanded={sugerenciasDe === f.id}
                            className={`press whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                              sugerenciasDe === f.id
                                ? "border-liv bg-liv text-white"
                                : "border-[var(--lh-rule)] bg-white hover:border-liv/50 hover:text-liv-deep"
                            }`}
                          >
                            Sugerir vacantes
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {abierto === f.id && (
                    <tr className="border-b border-[var(--lh-rule)] bg-stone-50/70">
                      <td />
                      <td colSpan={9} className="px-3 py-4">
                        <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">
                          No negociables de {f.vacante_titulo} · evidencia y cita
                        </p>
                        <SemaforoDetalle items={f.no_negociables} />
                      </td>
                    </tr>
                  )}
                  {panelesMontados.includes(f.id) && (
                    <tr className="border-b border-[var(--lh-rule)] bg-liv-50/40" hidden={preguntasDe !== f.id}>
                      <td />
                      <td colSpan={9} className="px-3 py-4">
                        <PanelPreguntas candidatoVacanteId={f.id} noNegociables={f.no_negociables} tieneFicha={Boolean(f.ficha.descripcion)} tieneCv={f.tiene_cv} />
                      </td>
                    </tr>
                  )}
                  {sugMontadas.includes(f.id) && (
                    <tr className="border-b border-[var(--lh-rule)] bg-emerald-50/40" hidden={sugerenciasDe !== f.id}>
                      <td />
                      <td colSpan={9} className="px-3 py-4">
                        <PanelSugerencias candidatoVacanteId={f.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Espacio para que la barra flotante no tape la última fila. */}
      {sel.length > 0 && <div className="h-20" aria-hidden />}

      {sel.length > 0 && (
        <div className="animate-drawer glass fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-white/60 py-2 pr-2 pl-5 text-sm shadow-[0_20px_50px_-15px_rgb(17_24_39/0.35),0_0_0_1px_rgb(17_24_39/0.06)]">
          <span className="num font-semibold">
            {sel.length} seleccionado{sel.length > 1 ? "s" : ""}
          </span>
          <button onClick={() => setSel([])} className="press rounded-full px-2 py-1 text-stone-500 hover:bg-stone-900/5 hover:text-stone-900">
            Limpiar
          </button>
          {sel.length >= 2 ? (
            <Link href={`${base}/comparar?ids=${sel.join(",")}`} className="press btn-liv rounded-full px-4 py-2 font-semibold">
              Comparar lado a lado →
            </Link>
          ) : (
            <span className="rounded-full bg-stone-900/5 px-4 py-2 text-stone-500">Elige 2 o más</span>
          )}
        </div>
      )}

      {cv && <VisorCv candidatoId={cv.candidato_id} nombre={cv.nombre} onCerrar={() => setCv(null)} />}
    </>
  );
}
