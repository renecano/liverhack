'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Archive, CircleCheck, CircleX, Gavel, LoaderCircle, Send, Shuffle, Trophy, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { confirmarPasoHM, registrarDecision } from '@/lib/actions/proceso';
import type { EstadoProceso, TipoDecision } from '@/lib/supabase/types';

const etiquetas: Record<TipoDecision, string> = { avanzar_oferta: 'Avanzar a oferta', reemparejar: 'Re-emparejar', pool: 'Enviar al pool', finalista: 'Finalista', descartado: 'Descartado' };
const ICONO: Record<TipoDecision, LucideIcon> = { finalista: Trophy, avanzar_oferta: Send, reemparejar: Shuffle, pool: Archive, descartado: CircleX };
const EXPLICA: Record<TipoDecision, string> = {
  finalista: 'El candidato pasa a finalista de la vacante.',
  avanzar_oferta: 'La vacante avanza a Oferta con este candidato.',
  reemparejar: 'El candidato sale de esta vacante y la IA le sugiere otras acordes a su perfil.',
  pool: 'El candidato queda en el pool para futuras vacantes.',
  descartado: 'El candidato queda descartado de esta vacante.',
};
// Irreversibles: exigen además confirmar explícitamente.
const IRREVERSIBLE = new Set<TipoDecision>(['finalista', 'avanzar_oferta', 'descartado']);
// Compuertas que el HM resuelve a nivel vacante (sin candidato): valida NNN, perfiles, pool.
const compuertas = new Set<EstadoProceso>(['ESPERANDO_HM_VALIDA_NNN', 'ESPERANDO_HM_SELECCIONA_PERFILES', 'ESPERANDO_HM_DEFINE_POOL']);
// Sólo aquí el HM decide sobre candidatos concretos (ver TRANSICIONES/EFECTO_DECISION).
const DECISIONES_FINALISTA: TipoDecision[] = ['finalista', 'avanzar_oferta', 'reemparejar', 'pool', 'descartado'];
const MIN_JUSTIFICACION = 10;

export function CandidateActions({ vacanteId, candidatoId, candidatoNombre, estado, compacto = false }: { vacanteId: string; candidatoId?: string; candidatoNombre?: string; estado: EstadoProceso; compacto?: boolean }) {
  const router = useRouter();
  const [accion, setAccion] = useState<TipoDecision | 'confirmar' | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cerrar = () => setAccion(null);
  const listo = (texto: string) => { setAccion(null); setExito(texto); router.refresh(); };

  // Compuerta general (nivel vacante): un único botón "Confirmar paso del HM".
  if (compuertas.has(estado)) {
    return (
      <div>
        <button onClick={() => { setAccion('confirmar'); setExito(null); }} className="press btn-liv focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold">
          <Gavel className="h-4 w-4" /> Confirmar paso del HM
        </button>
        {exito && <p role="status" className="animate-rise mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700"><CircleCheck className="h-4 w-4" />{exito}</p>}
        {accion === 'confirmar' && (
          <ModalJustificacion
            titulo="Confirmar paso del HM"
            explicacion="El orquestador avanzará la vacante a la siguiente etapa. Tu justificación queda en el expediente y en el audit log."
            irreversible={false}
            onCancel={cerrar}
            onConfirm={async (justificacion) => {
              const r = await confirmarPasoHM(vacanteId, justificacion);
              if (r.ok) listo('Paso confirmado. El estado se actualizó.');
              return r.ok ? null : traducirError(r.codigo, r.error);
            }}
          />
        )}
      </div>
    );
  }

  // Decisiones sobre un candidato: SOLO en la compuerta de finalista. En cualquier otro
  // estado no hay acción válida del HM sobre candidatos, así que no se muestra nada.
  if (!candidatoId || estado !== 'ESPERANDO_HM_DECIDE_FINALISTA') return null;
  return (
    <div>
      <div className={`flex flex-wrap gap-1.5 ${compacto ? '' : 'gap-2'}`}>
        {DECISIONES_FINALISTA.map((decision) => {
          const Icono = ICONO[decision];
          const peligro = decision === 'descartado';
          const principal = decision === 'finalista';
          return (
            <button
              key={decision}
              onClick={() => { setAccion(decision); setExito(null); }}
              className={`press focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset ${
                principal ? 'btn-liv ring-transparent' : peligro ? 'bg-white text-rose-700 ring-rose-600/20 hover:bg-rose-50' : 'bg-white text-stone-700 ring-stone-900/10 hover:ring-liv/40 hover:text-liv-deep'
              }`}
            >
              <Icono className="h-3.5 w-3.5" /> {etiquetas[decision]}
            </button>
          );
        })}
      </div>
      {exito && <p role="status" className="animate-rise mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700"><CircleCheck className="h-4 w-4" />{exito}</p>}
      {accion && accion !== 'confirmar' && (
        <ModalJustificacion
          titulo={`${etiquetas[accion]}${candidatoNombre ? ` · ${candidatoNombre}` : ''}`}
          explicacion={EXPLICA[accion]}
          irreversible={IRREVERSIBLE.has(accion)}
          peligro={accion === 'descartado'}
          onCancel={cerrar}
          onConfirm={async (justificacion) => {
            const r = await registrarDecision(vacanteId, candidatoId, accion, justificacion);
            if (r.ok) listo('Decisión registrada y auditada.');
            return r.ok ? null : traducirError(r.codigo, r.error);
          }}
        />
      )}
    </div>
  );
}

