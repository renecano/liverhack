'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, Mail, UserRound } from 'lucide-react';

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/**
 * Menú de la cuenta en sesión: nombre, rol y correo (solo lectura, datos de la sesión).
 * Deja claro con qué cuenta y rol se está trabajando.
 */
export function MenuUsuario({ nombre, rolLabel, email }: { nombre: string; rolLabel: string; email?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={panelId}
        aria-label={`Mi cuenta: ${nombre} (${rolLabel})`}
        title="Mi cuenta"
        className="press focus-ring grid h-9 w-9 place-items-center rounded-full bg-stone-950 text-[12px] font-semibold text-white ring-2 ring-white transition-shadow hover:ring-liv/40"
      >
        {iniciales(nombre) || '·'}
      </button>

      {abierto && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Mi cuenta"
          className="animate-pop absolute right-0 top-full z-50 mt-2.5 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.04)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 border-b border-stone-200/60 px-4 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-950 text-[14px] font-semibold text-white">
              {iniciales(nombre) || '·'}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[14.5px] font-semibold text-stone-950">{nombre}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-liv-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.1em] text-liv-deep ring-1 ring-liv/20">
                {rolLabel}
              </p>
            </div>
          </div>
          <dl className="space-y-2.5 px-4 py-3.5 text-[12.5px]">
            <div className="flex items-start gap-2.5">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              <div className="min-w-0">
                <dt className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-stone-400">Nombre</dt>
                <dd className="truncate text-stone-800">{nombre}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              <div className="min-w-0">
                <dt className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-stone-400">Rol</dt>
                <dd className="text-stone-800">{rolLabel}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              <div className="min-w-0">
                <dt className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-stone-400">Correo</dt>
                <dd className="break-all text-stone-800">{email || '—'}</dd>
              </div>
            </div>
          </dl>
          <p className="flex items-center gap-1.5 border-t border-stone-200/60 bg-stone-50/70 px-4 py-2.5 text-[11px] text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Sesión activa con esta cuenta
          </p>
        </div>
      )}
    </div>
  );
}
