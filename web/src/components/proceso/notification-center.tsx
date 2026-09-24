'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarLoteNotificaciones } from '@/lib/actions/proceso';
import type { Notificacion } from '@/lib/supabase/types';
import { BotonPersonalizarIA } from '@/components/ia/BotonPersonalizarIA';

// Borradores que la IA puede reescribir: avisos a candidatos de avance o cierre.
const personalizable = (n: Notificacion) =>
  n.estatus === 'borrador' && n.destinatario_tipo === 'candidato' && (n.tipo === 'cambio_etapa' || n.tipo === 'resultado');

export function NotificationCenter({ notificaciones }: { notificaciones: Notificacion[] }) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Personalizaciones en curso: mientras haya alguna, "Aprobar lote" queda deshabilitado.
  const [personalizando, setPersonalizando] = useState(0);
  const borradores = notificaciones.filter((n) => n.estatus === 'borrador');
  const personalizables = notificaciones.filter(personalizable);
  const alEmpezar = () => setPersonalizando((x) => x + 1);
  // Al terminar se refresca para ver el texto reescrito por la IA antes de aprobar.
  const alTerminar = () => {
    setPersonalizando((x) => Math.max(0, x - 1));
    router.refresh();
  };
  async function aprobar() {
    setEnviando(true); setMensaje(null);
    const resultado = await aprobarLoteNotificaciones(borradores.map((n) => n.id));
    setEnviando(false);
    if (resultado.ok) {
      const d = resultado.data;
      const detalle = [d.reales ? `${d.reales} real(es)` : null, d.simuladas ? `${d.simuladas} simulada(s)` : null].filter(Boolean).join(' · ');
      setMensaje(`${d.aprobadas} aprobada(s), ${d.enviadas} enviada(s)${detalle ? ` (${detalle})` : ''}${d.fallidas ? ` · ${d.fallidas} con envío fallido` : ''}.`);
      router.refresh();
    } else {
      setMensaje(`${resultado.codigo}: ${resultado.error}`);
    }
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Centro de notificaciones</h2><p className="mt-1 text-sm text-slate-500">Cero ghosting: cada aviso conserva su estado de aprobación.</p></div><div className="flex flex-wrap items-start gap-2">{personalizables.length > 1 && <BotonPersonalizarIA ids={personalizables.map((n) => n.id)} texto="Personalizar todos con IA" deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} />}<button onClick={aprobar} disabled={!borradores.length || enviando || personalizando > 0} title={personalizando > 0 ? 'Espera a que termine la personalización con IA' : undefined} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{enviando ? 'Procesando…' : `Aprobar lote (${borradores.length})`}</button></div></div>{mensaje && <p role="status" className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{mensaje}</p>}<ul className="mt-4 divide-y divide-stone-100">{notificaciones.length ? notificaciones.map((n) => <li key={n.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{n.tipo} · {n.canal}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${n.estatus === 'borrador' ? 'bg-amber-100 text-amber-800' : n.estatus === 'aprobada' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}>{n.estatus}</span></div><p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.contenido ?? 'Sin contenido'}</p>{personalizable(n) && <div className="mt-2"><BotonPersonalizarIA ids={n.id} mostrarDetalle={false} deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} /></div>}</li>) : <li className="py-4 text-sm text-slate-500">No hay notificaciones visibles.</li>}</ul></section>;
}
