"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { FilaCandidato } from "@/lib/ia/consultas";
import { mxn } from "@/lib/ia/formato";
import { BadgeReferido } from "./BadgeReferido";
import { PanelPreguntas } from "./PanelPreguntas";
import { Semaforo, SemaforoDetalle } from "./Semaforo";
import { VisorCv } from "./VisorCv";

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
        <span className="block h-full rounded-full bg-[var(--lh-ink)]" style={{ width: `${valor}%` }} />
      </span>
    </div>
  );
}

export function ListaCandidatos({ filas }: { filas: FilaCandidato[] }) {
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

  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-[var(--lh-rule)] bg-[var(--lh-card)]">
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--lh-rule)] whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">
              <th className="w-10 px-4 py-3" />
              <th className="px-3 py-3 font-medium">Candidato</th>
              <th className="px-3 py-3 font-medium">Vacante</th>
              <th className="px-3 py-3 font-medium">Escolaridad</th>
              <th className="px-3 py-3 font-medium">Compensación act. / des.</th>
              <th className="px-3 py-3 font-medium">Compatibilidad</th>
              <th className="px-3 py-3 font-medium">No negociables</th>
              <th className="px-3 py-3 font-medium">Estatus</th>
              <th className="px-3 py-3 font-medium">CV</th>
              <th className="px-3 py-3 font-medium">Entrevista</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const marcado = sel.includes(f.id);
              return (
                <Fragment key={f.id}>
                  <tr
                    className={`lh-rise border-b border-[var(--lh-rule)] transition-colors ${marcado ? "bg-[#fbeef5]" : "hover:bg-stone-50"}`}
                    style={{ animationDelay: `${i * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(f.id)}
                        aria-label={`Seleccionar a ${f.nombre}`}
                        className="h-4 w-4 accent-[var(--lh-accent)]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{f.nombre}</span>
                        {f.es_referido && <BadgeReferido />}
                      </div>
                      <p className="text-xs text-[var(--lh-muted)]">
                        {f.puesto_actual ?? "—"}
                        {f.empresa_actual ? ` · ${f.empresa_actual}` : ""}
                      </p>
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
                        className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100"
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
                        className="whitespace-nowrap rounded border border-[var(--lh-rule)] px-2.5 py-1 text-xs hover:border-[var(--lh-ink)]"
                      >
                        Ver PDF
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => alternarPreguntas(f.id)}
                        aria-expanded={preguntasDe === f.id}
                        className={`whitespace-nowrap rounded border px-2.5 py-1 text-xs ${
                          preguntasDe === f.id
                            ? "border-[var(--lh-ink)] bg-[var(--lh-ink)] text-white"
                            : "border-[var(--lh-rule)] hover:border-[var(--lh-ink)]"
                        }`}
                      >
                        Preguntas
                      </button>
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
                    <tr className="border-b border-[var(--lh-rule)] bg-[#fbf7f1]" hidden={preguntasDe !== f.id}>
                      <td />
                      <td colSpan={9} className="px-3 py-4">
                        <PanelPreguntas candidatoVacanteId={f.id} noNegociables={f.no_negociables} />
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
        <div className="lh-rise fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-4 rounded-full bg-[var(--lh-ink)] py-2 pl-5 pr-2 text-sm text-white shadow-xl">
          <span className="num">
            {sel.length} seleccionado{sel.length > 1 ? "s" : ""}
          </span>
          <button onClick={() => setSel([])} className="text-stone-300 hover:text-white">
            Limpiar
          </button>
          {sel.length >= 2 ? (
            <Link
              href={`/hm/candidatos/comparar?ids=${sel.join(",")}`}
              className="rounded-full bg-[var(--lh-accent)] px-4 py-1.5 font-medium hover:brightness-110"
            >
              Comparar lado a lado →
            </Link>
          ) : (
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-stone-300">Elige 2 o más</span>
          )}
        </div>
      )}

      {cv && <VisorCv candidatoId={cv.candidato_id} nombre={cv.nombre} onCerrar={() => setCv(null)} />}
    </>
  );
}
