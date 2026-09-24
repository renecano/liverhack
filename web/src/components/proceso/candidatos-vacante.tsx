'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, GitCompare, X } from 'lucide-react';
import type { FilaCandidato } from '@/lib/ia/consultas';
import type { EstadoProceso } from '@/lib/supabase/types';
import { BadgeReferido } from '@/components/ia/BadgeReferido';
import { BotonCv } from '@/components/ia/BotonCv';
import { Punto } from '@/components/ia/Semaforo';
import { Folder } from '@/components/ui/Folder';
import { Ring } from '@/components/ui/Ring';
import { CandidateActions } from './candidate-actions';

const ESTATUS: Record<string, string> = {
  activo: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  finalista: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  contratado: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  pool: 'bg-stone-100 text-stone-600 ring-stone-600/10',
  descartado: 'bg-rose-50 text-rose-700 ring-rose-600/15',
};

/** Candidatos de una vacante como carpetas flotantes; selecciona 2+ para comparar lado a lado. */
export function CandidatosVacante({ filas, vacanteId, estado, baseComparar }: { filas: FilaCandidato[]; vacanteId: string; estado: EstadoProceso; baseComparar: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const mejorFit = Math.max(...filas.map((f) => f.fit_score ?? -1));

  return (
    <>
      <div className="grid gap-x-5 gap-y-8 pt-3 md:grid-cols-2 xl:grid-cols-3">
        {filas.map((f, i) => {
          const marcado = sel.includes(f.id);
          return (
            <Folder key={f.id} className="animate-rise" style={{ animationDelay: `${i * 55}ms` }} cardClassName={`h-full p-5 ${marcado ? 'ring-2 ring-liv/60' : ''}`}>
              <div className="flex items-start gap-4">
                <Ring valor={f.fit_score} size={56} destacado={f.fit_score === mejorFit && mejorFit >= 0} label="Compatibilidad (Potencial Global)" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em]">{f.nombre}</h3>
                    {f.es_referido && <BadgeReferido />}
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-stone-500">
                    {f.puesto_actual ?? 'Puesto no registrado'}{f.empresa_actual ? ` · ${f.empresa_actual}` : ''}
                  </p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${ESTATUS[f.estatus] ?? ESTATUS.pool}`}>{f.estatus}</span>
                </div>
                <button
                  onClick={() => alternar(f.id)}
                  aria-pressed={marcado}
                  aria-label={`${marcado ? 'Quitar' : 'Agregar'} a ${f.nombre} de la comparativa`}
                  className={`press focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 transition-colors ${marcado ? 'bg-liv text-white ring-liv' : 'bg-white text-transparent ring-stone-900/15 hover:ring-liv/50'}`}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-stone-900/[0.025] p-3">
                <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.12em] text-stone-400">
                  No negociables <span className="tabular normal-case tracking-normal text-stone-600">{f.compatibilidad_nnn ?? '—'}%</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {f.no_negociables.map((n) => (
                    <li key={n.id} className="flex items-center gap-2 text-[12.5px]" title={n.evidencia ?? undefined}>
                      <Punto estado={n.estado} />
                      <span className="truncate text-stone-700">{n.texto}</span>
                    </li>
                  ))}
                  {f.no_negociables.length === 0 && <li className="text-[12px] text-stone-400">Sin no negociables registrados.</li>}
                </ul>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-stone-500">{f.escolaridad ?? '—'}</span>
                {f.tiene_cv && <BotonCv candidatoId={f.candidato_id} nombre={f.nombre} />}
              </div>

              {estado === 'ESPERANDO_HM_DECIDE_FINALISTA' && (
                <div className="mt-4 border-t hairline pt-4">
                  <CandidateActions vacanteId={vacanteId} candidatoId={f.candidato_id} candidatoNombre={f.nombre} estado={estado} compacto />
                </div>
              )}
            </Folder>
          );
        })}
      </div>

      {sel.length > 0 && <div className="h-20" aria-hidden />}
      {sel.length > 0 && (
        <div className="animate-drawer glass fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-white/60 py-2 pr-2 pl-5 text-[13.5px] shadow-[0_20px_50px_-15px_rgb(17_24_39/0.35),0_0_0_1px_rgb(17_24_39/0.06)]">
          <span className="tabular font-semibold">{sel.length} seleccionado{sel.length > 1 ? 's' : ''}</span>
          <button onClick={() => setSel([])} aria-label="Limpiar selección" className="press grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-900/5"><X className="h-4 w-4" /></button>
          {sel.length >= 2 ? (
            <Link href={`${baseComparar}?ids=${sel.join(',')}`} className="press btn-liv inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold">
              <GitCompare className="h-4 w-4" /> Comparar lado a lado
            </Link>
          ) : (
            <span className="rounded-full bg-stone-900/5 px-4 py-2 text-stone-500">Elige 2 o más</span>
          )}
        </div>
      )}
    </>
  );
}