/** Mensajes claros para los errores de gobernanza que devuelve el orquestador. */
function traducirError(codigo: string, error: string): string {
  if (codigo === 'JUSTIFICACION_OBLIGATORIA') return 'La justificación es obligatoria: escribe el motivo para el expediente.';
  if (codigo === 'TRANSICION_INVALIDA') return `Acción no válida para el estado actual. ${error}`;
  return `${codigo}: ${error}`;
}

function ModalJustificacion({ titulo, explicacion, irreversible, peligro = false, onCancel, onConfirm }: { titulo: string; explicacion: string; irreversible: boolean; peligro?: boolean; onCancel: () => void; onConfirm: (justificacion: string) => Promise<string | null> }) {
  const [valor, setValor] = useState('');
  const [entiendo, setEntiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const largo = valor.trim().length;
  const valido = largo >= MIN_JUSTIFICACION && (!irreversible || entiendo);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onCancel(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [enviando, onCancel]);

  async function confirmar() {
    if (!valido || enviando) return;
    setEnviando(true); setError(null);
    const e = await onConfirm(valor.trim());
    setEnviando(false);
    if (e) setError(e);
  }

  // Portal: la tarjeta que lo abre puede tener transform (Folder Float) y romper position: fixed.
  return createPortal(
    <div className="animate-fade fixed inset-0 z-[60] grid place-items-center bg-stone-950/30 p-4 backdrop-blur-sm" onClick={() => !enviando && onCancel()} role="dialog" aria-modal aria-label={titulo}>
      <div className="animate-drawer w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-[0_50px_120px_-30px_rgb(17_24_39/0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className={`relative px-6 pt-6 pb-5 ${peligro ? 'bg-gradient-to-br from-rose-50 to-white' : 'bg-gradient-to-br from-liv-50 to-white'}`}>
          <button onClick={onCancel} disabled={enviando} aria-label="Cancelar" className="press absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-900/5 hover:text-stone-800"><X className="h-4 w-4" /></button>
          <span className={`grid h-11 w-11 place-items-center rounded-2xl ${peligro ? 'bg-rose-500' : 'bg-liv'} text-white shadow-lg`}><Gavel className="h-5 w-5" /></span>
          <h3 className="mt-4 pr-8 text-[20px] font-semibold tracking-[-0.02em]">{titulo}</h3>
          <p className="mt-1 text-[13.5px] text-stone-600">{explicacion}</p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="flex items-center justify-between text-[13px] font-semibold text-stone-800">
              Justificación obligatoria
              <span className={`tabular text-[11.5px] font-medium ${largo >= MIN_JUSTIFICACION ? 'text-emerald-600' : 'text-stone-400'}`}>{largo}/{MIN_JUSTIFICACION}+</span>
            </span>
            <textarea
              autoFocus
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-stone-900/10 bg-stone-50/60 p-3.5 text-[14px] leading-relaxed outline-none transition-shadow focus:border-liv/50 focus:bg-white focus:ring-4 focus:ring-liv/10"
              placeholder="Explica la decisión para el expediente y el audit log. El candidato recibirá un aviso que un humano aprobará."
            />
          </label>
          {irreversible && (
            <label className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition-colors ${entiendo ? 'bg-amber-50/60 ring-amber-500/30' : 'ring-stone-900/10 hover:bg-stone-50'}`}>
              <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#e2007a]" />
              <span className="text-[13px] leading-snug text-stone-700">
                <span className="flex items-center gap-1.5 font-semibold text-amber-800"><TriangleAlert className="h-3.5 w-3.5" />Decisión irreversible</span>
                Entiendo que esta decisión es mía, no de la IA, y que no se puede deshacer.
              </span>
            </label>
          )}
          {error && <p role="alert" className="animate-shake rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t hairline bg-stone-50/60 px-6 py-4">
          <button onClick={onCancel} disabled={enviando} className="press rounded-full px-4 py-2 text-[13.5px] font-semibold text-stone-600 hover:bg-stone-900/5">Cancelar</button>
          <button onClick={confirmar} disabled={!valido || enviando} className={`press focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13.5px] font-semibold text-white disabled:opacity-35 ${peligro ? 'bg-rose-600 hover:bg-rose-700' : 'btn-liv'}`}>
            {enviando && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {enviando ? 'Guardando…' : 'Confirmar con justificación'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
