import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Hourglass, TriangleAlert, UserRound } from 'lucide-react';
import { CandidateActions } from '@/components/proceso/candidate-actions';
import { CandidatosVacante } from '@/components/proceso/candidatos-vacante';
import { EtapasLinea, Seccion, Vacio } from '@/components/proceso/piezas';
import { SlaChip } from '@/components/ui/Sla';
import { getResumenVacantes } from '@/lib/actions/proceso';
import { listarCandidatos } from '@/lib/ia/consultas';
import { createClient } from '@/lib/supabase/server';
import { INFO_ESTADO, NOMBRE_ETAPA } from '@/lib/orquestador/estados';

const fecha = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '—';

export default async function VacanteHmPage({ params }: PageProps<'/hm/vacantes/[id]'>) {
  const { id } = await params;
  const [resumen, supabase] = await Promise.all([getResumenVacantes(), createClient()]);
  const vacante = resumen.ok ? resumen.data.find((v) => v.id === id) : undefined;
  if (!vacante) notFound();
  // Con la sesión (RLS): ficha, compatibilidad y semáforo de no negociables con evidencia.
  const candidatos = await listarCandidatos(supabase, id);
  const esCompuertaGeneral = ['ESPERANDO_HM_VALIDA_NNN', 'ESPERANDO_HM_SELECCIONA_PERFILES', 'ESPERANDO_HM_DEFINE_POOL'].includes(vacante.estado);
  const esFinalista = vacante.estado === 'ESPERANDO_HM_DECIDE_FINALISTA';
  const terminal = vacante.estado === 'CUBIERTA' || vacante.estado === 'CANCELADA';
  const sinAccionHM = !esCompuertaGeneral && !esFinalista && !terminal;
  const info = INFO_ESTADO[vacante.estado];

  return (
    <div className="space-y-10">
      <Link href="/hm" className="press group inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 hover:text-liv">
        <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" /> Mis vacantes
      </Link>

      <section className="animate-rise surface relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full bg-liv/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-[.12em] ${info?.esperaHM ? 'bg-liv text-white' : 'bg-stone-900/5 text-stone-600'}`}>
              {info?.esperaHM ? 'Tu decisión' : NOMBRE_ETAPA[vacante.etapa_actual]}
            </p>
            <h1 className="mt-3 text-[32px] leading-tight font-semibold tracking-[-0.03em] sm:text-[38px]">{vacante.titulo}</h1>
            <p className="mt-2 text-[15px] text-stone-500">{info?.descripcion}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SlaChip valor={vacante.semaforo} />
            <p className="flex items-center gap-1.5 text-[13px] text-stone-500"><Hourglass className="h-3.5 w-3.5" />{vacante.dias_restantes ?? '—'} días hábiles restantes</p>
            <p className="flex items-center gap-1.5 text-[13px] text-stone-500"><CalendarClock className="h-3.5 w-3.5" />Cobertura estimada: {fecha(vacante.fecha_estimada_cobertura)}</p>
          </div>
        </div>

        <div className="relative mt-8">
          <EtapasLinea vacante={vacante} />
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-900/[0.04] px-3 py-1.5 text-stone-600"><UserRound className="h-3.5 w-3.5" />Responsable: <strong className="font-semibold text-stone-900">{vacante.responsable.nombre ?? vacante.responsable.rol ?? '—'}</strong></span>
          {vacante.bloquea && <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-600/15"><TriangleAlert className="h-3.5 w-3.5" />Bloquea: {vacante.bloquea.nombre ?? vacante.bloquea.rol}</span>}
        </div>

        {esCompuertaGeneral && <div className="relative mt-6 border-t hairline pt-6"><CandidateActions vacanteId={id} estado={vacante.estado} /></div>}
        {sinAccionHM && <p className="relative mt-6 rounded-2xl bg-stone-900/[0.03] p-4 text-[13.5px] text-stone-600">No hay acciones pendientes para ti en este momento: la vacante está en manos de {vacante.responsable.nombre ?? vacante.responsable.rol ?? 'el equipo operativo'}.</p>}
        {terminal && <p className="relative mt-6 rounded-2xl bg-stone-900/[0.03] p-4 text-[13.5px] text-stone-600">Proceso {vacante.estado === 'CUBIERTA' ? 'cubierto' : 'cancelado'}: no admite más decisiones.</p>}
      </section>

      <Seccion
        titulo="Candidatos para revisión"
        descripcion={esFinalista ? 'Elige finalista o descarta. Cada decisión es humana, irreversible y exige justificación.' : 'Selecciona 2 o más para abrir la comparativa lado a lado con la matriz de no negociables.'}
      >
        {candidatos.length ? (
          <CandidatosVacante filas={candidatos} vacanteId={id} estado={vacante.estado} baseComparar="/hm/candidatos/comparar" />
        ) : (
          <Vacio>Aún no hay candidatos en esta vacante.</Vacio>
        )}
      </Seccion>
    </div>
  );
}
