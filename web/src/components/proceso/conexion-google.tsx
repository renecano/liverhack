'use client';

import { useTransition } from 'react';
import { CalendarCheck2, CalendarX2, Link2, Unplug } from 'lucide-react';
import { desconectarGoogle } from '@/lib/actions/entrevistas';
import type { EstadoConexion } from '@/lib/acciones/google';

// Resultado del regreso de Google (?google=…), en lenguaje humano.
const RESULTADO: Record<string, { texto: string; ok: boolean }> = {
  conectado: { texto: 'Google Calendar conectado. Las próximas entrevistas se crearán en tu calendario.', ok: true },
  cancelado: { texto: 'Cancelaste el permiso en Google; la agenda sigue en modo interno.', ok: false },
  state_invalido: { texto: 'La conexión expiró o no coincide con tu sesión. Vuelve a intentarlo.', ok: false },
  sin_tabla: { texto: 'Falta crear la tabla google_conexiones en la base (ver README de calendar).', ok: false },
  sin_refresh_token: { texto: 'Google no entregó permiso permanente. Quita el acceso de LivHire en tu cuenta de Google y vuelve a conectar.', ok: false },
  sin_credenciales: { texto: 'El servidor no tiene credenciales de Google (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).', ok: false },
  no_autorizado: { texto: 'Solo Atracción de Talento puede conectar Google Calendar.', ok: false },
  error: { texto: 'Google no respondió al conectar. Intenta de nuevo en un momento.', ok: false },
};

/** Tarjeta de conexión con Google Calendar en la agenda del AT. */
export function ConexionGoogle({ conexion, modoReal, resultado }: { conexion: EstadoConexion; modoReal: boolean; resultado?: string }) {
  const [pendiente, iniciar] = useTransition();
  const msg = resultado ? (RESULTADO[resultado] ?? { texto: `No se pudo conectar (${resultado}).`, ok: false }) : null;
  const conectado = conexion.estado === 'conectado';

  return (
    <section className="surface rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${conectado ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/15' : 'bg-stone-100 text-stone-500 ring-stone-900/5'}`}>
            {conectado ? <CalendarCheck2 className="h-5 w-5" /> : <CalendarX2 className="h-5 w-5" />}
          </span>
          <div className="leading-tight">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Google Calendar</h2>
            <p className="mt-1 text-[13px] text-stone-500">
              {conexion.estado === 'conectado' && (
                <>
                  Conectado como <strong className="font-semibold text-stone-800">{conexion.email ?? 'tu cuenta de Google'}</strong>
                  {modoReal ? ' · las entrevistas se crean en tu calendario con los entrevistadores como invitados.' : ' · ACTIONS_MODE no es "real": por ahora se agenda en modo interno.'}
                </>
              )}
              {conexion.estado === 'no_conectado' && 'Sin conectar: las entrevistas se guardan en LivHire (modo interno). Conecta para crearlas también en tu calendario.'}
              {conexion.estado === 'sin_credenciales' && 'Modo interno: el servidor no tiene credenciales de Google. Las entrevistas se guardan en LivHire con su fecha.'}
              {conexion.estado === 'sin_tabla' && 'Modo interno: falta la tabla google_conexiones en la base de datos.'}
            </p>
          </div>
        </div>
        {conexion.estado === 'no_conectado' && (
          // Enlace normal (no fetch): el flujo OAuth necesita navegar a Google.
          <a href="/api/google/auth" className="press btn-liv inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold">
            <Link2 className="h-4 w-4" /> Conectar Google Calendar
          </a>
        )}
        {conectado && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciar(async () => void (await desconectarGoogle()))}
            className="press inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-4 py-2 text-[13px] font-semibold text-stone-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
          >
            <Unplug className="h-4 w-4" /> {pendiente ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className={`mt-4 rounded-2xl px-3.5 py-2.5 text-[13px] ring-1 ${msg.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/15' : 'bg-amber-50 text-amber-900 ring-amber-600/15'}`}>
          {msg.texto}
        </p>
      )}
    </section>
  );
}
