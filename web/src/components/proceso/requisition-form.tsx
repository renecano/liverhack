'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, LoaderCircle, Lock, LockKeyhole, LockOpen, Sparkles } from 'lucide-react';
import { abrirVacante } from '@/lib/actions/proceso';

type Persona = { id: string; nombre: string; rol: string };
type Posicion = { id: string; nombre_puesto: string; area: string; nivel: string; autorizada: boolean };
type Aviso = { ok: boolean; texto: string; candado?: boolean };

const campo =
  'mt-1.5 w-full rounded-xl border border-stone-900/10 bg-white px-3 py-2.5 text-[14px] outline-none transition-shadow focus:border-liv/50 focus:ring-4 focus:ring-liv/10';
const etiqueta = 'text-[12px] font-semibold uppercase tracking-[.12em] text-stone-500';

export function RequisitionForm({ posiciones, personas }: { posiciones: Posicion[]; personas: Persona[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const autorizadas = posiciones.filter((p) => p.autorizada);
  const bloqueadas = posiciones.filter((p) => !p.autorizada);
  const [posicionId, setPosicionId] = useState(autorizadas[0]?.id ?? posiciones[0]?.id ?? '');
  const [intento, setIntento] = useState(0);
  const posicion = posiciones.find((p) => p.id === posicionId);
  const bloqueada = posicion ? !posicion.autorizada : false;
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
      const candado = resultado.codigo === 'CANDADO_POSICION';
      setAviso({ ok: false, candado, texto: candado ? resultado.error : `${resultado.codigo}: ${resultado.error}` });
      setIntento((n) => n + 1);
    }
  }

  return (
    <section className="surface overflow-hidden rounded-3xl">
      <div className="grid lg:grid-cols-[320px_1fr]">
        {/* Estado del candado */}
        <div className={`relative flex flex-col justify-between gap-6 overflow-hidden p-6 transition-colors duration-500 sm:p-7 ${bloqueada ? 'bg-rose-950 text-white' : 'bg-stone-950 text-white'}`}>
          <div aria-hidden className={`absolute -top-24 -left-16 h-64 w-64 rounded-full blur-3xl transition-colors duration-700 ${bloqueada ? 'bg-rose-500/40' : 'bg-liv/35'}`} />
          <div className="relative">
            <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-white/60">Candado de posición</p>
            <h2 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.02em]">Nueva requisición</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">Solo se abre proceso sobre posiciones que existen y están autorizadas. El candado también se valida en base de datos.</p>
          </div>
          <div key={intento} className={`relative flex items-center gap-4 ${aviso?.candado ? 'animate-shake' : ''}`}>
            <span className={`grid h-16 w-16 place-items-center rounded-2xl ring-1 transition-all duration-500 ease-spring ${bloqueada ? 'bg-rose-500 ring-rose-300/40 scale-105' : 'bg-white/10 ring-white/15'}`}>
              {bloqueada ? <LockKeyhole className="h-7 w-7" /> : <LockOpen className="h-7 w-7 text-emerald-300" />}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{bloqueada ? 'Posición bloqueada' : 'Posición autorizada'}</p>
              <p className="truncate text-[12.5px] text-white/60">{posicion ? `${posicion.nombre_puesto} · ${posicion.area}` : 'Elige una posición'}</p>
            </div>
          </div>
          <div className="relative flex gap-4 text-[12px] text-white/60">
            <span className="inline-flex items-center gap-1.5"><LockOpen className="h-3.5 w-3.5 text-emerald-300" />{autorizadas.length} autorizadas</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-rose-300" />{bloqueadas.length} bloqueadas</span>
          </div>
        </div>

        <form ref={formRef} onSubmit={enviar} className="grid gap-4 p-6 sm:p-7 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className={etiqueta}>Posición</span>
            <select required name="posicion_id" value={posicionId} onChange={(e) => { setPosicionId(e.target.value); setAviso(null); }} className={`${campo} ${bloqueada ? 'border-rose-400 ring-4 ring-rose-500/10' : ''}`}>
              <optgroup label="Autorizadas">
                {autorizadas.map((p) => <option key={p.id} value={p.id}>{p.nombre_puesto} · {p.area} ({p.nivel})</option>)}
              </optgroup>
              {bloqueadas.length > 0 && (
                <optgroup label="Sin autorización (candado)">
                  {bloqueadas.map((p) => <option key={p.id} value={p.id}>{p.nombre_puesto} · {p.area} ({p.nivel})</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="md:col-span-2">
            <span className={etiqueta}>Título de la vacante</span>
            <input required minLength={3} name="titulo" className={campo} placeholder="Ej. Gerente de…" />
          </label>
          <label>
            <span className={etiqueta}>Hiring Manager</span>
            <select required name="hm_id" className={campo}>{hms.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
          <label>
            <span className={etiqueta}>Atracción de Talento</span>
            <select required name="at_id" className={campo}>{ats.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </label>
          <label className="md:col-span-2">
            <span className={etiqueta}>Descripción</span>
            <textarea name="descripcion" className={`${campo} min-h-20`} placeholder="Responsabilidades, rango salarial, contexto del equipo…" />
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-stone-700">
            <input name="fuente_referidos" type="checkbox" className="h-4 w-4 accent-[#e2007a]" />
            <Sparkles className="h-3.5 w-3.5 text-liv" /> Considerar fuente de referidos
          </label>
          <div className="flex items-center justify-end">
            <button
              disabled={!posiciones.length || !hms.length || !ats.length || enviando}
              className={`press focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40 ${bloqueada ? 'bg-rose-600 hover:bg-rose-700' : 'btn-liv'}`}
            >
              {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : bloqueada ? <LockKeyhole className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              {enviando ? 'Validando candado…' : bloqueada ? 'Intentar abrir (bloqueada)' : 'Abrir requisición'}
            </button>
          </div>
          {bloqueada && !aviso && (
            <p className="animate-rise md:col-span-2 rounded-xl bg-rose-50 p-3 text-[13px] text-rose-800 ring-1 ring-rose-600/15">
              Esta posición no está autorizada: el candado impedirá abrir el proceso para no gastar el tiempo de nadie.
            </p>
          )}
          {aviso && (
            <p role={aviso.ok ? 'status' : 'alert'} className={`animate-rise md:col-span-2 flex items-start gap-2 rounded-xl p-3 text-[13px] ring-1 ${aviso.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/15' : 'bg-rose-50 text-rose-800 ring-rose-600/15'}`}>
              {aviso.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{aviso.candado && <strong className="font-semibold">Candado de posición · </strong>}{aviso.texto}</span>
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
