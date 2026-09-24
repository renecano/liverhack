import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, CalendarClock, Hourglass, TriangleAlert } from 'lucide-react';
import type { ResumenVacante } from '@/lib/orquestador/resumen';
import { ETAPAS, INFO_ESTADO, NOMBRE_ETAPA } from '@/lib/orquestador/estados';
import { Folder } from '@/components/ui/Folder';
import { SlaChip, SlaDot, Stoplight, tonoSla } from '@/components/ui/Sla';

/** Encabezado de página: eyebrow rosa, título grande y acciones a la derecha. */
export function Encabezado({ eyebrow, titulo, children, acciones }: { eyebrow: string; titulo: ReactNode; children?: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="animate-rise flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-[.2em] text-liv">{eyebrow}</p>
        <h1 className="mt-2 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[42px]">{titulo}</h1>
        {children && <p className="mt-3 text-[15px] leading-relaxed text-stone-500">{children}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </section>
  );
}

/** Tarjeta de métrica. */
export function Metrica({ etiqueta, valor, detalle, tono = 'default', icono, delay = 0 }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: 'default' | 'liv' | 'ok' | 'warn' | 'bad'; icono?: ReactNode; delay?: number }) {
  const color = { default: 'text-stone-950', liv: 'text-liv', ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' }[tono];
  return (
    <div className="animate-rise surface rounded-2xl p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between text-[12.5px] font-medium text-stone-500">
        {etiqueta}
        {icono && <span className="text-stone-300">{icono}</span>}
      </div>
      <p className={`tabular mt-2 text-[34px] leading-none font-semibold tracking-[-0.03em] ${color}`}>{valor}</p>
      {detalle && <p className="mt-2 text-[12.5px] text-stone-500">{detalle}</p>}
    </div>
  );
}

export function Seccion({ titulo, descripcion, acciones, children, id }: { titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{titulo}</h2>
          {descripcion && <p className="mt-1 text-[13.5px] text-stone-500">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-stone-900/10 bg-white/50 p-8 text-center text-[13.5px] text-stone-500">{children}</p>;
}

/** Línea de 6 etapas con el semáforo de cada una (verde/ámbar/rojo; rosa = completada). */
export function EtapasLinea({ vacante, compacta = false }: { vacante: ResumenVacante; compacta?: boolean }) {
  const porEtapa = new Map(vacante.etapas.map((e) => [e.etapa, e]));
  const actual = ETAPAS.indexOf(vacante.etapa_actual);
  return (
    <ol className={`flex items-center ${compacta ? 'gap-1' : 'gap-1.5'}`} aria-label="Etapas del proceso">
      {ETAPAS.map((etapa, i) => {
        const e = porEtapa.get(etapa);
        const hecha = e?.semaforo === 'completada' || i < actual;
        const esActual = i === actual;
        const tono = tonoSla(e?.semaforo);
        const barra = hecha
          ? 'bg-liv/70'
          : esActual
            ? tono === 'bad' ? 'bg-rose-500' : tono === 'warn' ? 'bg-amber-400' : 'bg-emerald-500'
            : 'bg-stone-200';
        return (
          <li key={etapa} className="min-w-0 flex-1" title={`${NOMBRE_ETAPA[etapa]}${e?.dias_restantes != null && esActual ? ` · ${e.dias_restantes} días hábiles` : ''}`}>
            <span className={`block h-1.5 rounded-full ${barra} ${esActual ? 'shadow-[0_0_0_3px_rgb(17_24_39/0.04)]' : ''}`} />
            {!compacta && (
              <span className={`mt-2 block truncate text-[11px] font-medium ${esActual ? 'text-stone-900' : 'text-stone-400'}`}>{NOMBRE_ETAPA[etapa]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const fecha = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';

/** Folder Float de una vacante: semáforo, etapa, días, cobertura y cuello de botella. */
export function VacanteFolder({ v, href, delay = 0 }: { v: ResumenVacante; href: string; delay?: number }) {
  const info = INFO_ESTADO[v.estado];
  const vencida = v.dias_restantes !== null && v.dias_restantes < 0;
  return (
    <Folder className="animate-rise" style={{ animationDelay: `${delay}ms` }} cardClassName="h-full">
      <Link href={href} className="focus-ring group block h-full rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[.12em] text-stone-400">
              <SlaDot valor={v.semaforo} />
              {NOMBRE_ETAPA[v.etapa_actual]} · {v.nivel}
            </p>
            <h3 className="mt-2 line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em]">{v.titulo}</h3>
          </div>
          <Stoplight valor={v.semaforo} />
        </div>

        <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-stone-500">{info?.descripcion}</p>

        <div className="mt-4">
          <EtapasLinea vacante={v} compacta />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
          <div className="rounded-xl bg-stone-900/[0.03] px-3 py-2">
            <dt className="flex items-center gap-1.5 text-stone-500"><Hourglass className="h-3.5 w-3.5" />Días hábiles</dt>
            <dd className={`tabular mt-0.5 text-[18px] font-semibold ${vencida ? 'text-rose-600' : 'text-stone-900'}`}>
              {v.dias_restantes === null ? '—' : vencida ? `${v.dias_restantes}` : v.dias_restantes}
            </dd>
          </div>
          <div className="rounded-xl bg-stone-900/[0.03] px-3 py-2">
            <dt className="flex items-center gap-1.5 text-stone-500"><CalendarClock className="h-3.5 w-3.5" />Cobertura</dt>
            <dd className="tabular mt-0.5 text-[18px] font-semibold text-stone-900">{fecha(v.fecha_estimada_cobertura)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between gap-2">
          {v.bloquea ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700 ring-1 ring-rose-600/15">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Cuello de botella: {v.bloquea.nombre ?? v.bloquea.rol}</span>
            </span>
          ) : (
            <SlaChip valor={v.semaforo} />
          )}
          <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-liv" />
        </div>
      </Link>
    </Folder>
  );
}
