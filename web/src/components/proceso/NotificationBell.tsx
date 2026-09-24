'use client';

import { useState, useRef, useEffect, useId } from 'react';
import Link from 'next/link';
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  CheckCheck,
  ChevronRight,
  Clock,
} from 'lucide-react';

export type UrgenciaNotificacion = 'alerta_sla' | 'accion_requerida' | 'evento' | 'sistema';

export interface NotificacionInterna {
  id: string;
  tipo: UrgenciaNotificacion;
  titulo: string;
  mensaje: string;
  tiempo: string;
  leida: boolean;
  accionTexto?: string;
  accionHref?: string;
}

// Datos simulados en duro según especificaciones de negocio LivHire
const NOTIFICACIONES_MOCK: NotificacionInterna[] = [
  {
    id: 'notif-1',
    tipo: 'alerta_sla',
    titulo: 'Alerta SLA · Semáforo Amarillo',
    mensaje: 'Tu vacante de Gerente E-commerce pasó a semáforo amarillo. Faltan revisiones.',
    tiempo: 'Hace 15 min',
    leida: false,
    accionTexto: 'Revisar vacante',
    accionHref: '/hm',
  },
  {
    id: 'notif-2',
    tipo: 'accion_requerida',
    titulo: 'Acción Requerida · Lote aprobado',
    mensaje: 'El HM aprobó el lote de 3 candidatos. Procede con las ofertas.',
    tiempo: 'Hace 45 min',
    leida: false,
    accionTexto: 'Gestionar ofertas',
    accionHref: '/at',
  },
  {
    id: 'notif-3',
    tipo: 'evento',
    titulo: 'Entrevista técnica en agenda',
    mensaje: 'Entrevista técnica en 15 minutos con Ana López.',
    tiempo: 'En 15 min',
    leida: false,
    accionTexto: 'Ir al Scorecard',
    accionHref: '/entrevistador',
  },
  {
    id: 'notif-4',
    tipo: 'sistema',
    titulo: 'Copiloto IA · Reporte de afinidad',
    mensaje: 'El Copiloto IA identificó 2 perfiles con >90% de afinidad para Analista de Datos.',
    tiempo: 'Hace 2 horas',
    leida: true,
    accionTexto: 'Ver sugerencias',
    accionHref: '/at/carga',
  },
];

