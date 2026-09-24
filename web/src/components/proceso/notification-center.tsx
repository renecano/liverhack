'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, CheckCheck, LoaderCircle, Mail, MonitorSmartphone, RotateCcw, Send, TriangleAlert, UserRound } from 'lucide-react';
import { aprobarLoteNotificaciones } from '@/lib/actions/proceso';
import type { Entrega } from '@/lib/acciones/entrega';
import type { EstatusNotificacion, Notificacion } from '@/lib/supabase/types';
import { BotonPersonalizarIA } from '@/components/ia/BotonPersonalizarIA';
import { GlideSelect } from '@/components/ui/GlideSelect';

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

const TIPO: Record<string, string> = {
  cambio_etapa: 'Cambio de etapa',
  recordatorio: 'Recordatorio',
  escalacion: 'Escalación',
  resultado: 'Resultado',
  reactivacion: 'Reactivación',
};

const CHIP: Record<EstatusNotificacion | 'fallo', string> = {
  borrador: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  aprobada: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  enviada: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  fallo: 'bg-rose-50 text-rose-700 ring-rose-600/15',
};

type Filtro = 'todas' | EstatusNotificacion;

export function NotificationCenter({
  notificaciones,
  entregas = {},
  titulo = 'Centro de notificaciones',
  destinatarios = {},
}: {
  notificaciones: Notificacion[];
  entregas?: Record<string, Entrega>;
  titulo?: string;
  /** Nombre visible por destinatario_id (opcional). */
  destinatarios?: Record<string, string>;
}) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [errores, setErrores] = useState<{ id: string; error: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const borradores = notificaciones.filter((n) => n.estatus === 'borrador');
  const [filtro, setFiltro] = useState<Filtro>(borradores.length ? 'borrador' : 'todas');
  // Personalizaciones en curso: mientras haya alguna, "Aprobar lote" queda deshabilitado.
  const [personalizando, setPersonalizando] = useState(0);
  // Aprobadas sin enviar (p. ej. su envío falló): se pueden (re)enviar.
  const pendientesEnvio = notificaciones.filter((n) => n.estatus === 'aprobada');
  const personalizables = notificaciones.filter(personalizable);
  const seleccionadas = borradores.filter((n) => sel.includes(n.id));
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
      setMensaje({
        ok: d.fallidas === 0,
        texto: `${d.aprobadas} aprobada(s), ${d.enviadas} enviada(s)${detalle ? ` (${detalle})` : ''}${d.fallidas ? ` · ${d.fallidas} con envío fallido (siguen aprobadas; puedes reintentar con "Enviar aprobadas")` : ''}.`,
      });
      setErrores(d.errores);
      setSel([]);
      router.refresh();
    } else {
      setMensaje({ ok: false, texto: `${resultado.codigo}: ${resultado.error}` });
    }
  }
  const errorDe = (n: Notificacion) => {
    const e = entregas[n.id];
    return errores.find((x) => x.id === n.id)?.error ?? (n.estatus === 'aprobada' && e?.resultado === 'fallo' ? e.error : null);
  };
  const cuenta = (e: EstatusNotificacion) => notificaciones.filter((n) => n.estatus === e).length;
  const visibles = filtro === 'todas' ? notificaciones : notificaciones.filter((n) => n.estatus === filtro);
  const bloqueado = enviando || personalizando > 0;
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section className="surface overflow-hidden rounded-3xl">
      <div className="relative border-b hairline p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 h-48 w-72 rounded-full bg-liv/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.16em] text-liv"><BellRing className="h-3.5 w-3.5" /> Cero ghosting</p>
            <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em]">{titulo}</h2>
            <p className="mt-1 text-[13px] text-stone-500">La IA redacta, un humano aprueba y se envía. Cada aviso conserva su estado.</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {personalizables.length > 1 && <BotonPersonalizarIA ids={personalizables.map((n) => n.id)} texto="Personalizar todos con IA" deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} />}
            {pendientesEnvio.length > 0 && (
              <button onClick={() => procesar(pendientesEnvio)} disabled={bloqueado} className="press focus-ring inline-flex items-center gap-1.5 rounded-full border border-liv/30 bg-white px-4 py-2 text-[13px] font-semibold text-liv-deep hover:bg-liv-50 disabled:opacity-40">
                <RotateCcw className="h-3.5 w-3.5" /> Enviar aprobadas ({pendientesEnvio.length})
              </button>
            )}
            {seleccionadas.length > 0 && (
              <button onClick={() => procesar(seleccionadas)} disabled={bloqueado} className="press focus-ring animate-pop inline-flex items-center gap-1.5 rounded-full bg-stone-950 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                <Send className="h-3.5 w-3.5" /> Aprobar seleccionadas ({seleccionadas.length})
              </button>
            )}
            <button
              onClick={() => procesar(borradores)}
              disabled={!borradores.length || bloqueado}
              title={personalizando > 0 ? 'Espera a que termine la personalización con IA' : undefined}
              className="press btn-liv focus-ring inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
            >
              {enviando ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              {enviando ? 'Procesando…' : `Aprobar lote (${borradores.length})`}
            </button>
          </div>
        </div>
        <div className="relative mt-5">
          <GlideSelect
            size="sm"
            value={filtro}
            onChange={setFiltro}
            ariaLabel="Filtrar notificaciones"
            options={[
              { value: 'borrador', label: 'Borradores', count: cuenta('borrador'), tone: 'warn' },
              { value: 'aprobada', label: 'Aprobadas', count: cuenta('aprobada') },
              { value: 'enviada', label: 'Enviadas', count: cuenta('enviada'), tone: 'ok' },
              { value: 'todas', label: 'Todas', count: notificaciones.length },
            ]}
          />
        </div>
        {mensaje && (
          <p role="status" className={`animate-rise relative mt-4 rounded-xl p-3 text-[13px] ring-1 ${mensaje.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/10' : 'bg-amber-50 text-amber-900 ring-amber-600/15'}`}>
            {mensaje.texto}
          </p>
        )}
      </div>

      <ul className="divide-y divide-stone-900/[0.05]">
        {visibles.length ? visibles.map((n, i) => {
          const e = entregas[n.id];
          const error = errorDe(n);
          const marcada = sel.includes(n.id);
          const chip = error && n.estatus === 'aprobada' ? 'fallo' : n.estatus;
          return (
            <li key={n.id} className={`animate-rise flex gap-4 px-5 py-4 transition-colors sm:px-6 ${marcada ? 'bg-liv-50/70' : 'hover:bg-stone-900/[0.015]'}`} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <div className="pt-0.5">
                {n.estatus === 'borrador' ? (
                  <input type="checkbox" checked={marcada} onChange={() => alternar(n.id)} aria-label="Seleccionar para aprobar" className="h-4 w-4 cursor-pointer rounded accent-[#e2007a]" />
                ) : (
                  <span className={`grid h-4 w-4 place-items-center rounded-full ${n.estatus === 'enviada' ? 'bg-emerald-500' : 'bg-sky-400'}`}><CheckCheck className="h-2.5 w-2.5 text-white" strokeWidth={3} /></span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-stone-500">
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-900/[0.04] px-1.5 py-0.5 font-semibold text-stone-700">{TIPO[n.tipo] ?? n.tipo}</span>
                    <span className="inline-flex items-center gap-1">{n.canal === 'correo' ? <Mail className="h-3.5 w-3.5" /> : <MonitorSmartphone className="h-3.5 w-3.5" />}{n.canal}</span>
                    <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{destinatarios[n.destinatario_id] ?? n.destinatario_tipo}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${CHIP[chip]}`}>{error && n.estatus === 'aprobada' ? 'aprobada · envío fallido' : etiquetaEstatus(n, e)}</span>
                </div>
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-[13.5px] leading-relaxed text-stone-700">{n.contenido ?? 'Sin contenido'}</p>
                {n.estatus === 'enviada' && e?.resultado === 'enviada' && e.mensaje_id && <p className="mt-1 font-mono text-[11px] text-stone-400">Resend id: {e.mensaje_id}</p>}
                {error && <p role="alert" className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-rose-700"><TriangleAlert className="h-3.5 w-3.5" />No se envió: {error}</p>}
                {personalizable(n) && <div className="mt-2.5"><BotonPersonalizarIA ids={n.id} mostrarDetalle={false} deshabilitado={enviando} onStart={alEmpezar} onDone={alTerminar} /></div>}
              </div>
            </li>
          );
        }) : <li className="px-6 py-10 text-center text-[13.5px] text-stone-400">No hay notificaciones en esta vista.</li>}
      </ul>
    </section>
  );
}
