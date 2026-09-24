'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarLoteNotificaciones } from '@/lib/actions/proceso';
import type { Entrega } from '@/lib/acciones/entrega';
import type { Notificacion } from '@/lib/supabase/types';
import { BotonPersonalizarIA } from '@/components/ia/BotonPersonalizarIA';

// Borradores que la IA puede reescribir: avisos a candidatos de avance o cierre.
const personalizable = (n: Notificacion) =>
  n.estatus === 'borrador' && n.destinatario_tipo === 'candidato' && (n.tipo === 'cambio_etapa' || n.tipo === 'resultado');

// Etiqueta del estatus con el modo de entrega: enviada · real / simulada / portal.
function etiquetaEstatus(n: Notificacion, e: Entrega | undefined): string {
  if (n.estatus === 'enviada' && e?.resultado === 'enviada') {
    return e.modo === 'real' ? 'enviada · real' : e.modo === 'simulado' ? 'enviada · simulada' : 'enviada · portal';
  }
  if (n.estatus === 'aprobada' && e?.resultado === 'fallo') return 'aprobada · envío fallido';
  return n.estatus;
}

export function NotificationCenter({ notificaciones, entregas = {} }: { notificaciones: Notificacion[]; entregas?: Record<string, Entrega> }) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<{ id: string; error: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  // Personalizaciones en curso: mientras haya alguna, "Aprobar lote" queda deshabilitado.
  const [personalizando, setPersonalizando] = useState(0);
  const borradores = notificaciones.filter((n) => n.estatus === 'borrador');
  // Aprobadas sin enviar (p. ej. su envío falló): se pueden (re)enviar.
  const pendientesEnvio = notificaciones.filter((n) => n.estatus === 'aprobada');
  const personalizables = notificaciones.filter(personalizable);
  const alEmpezar = () => setPersonalizando((x) => x + 1);
  // Al terminar se refresca para ver el texto reescrito por la IA antes de aprobar.
  const alTerminar = () => {
    setPersonalizando((x) => Math.max(0, x - 1));
    router.refresh();
  };
  async function procesar(lote: Notificacion[]) {
    setEnviando(true); setMensaje(null); setErrores([]);
    const resultado = await aprobarLoteNotificaciones(lote.map((n) => n.id));
    setEnviando(false);
    if (resultado.ok) {
      const d = resultado.data;
      const detalle = [d.reales ? `${d.reales} real(es)` : null, d.simuladas ? `${d.simuladas} simulada(s)` : null].filter(Boolean).join(' · ');
      setMensaje(`${d.aprobadas} aprobada(s), ${d.enviadas} enviada(s)${detalle ? ` (${detalle})` : ''}${d.fallidas ? ` · ${d.fallidas} con envío fallido (siguen aprobadas; puedes reintentar con "Enviar aprobadas")` : ''}.`);
      setErrores(d.errores);
      router.refresh();
    } else {
      setMensaje(`${resultado.codigo}: ${resultado.error}`);
    }
  }
  const errorDe = (n: Notificacion) => {
    const e = entregas[n.id];
    return errores.find((x) => x.id === n.id)?.error ?? (n.estatus === 'aprobada' && e?.resultado === 'fallo' ? e.error : null);
  };
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Centro de notificaciones</h2><p className="mt-1 text-sm text-slate-500">Cero ghosting: cada aviso conserva su estado de aprobación.</p></div><div className="flex flex-wrap items-start gap-2">{personalizables.length > 1 && <BotonPersonalizarIA ids={personalizables.map((n) => n.id)} texto="Personalizar todos con IA" deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} />}{pendientesEnvio.length > 0 && <button onClick={() => procesar(pendientesEnvio)} disabled={enviando || personalizando > 0} className="rounded-md border border-[#c8105a] px-3 py-2 text-sm font-semibold text-[#c8105a] disabled:opacity-40">{`Enviar aprobadas (${pendientesEnvio.length})`}</button>}<button onClick={() => procesar(borradores)} disabled={!borradores.length || enviando || personalizando > 0} title={personalizando > 0 ? 'Espera a que termine la personalización con IA' : undefined} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{enviando ? 'Procesando…' : `Aprobar lote (${borradores.length})`}</button></div></div>{mensaje && <p role="status" className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{mensaje}</p>}<ul className="mt-4 divide-y divide-stone-100">{notificaciones.length ? notificaciones.map((n) => { const e = entregas[n.id]; const error = errorDe(n); return <li key={n.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{n.tipo} · {n.canal}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${n.estatus === 'borrador' ? 'bg-amber-100 text-amber-800' : n.estatus === 'aprobada' ? (error ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800') : 'bg-emerald-100 text-emerald-800'}`}>{error && n.estatus === 'aprobada' ? 'aprobada · envío fallido' : etiquetaEstatus(n, e)}</span></div><p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.contenido ?? 'Sin contenido'}</p>{n.estatus === 'enviada' && e?.resultado === 'enviada' && e.mensaje_id && <p className="mt-1 font-mono text-xs text-slate-400">Resend id: {e.mensaje_id}</p>}{error && <p role="alert" className="mt-1 text-xs text-rose-700">No se envió: {error}</p>}{personalizable(n) && <div className="mt-2"><BotonPersonalizarIA ids={n.id} mostrarDetalle={false} deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} /></div>}</li>; }) : <li className="py-4 text-sm text-slate-500">No hay notificaciones visibles.</li>}</ul></section>;
}
