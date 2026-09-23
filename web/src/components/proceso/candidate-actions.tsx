'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmarPasoHM, registrarDecision } from '@/lib/actions/proceso';
import type { EstadoProceso, TipoDecision } from '@/lib/supabase/types';

const etiquetas: Record<TipoDecision, string> = { avanzar_oferta: 'Avanzar a oferta', reemparejar: 'Re-emparejar', pool: 'Enviar al pool', finalista: 'Finalista', descartado: 'Descartado' };
const compuertas = new Set<EstadoProceso>(['ESPERANDO_HM_VALIDA_NNN', 'ESPERANDO_HM_SELECCIONA_PERFILES', 'ESPERANDO_HM_DEFINE_POOL']);

export function CandidateActions({ vacanteId, candidatoId, estado }: { vacanteId: string; candidatoId?: string; estado: EstadoProceso }) {
  const router = useRouter();
  const [accion, setAccion] = useState<TipoDecision | 'confirmar' | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const acciones: TipoDecision[] = estado === 'ESPERANDO_HM_DECIDE_FINALISTA' ? ['finalista', 'avanzar_oferta', 'reemparejar', 'pool', 'descartado'] : ['reemparejar', 'pool', 'descartado'];
  if (compuertas.has(estado)) return <div><button onClick={() => setAccion('confirmar')} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white">Confirmar paso del HM</button><Justificacion abierta={accion === 'confirmar'} etiqueta="Confirmar paso del HM" valor={justificacion} onChange={setJustificacion} mensaje={mensaje} enviando={enviando} onCancel={() => setAccion(null)} onConfirm={async () => { setEnviando(true); const r = await confirmarPasoHM(vacanteId, justificacion); setEnviando(false); setMensaje(r.ok ? 'Paso confirmado. El estado se actualizó.' : `${r.codigo}: ${r.error}`); if (r.ok) { setAccion(null); setJustificacion(''); router.refresh(); } }} /></div>;
  if (!candidatoId || estado === 'CUBIERTA' || estado === 'CANCELADA') return null;
  return <div className="flex flex-wrap gap-2">{acciones.map((decision) => <button key={decision} onClick={() => { setAccion(decision); setMensaje(null); }} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${decision === 'descartado' ? 'border-rose-200 text-rose-700' : 'border-stone-300 text-slate-700 hover:border-[#c8105a]'}`}>{etiquetas[decision]}</button>)}<Justificacion abierta={!!accion && accion !== 'confirmar'} etiqueta={accion && accion !== 'confirmar' ? etiquetas[accion] : ''} valor={justificacion} onChange={setJustificacion} mensaje={mensaje} enviando={enviando} onCancel={() => setAccion(null)} onConfirm={async () => { if (!accion || accion === 'confirmar') return; setEnviando(true); const r = await registrarDecision(vacanteId, candidatoId, accion, justificacion); setEnviando(false); setMensaje(r.ok ? 'Decisión registrada y auditada.' : `${r.codigo}: ${r.error}`); if (r.ok) { setAccion(null); setJustificacion(''); router.refresh(); } }} /></div>;
}

function Justificacion({ abierta, etiqueta, valor, onChange, mensaje, enviando, onCancel, onConfirm }: { abierta: boolean; etiqueta: string; valor: string; onChange: (v: string) => void; mensaje: string | null; enviando: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!abierta) return null;
  return <div className="mt-3 w-full rounded-lg border border-[#c8105a]/30 bg-rose-50 p-3"><label className="block text-sm font-semibold">Justificación obligatoria: {etiqueta}<textarea required value={valor} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-20 w-full rounded-md border border-stone-300 bg-white p-2 text-sm" placeholder="Explica la decisión para el expediente y audit_log." /></label>{mensaje && <p role="alert" className="mt-2 text-sm text-rose-700">{mensaje}</p>}<div className="mt-3 flex gap-2"><button disabled={!valor.trim() || enviando} onClick={onConfirm} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{enviando ? 'Guardando…' : 'Confirmar con justificación'}</button><button onClick={onCancel} className="rounded-md border border-stone-300 px-3 py-2 text-sm">Cancelar</button></div></div>;
}
