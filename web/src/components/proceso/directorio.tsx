'use client';

import { useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { GlideSelect } from '@/components/ui/GlideSelect';
import { SlaChip } from '@/components/ui/Sla';

export type FilaDirectorio = {
  id: string;
  titulo: string;
  etapa: string;
  area: string;
  semaforo: string;
  hm: string | null;
  at: string | null;
  hrbp: string | null;
  bloquea: string | null;
};

type Filtro = 'todas' | 'atrasada' | 'en_riesgo' | 'bloqueos';

/** Directorio estratégico: quién es HM / AT / HRBP de cada vacante y quién bloquea. */
export function Directorio({ filas }: { filas: FilaDirectorio[] }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const t = q.trim().toLowerCase();
  const visibles = filas.filter((f) => {
    if (filtro === 'bloqueos' && !f.bloquea) return false;
    if ((filtro === 'atrasada' || filtro === 'en_riesgo') && f.semaforo !== filtro) return false;
    if (!t) return true;
    return [f.titulo, f.area, f.hm, f.at, f.hrbp].some((x) => x?.toLowerCase().includes(t));
  });

  return (
    <div className="surface overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline p-4">
        <GlideSelect
          size="sm"
          value={filtro}
          onChange={setFiltro}
          ariaLabel="Filtrar directorio"
          options={[
            { value: 'todas', label: 'Todas', count: filas.length },
            { value: 'atrasada', label: 'Atrasadas', count: filas.filter((f) => f.semaforo === 'atrasada').length, tone: 'bad' },
            { value: 'en_riesgo', label: 'En riesgo', count: filas.filter((f) => f.semaforo === 'en_riesgo').length, tone: 'warn' },
            { value: 'bloqueos', label: 'Con bloqueo', count: filas.filter((f) => f.bloquea).length, tone: 'bad' },
          ]}
        />
        <label className="flex w-full items-center gap-2 rounded-full border border-stone-900/10 bg-white px-3.5 py-2 focus-within:border-liv/50 focus-within:ring-4 focus-within:ring-liv/10 sm:w-72">
          <Search className="h-4 w-4 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar vacante, área o persona…" aria-label="Buscar en el directorio" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-stone-400" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[13.5px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">
              <th className="px-5 py-3">Vacante</th>
              <th className="px-3 py-3">Área</th>
              <th className="px-3 py-3">SLA</th>
              <th className="px-3 py-3">HM</th>
              <th className="px-3 py-3">AT</th>
              <th className="px-3 py-3">HRBP</th>
              <th className="px-5 py-3">Bloquea</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((v) => (
              <tr key={v.id} className="border-t hairline transition-colors hover:bg-stone-900/[0.015]">
                <td className="px-5 py-3.5">
                  <p className="font-semibold">{v.titulo}</p>
                  <p className="text-[12px] text-stone-500">{v.etapa}</p>
                </td>
                <td className="px-3 py-3.5 text-stone-600">{v.area}</td>
                <td className="px-3 py-3.5"><SlaChip valor={v.semaforo} /></td>
                <td className="px-3 py-3.5"><Persona nombre={v.hm} /></td>
                <td className="px-3 py-3.5"><Persona nombre={v.at} /></td>
                <td className="px-3 py-3.5"><Persona nombre={v.hrbp} /></td>
                <td className="px-5 py-3.5">
                  {v.bloquea ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-700 ring-1 ring-rose-600/15"><TriangleAlert className="h-3 w-3" />{v.bloquea}</span>
                  ) : (
                    <span className="text-stone-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-stone-400">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Persona({ nombre }: { nombre: string | null }) {
  if (!nombre) return <span className="text-stone-300">—</span>;
  const ini = nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900/[0.06] text-[10px] font-bold text-stone-600">{ini}</span>
      <span className="whitespace-nowrap">{nombre}</span>
    </span>
  );
}
