'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarLoteNotificaciones } from '@/lib/actions/proceso';
import type { Notificacion } from '@/lib/supabase/types';

export function NotificationCenter({ notificaciones }: { notificaciones: Notificacion[] }) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const borradores = notificaciones.filter((n) => n.estatus === 'borrador');
  async function aprobar() {
    setEnviando(true); setMensaje(null);
    const resultado = await aprobarLoteNotificaciones(borradores.map((n) => n.id));
    setEnviando(false);
    setMensaje(resultado.ok ? `${resultado.data.aprobadas} notificación(es) aprobada(s) y enviada(s) de forma simulada.` : `${resultado.codigo}: ${resultado.error}`);
    if (resultado.ok) router.refresh();
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Centro de notificaciones</h2><p className="mt-1 text-sm text-slate-500">Cero ghosting: cada aviso conserva su estado de aprobación.</p></div><button onClick={aprobar} disabled={!borradores.length || enviando} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{enviando ? 'Procesando…' : `Aprobar lote (${borradores.length})`}</button></div>{mensaje && <p role="status" className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{mensaje}</p>}<ul className="mt-4 divide-y divide-stone-100">{notificaciones.length ? notificaciones.map((n) => <li key={n.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{n.tipo} · {n.canal}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${n.estatus === 'borrador' ? 'bg-amber-100 text-amber-800' : n.estatus === 'aprobada' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>{n.estatus}</span></div><p className="mt-1 text-sm text-slate-700">{n.contenido ?? 'Sin contenido'}</p></li>) : <li className="py-4 text-sm text-slate-500">No hay notificaciones visibles.</li>}</ul></section>;
}
