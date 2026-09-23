'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { abrirVacante } from '@/lib/actions/proceso';

type Persona = { id: string; nombre: string; rol: string };
type Posicion = { id: string; nombre_puesto: string; area: string; nivel: string; autorizada: boolean };
type Aviso = { ok: boolean; texto: string };

export function RequisitionForm({ posiciones, personas }: { posiciones: Posicion[]; personas: Persona[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const hms = personas.filter((p) => p.rol === 'hm');
  const ats = personas.filter((p) => p.rol === 'at');
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAviso(null); setEnviando(true);
    // FormData se toma ANTES del await (event.currentTarget es null tras el await);
    // para el reset guardamos una ref al form, no event.currentTarget.
    const form = new FormData(event.currentTarget);
    const resultado = await abrirVacante({ posicion_id: String(form.get('posicion_id')), titulo: String(form.get('titulo')), descripcion: String(form.get('descripcion')) || undefined, hm_id: String(form.get('hm_id')), at_id: String(form.get('at_id')), fuente_referidos: form.get('fuente_referidos') === 'on' });
    setEnviando(false);
    if (resultado.ok) {
      setAviso({ ok: true, texto: `Requisición creada: ${resultado.data.vacante.titulo}. Estado ${resultado.data.estado}.` });
      formRef.current?.reset();
      router.refresh();
    } else {
      const texto = resultado.codigo === 'CANDADO_POSICION' ? `Candado de posición — ${resultado.error}` : `${resultado.codigo}: ${resultado.error}`;
      setAviso({ ok: false, texto });
    }
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Nueva requisición</h2><p className="mt-1 text-sm text-slate-600">Solo se muestran posiciones autorizadas. El candado también se valida en base de datos.</p><form ref={formRef} onSubmit={enviar} className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Posición autorizada<select required name="posicion_id" className="mt-1 w-full rounded-md border border-stone-300 bg-white p-2">{posiciones.map((p) => <option key={p.id} value={p.id}>{p.nombre_puesto} · {p.area} ({p.nivel})</option>)}</select></label><label className="text-sm font-medium">Título de la vacante<input required minLength={3} name="titulo" className="mt-1 w-full rounded-md border border-stone-300 p-2" placeholder="Ej. Gerente de…" /></label><label className="text-sm font-medium">Hiring Manager<select required name="hm_id" className="mt-1 w-full rounded-md border border-stone-300 bg-white p-2">{hms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><label className="text-sm font-medium">Atracción de Talento<select required name="at_id" className="mt-1 w-full rounded-md border border-stone-300 bg-white p-2">{ats.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><label className="md:col-span-2 text-sm font-medium">Descripción<textarea name="descripcion" className="mt-1 min-h-20 w-full rounded-md border border-stone-300 p-2" /></label><label className="flex items-center gap-2 text-sm"><input name="fuente_referidos" type="checkbox" /> Considerar fuente de referidos</label><div className="flex items-end"><button disabled={!posiciones.length || !hms.length || !ats.length || enviando} className="rounded-md bg-[#c8105a] px-4 py-2 font-semibold text-white disabled:opacity-40">{enviando ? 'Creando…' : 'Abrir requisición'}</button></div></form>{aviso && <p role={aviso.ok ? 'status' : 'alert'} className={`mt-4 rounded-md p-3 text-sm ${aviso.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{aviso.texto}</p>}</section>;
}