export function NotificationBell({ className = '' }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<NotificacionInterna[]>(NOTIFICACIONES_MOCK);
  const [filtro, setFiltro] = useState<'todas' | 'no_leidas'>('todas');
  const panelRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const noLeidas = notificaciones.filter((n) => !n.leida);
  const totalNoLeidas = noLeidas.length;
  const listaVisible = filtro === 'no_leidas' ? noLeidas : notificaciones;

  // Cerrar al hacer clic fuera o presionar escape
  useEffect(() => {
    function manejarClickFuera(e: MouseEvent | TouchEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        botonRef.current &&
        !botonRef.current.contains(e.target as Node)
      ) {
        setAbierto(false);
      }
    }

    function manejarKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAbierto(false);
        botonRef.current?.focus();
      }
    }

    if (abierto) {
      document.addEventListener('pointerdown', manejarClickFuera);
      document.addEventListener('keydown', manejarKeyDown);
    }

    return () => {
      document.removeEventListener('pointerdown', manejarClickFuera);
      document.removeEventListener('keydown', manejarKeyDown);
    };
  }, [abierto]);

  const alternarLeida = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: !n.leida } : n))
    );
  };

  const marcarTodasComoLeidas = () => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
  };

  return (
    <div className={`relative inline-block ${className}`} ref={panelRef}>
      {/* Estilos locales para la animación de campanada orgánica */}
      <style jsx>{`
        @keyframes bell-vibe {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(9deg); }
          60% { transform: rotate(-5deg); }
          75% { transform: rotate(2deg); }
        }
        .bell-icon-hover:hover .bell-target {
          transform-origin: top center;
          animation: bell-vibe 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>

      {/* Botón de la campana con badge flotante */}
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((prev) => !prev)}
        aria-expanded={abierto}
        aria-controls={panelId}
        aria-label={`Notificaciones del sistema: ${totalNoLeidas} no leídas`}
        title={totalNoLeidas > 0 ? `${totalNoLeidas} alertas pendientes` : 'Notificaciones'}
        className="press focus-ring bell-icon-hover group relative grid h-9 w-9 place-items-center rounded-full border border-stone-900/10 bg-white text-stone-600 shadow-sm transition-all duration-200 hover:border-liv/40 hover:bg-stone-50/70 hover:text-liv active:scale-95"
      >
        <Bell className="bell-target h-4 w-4 transition-transform duration-200" />

        {/* Badge flotante en Rosa Liverpool #E2007A */}
        {totalNoLeidas > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E2007A] opacity-60" />
            <span className="relative inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E2007A] px-1 text-[10px] font-bold tracking-tight text-white shadow-sm ring-2 ring-white">
              {totalNoLeidas}
            </span>
          </span>
        )}
      </button>

      {/* Menú Desplegable Flotante (Glassmorphism & Apple/Vercel Style) */}
      {abierto && (
        <div
          id={panelId}
          role="region"
          aria-label="Panel de notificaciones internas"
          className="animate-pop absolute right-0 top-full mt-2.5 w-[360px] sm:w-[410px] max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200/80 bg-white/95 p-0 text-stone-900 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.04)] backdrop-blur-xl z-50 overflow-hidden"
        >
          {/* Header del panel */}
          <div className="flex items-center justify-between border-b border-stone-200/60 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-liv-50 text-liv">
                <Bell className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <h3 className="text-[14px] font-semibold tracking-tight text-stone-950">
                  Notificaciones
                </h3>
                <p className="text-[11px] font-medium text-stone-400">
                  Alertas y eventos internos
                </p>
              </div>
              {totalNoLeidas > 0 && (
                <span className="ml-1 rounded-full bg-[#E2007A]/10 px-2 py-0.5 text-[11px] font-semibold text-[#E2007A]">
                  {totalNoLeidas} nuevas
                </span>
              )}
            </div>

            {totalNoLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodasComoLeidas}
                className="group flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                title="Marcar todas como leídas"
              >
                <CheckCheck className="h-3.5 w-3.5 text-stone-400 group-hover:text-liv" />
                <span className="hidden sm:inline">Marcar leídas</span>
              </button>
            )}
          </div>

          {/* Filtros rápidos */}
          <div className="flex items-center gap-1 border-b border-stone-200/40 bg-stone-50/50 px-4 py-1.5 sm:px-5">
            <button
              type="button"
              onClick={() => setFiltro('todas')}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition-all ${
                filtro === 'todas'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              Todas ({notificaciones.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro('no_leidas')}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition-all ${
                filtro === 'no_leidas'
                  ? 'bg-[#E2007A] text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              No leídas ({totalNoLeidas})
            </button>
          </div>

          {/* Lista de Notificaciones */}
          <div className="max-h-[360px] divide-y divide-stone-100 overflow-y-auto overscroll-contain">
            {listaVisible.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="text-[13px] font-medium text-stone-700">Estás al día</p>
                <p className="text-[11.5px] text-stone-400 max-w-[200px]">
                  No tienes notificaciones pendientes en esta bandeja.
                </p>
              </div>
            ) : (
              listaVisible.map((notif) => {
                const esAlertaSLA = notif.tipo === 'alerta_sla';
                const esAccion = notif.tipo === 'accion_requerida';
                const esEvento = notif.tipo === 'evento';
                const esSistema = notif.tipo === 'sistema';

                return (
                  <div
                    key={notif.id}
                    onClick={() => alternarLeida(notif.id)}
                    className={`group relative flex cursor-pointer gap-3 px-4 py-3.5 transition-colors sm:px-5 ${
                      notif.leida
                        ? 'bg-white opacity-70 hover:opacity-100 hover:bg-stone-50/70'
                        : 'bg-liv-50/20 hover:bg-liv-50/40'
                    }`}
                  >
                    {/* Indicador de no leída (borde o punto rosa Liverpool) */}
                    {!notif.leida && (
                      <span
                        aria-hidden
                        className="absolute left-1.5 top-5 h-2 w-2 rounded-full bg-[#E2007A] shadow-[0_0_8px_rgba(226,0,122,0.6)]"
                      />
                    )}

                    {/* Icono del tipo de notificación */}
                    <div className="pt-0.5 shrink-0">
                      {esAlertaSLA && (
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 shadow-xs">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      )}
                      {esAccion && (
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 shadow-xs">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      )}
                      {esEvento && (
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 shadow-xs">
                          <Calendar className="h-4 w-4" />
                        </span>
                      )}
                      {esSistema && (
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-500/10 text-purple-600 ring-1 ring-purple-500/20 shadow-xs">
                          <Sparkles className="h-4 w-4" />
                        </span>
                      )}
                    </div>

                    {/* Contenido */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        {/* Chip de urgencia */}
                        <div className="flex items-center gap-1.5">
                          {esAlertaSLA && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-amber-600/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Alerta SLA
                            </span>
                          )}
                          {esAccion && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-pink-50 px-2 py-0.5 text-[10.5px] font-semibold text-[#E2007A] ring-1 ring-pink-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#E2007A]" />
                              Acción Requerida
                            </span>
                          )}
                          {esEvento && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10.5px] font-semibold text-sky-700 ring-1 ring-sky-600/20">
                              <Clock className="h-2.5 w-2.5" />
                              Evento
                            </span>
                          )}
                          {esSistema && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10.5px] font-semibold text-stone-700 ring-1 ring-stone-600/15">
                              Copiloto IA
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] font-medium text-stone-400 shrink-0">
                          {notif.tiempo}
                        </span>
                      </div>

                      {/* Título y Mensaje */}
                      <p className="mt-1 text-[12.5px] font-semibold leading-snug text-stone-900">
                        {notif.titulo}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-stone-600 line-clamp-3">
                        {notif.mensaje}
                      </p>

                      {/* Botón de acción contextual si aplica */}
                      {notif.accionTexto && notif.accionHref && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <Link
                            href={notif.accionHref}
                            onClick={(e) => {
                              e.stopPropagation();
                              alternarLeida(notif.id);
                              setAbierto(false);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                              esEvento
                                ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-xs'
                                : esAccion
                                ? 'bg-[#E2007A] text-white hover:bg-[#b80063] shadow-xs'
                                : esAlertaSLA
                                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-xs'
                                : 'bg-stone-900 text-white hover:bg-stone-800'
                            }`}
                          >
                            <span>[{notif.accionTexto}]</span>
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Botón para alternar leída/no leída */}
                    <button
                      type="button"
                      onClick={(e) => alternarLeida(notif.id, e)}
                      title={notif.leida ? 'Marcar como no leída' : 'Marcar como leída'}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-stone-400 hover:text-stone-700 rounded-md self-start"
                    >
                      <span className={`block h-2 w-2 rounded-full ${notif.leida ? 'bg-stone-300' : 'bg-[#E2007A]'}`} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer del panel */}
          <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50/70 px-4 py-2.5 sm:px-5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              LivHire Centro de Alertas
            </span>
            <span className="text-[10.5px] text-stone-400">
              Presiona <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 font-mono text-[9.5px]">ESC</kbd> para cerrar
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
