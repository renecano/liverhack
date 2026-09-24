'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { agendarEntrevista, type ResultadoAgendar } from '@/lib/actions/entrevistas';

export interface OpcionCandidato {
  id: string; // candidato_vacante.id
  nombre: string;
  vacante: string;
}
export interface OpcionEntrevistador {
  id: string;
  nombre: string;
  area: string | null;
}

const campo = 'w-full rounded-xl border border-stone-900/10 bg-white px-3 py-2 text-[14px] outline-none focus:border-liv/50 focus:ring-4 focus:ring-liv/10';

/** Formulario para agendar una entrevista con varios entrevistadores. */
export function AgendarEntrevista({ candidatos, entrevistadores, modoReal }: { candidatos: OpcionCandidato[]; entrevistadores: OpcionEntrevistador[]; modoReal: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [resultado, setResultado] = useState<ResultadoAgendar | null>(null);

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const form = ev.currentTarget;
    iniciar(async () => {
      const r = await agendarEntrevista({
        candidato_vacante_id: String(f.get('candidato')),
        tipo: f.get('tipo') === 'panel' ? 'panel' : 'competencias',
        inicio: String(f.get('inicio')),
        duracion_min: Number(f.get('duracion')),
        entrevistadores: elegidos,
      });
      setResultado(r);
      if (r.ok) {
        form.reset();
        setElegidos([]);
        router.refresh();
      }
    });
  }

  const alternar = (id: string) => setElegidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  return (
    <form onSubmit={enviar} className="surface space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <CalendarPlus className="h-5 w-5 text-liv" />
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Agendar entrevista</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-[13px] font-medium text-stone-700 md:col-span-2">
          Candidato
          <select name="candidato" required className={`${campo} mt-1`} defaultValue="">
            <option value="" disabled>
              Elige candidato…
            </option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.vacante}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-medium text-stone-700">
          Tipo
          <select name="tipo" className={`${campo} mt-1`} defaultValue="competencias">
            <option value="competencias">Competencias (1 a 1)</option>
            <option value="panel">Panel</option>
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="block text-[13px] font-medium text-stone-700">
            Fecha y hora (CDMX)
            <input type="datetime-local" name="inicio" required className={`${campo} mt-1`} />
          </label>
          <label className="block text-[13px] font-medium text-stone-700">
            Duración
            <select name="duracion" className={`${campo} mt-1`} defaultValue="60">
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium text-stone-700">Entrevistadores ({elegidos.length})</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {entrevistadores.map((u) => {
            const activo = elegidos.includes(u.id);
            return (
              <label
                key={u.id}
                className={`press flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] ${activo ? 'border-liv bg-liv-50 font-semibold text-liv-deep' : 'border-stone-900/10 bg-white text-stone-600 hover:border-liv/40'}`}
              >
                <input type="checkbox" className="sr-only" checked={activo} onChange={() => alternar(u.id)} />
                {u.nombre}
                {u.area && <span className="text-[11.5px] font-normal text-stone-400">{u.area}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline pt-4">
        <p className="text-[12.5px] text-stone-500">
          {modoReal ? 'Se creará el evento en tu Google Calendar con los entrevistadores como invitados.' : 'Modo interno: la entrevista se guarda en LivHire con su fecha.'}
        </p>
        <button disabled={pendiente || !elegidos.length} className="press btn-liv rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-40">
          {pendiente ? 'Agendando…' : 'Agendar'}
        </button>
      </div>
      {resultado && (
        <div
          role="status"
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] ring-1 ${!resultado.ok ? 'bg-rose-50 text-rose-700 ring-rose-600/15' : resultado.modo === 'interno' && resultado.aviso ? 'bg-amber-50 text-amber-900 ring-amber-600/15' : 'bg-emerald-50 text-emerald-800 ring-emerald-600/15'}`}
        >
          {!resultado.ok && resultado.error}
          {resultado.ok && resultado.modo === 'real' && (
            <span className="flex flex-wrap items-center gap-2">
              Entrevista agendada y creada en Google Calendar.
              {resultado.htmlLink && (
                <a href={resultado.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                  Ver en Google Calendar <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </span>
          )}
          {resultado.ok && resultado.modo === 'interno' && (resultado.aviso ?? 'Entrevista agendada en LivHire (modo interno).')}
        </div>
      )}
    </form>
  );
}
