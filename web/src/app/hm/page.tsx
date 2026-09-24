import Link from 'next/link';
import { ArrowRight, Gavel, Layers, TriangleAlert } from 'lucide-react';
import { getResumenVacantes } from '@/lib/actions/proceso';
import { Encabezado, Metrica, Seccion, VacanteFolder, Vacio } from '@/components/proceso/piezas';
import { GlideSelect } from '@/components/ui/GlideSelect';
import { SlaDot } from '@/components/ui/Sla';
import { INFO_ESTADO, NOMBRE_ETAPA } from '@/lib/orquestador/estados';

type FiltroSla = 'todas' | 'atrasada' | 'en_riesgo' | 'a_tiempo';
const FILTROS: FiltroSla[] = ['todas', 'atrasada', 'en_riesgo', 'a_tiempo'];

const COMPUERTA: Record<string, string> = {
  ESPERANDO_HM_VALIDA_NNN: 'Validar no negociables',
  ESPERANDO_HM_SELECCIONA_PERFILES: 'Seleccionar perfiles',
  ESPERANDO_HM_DEFINE_POOL: 'Definir pool',
  ESPERANDO_HM_DECIDE_FINALISTA: 'Elegir finalista',
};

export default async function HmDashboard({ searchParams }: PageProps<'/hm'>) {
  const { sla } = await searchParams;
  const filtro: FiltroSla = FILTROS.includes(sla as FiltroSla) ? (sla as FiltroSla) : 'todas';
  const resumen = await getResumenVacantes();
  const vacantes = resumen.ok ? resumen.data : [];
  const activas = vacantes.filter((v) => !INFO_ESTADO[v.estado]?.terminal);
  const pendientes = activas.filter((v) => v.estado.startsWith('ESPERANDO_HM_'));
  const cuenta = (s: string) => activas.filter((v) => v.semaforo === s).length;
  const bloqueos = activas.filter((v) => v.bloquea);
  const visibles = filtro === 'todas' ? vacantes : vacantes.filter((v) => v.semaforo === filtro);

  return (
    <div className="space-y-12">
      <Encabezado
        eyebrow="Hiring Manager"
        titulo={<>Tu proceso, <span className="text-gradient-liv">en una vista.</span></>}
      >
        Prioriza las decisiones que desbloquean a tu equipo. Semáforo por etapa, quién bloquea y fecha estimada de cobertura.
      </Encabezado>

      {!resumen.ok && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-700 ring-1 ring-rose-600/10">{resumen.codigo}: {resumen.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etiqueta="Vacantes activas" valor={activas.length} icono={<Layers className="h-4 w-4" />} detalle="a tu cargo" />
        <Metrica etiqueta="Esperan tu decisión" valor={pendientes.length} tono={pendientes.length ? 'liv' : 'default'} icono={<Gavel className="h-4 w-4" />} detalle="compuertas del HM" delay={60} />
        <Metrica etiqueta="En riesgo" valor={cuenta('en_riesgo')} tono={cuenta('en_riesgo') ? 'warn' : 'default'} icono={<SlaDot valor="en_riesgo" />} detalle="vencen en ≤ 1 día" delay={120} />
        <Metrica etiqueta="Atrasadas" valor={cuenta('atrasada')} tono={cuenta('atrasada') ? 'bad' : 'default'} icono={<SlaDot valor="atrasada" />} detalle="SLA vencido" delay={180} />
      </div>

      <Seccion titulo="Requieren tu decisión" descripcion="El orquestador está detenido hasta que decidas. Toda decisión lleva justificación.">
        {pendientes.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pendientes.map((v, i) => (
              <Link
                key={v.id}
                href={`/hm/vacantes/${v.id}`}
                className="animate-rise press group relative overflow-hidden rounded-2xl bg-stone-950 p-5 text-white shadow-[0_24px_50px_-24px_rgb(226_0_122/0.6)]"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span aria-hidden className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-liv/40 blur-3xl transition-transform duration-700 ease-glide group-hover:scale-125" />
                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[.12em] text-pink-200 ring-1 ring-white/15">
                  <Gavel className="h-3.5 w-3.5" />
                  {COMPUERTA[v.estado] ?? v.estado.replaceAll('_', ' ')}
                </span>
                <h3 className="relative mt-3 text-[18px] leading-snug font-semibold">{v.titulo}</h3>
                <p className="relative mt-1.5 text-[13px] text-white/60">{INFO_ESTADO[v.estado]?.descripcion}</p>
                <div className="relative mt-5 flex items-center justify-between text-[13px]">
                  <span className="inline-flex items-center gap-2 text-white/70">
                    <SlaDot valor={v.semaforo} />
                    {v.dias_restantes === null ? 'Sin fecha límite' : v.dias_restantes < 0 ? `Vencida hace ${Math.abs(v.dias_restantes)} d` : `${v.dias_restantes} días hábiles`}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-pink-300 transition-transform duration-300 group-hover:translate-x-1">
                    Decidir <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Vacio>No tienes compuertas pendientes. Tu equipo puede avanzar sin esperarte.</Vacio>
        )}
      </Seccion>

      <div className="grid gap-10 xl:grid-cols-[1fr_320px]">
        <Seccion
          titulo="Vacantes a tu cargo"
          acciones={
            <GlideSelect
              size="sm"
              ariaLabel="Filtrar por SLA"
              value={filtro}
              options={[
                { value: 'todas', label: 'Todas', count: vacantes.length, href: '/hm' },
                { value: 'atrasada', label: 'Atrasadas', count: cuenta('atrasada'), href: '/hm?sla=atrasada', tone: 'bad' },
                { value: 'en_riesgo', label: 'En riesgo', count: cuenta('en_riesgo'), href: '/hm?sla=en_riesgo', tone: 'warn' },
                { value: 'a_tiempo', label: 'A tiempo', count: cuenta('a_tiempo'), href: '/hm?sla=a_tiempo', tone: 'ok' },
              ]}
            />
          }
        >
          {visibles.length ? (
            <div className="grid gap-x-5 gap-y-8 pt-3 md:grid-cols-2">
              {visibles.map((v, i) => <VacanteFolder key={v.id} v={v} href={`/hm/vacantes/${v.id}`} delay={i * 60} />)}
            </div>
          ) : (
            <Vacio>Ninguna vacante en este filtro.</Vacio>
          )}
        </Seccion>

        <aside className="space-y-4">
          <div className="surface rounded-2xl p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <TriangleAlert className="h-4 w-4 text-rose-500" /> Cuellos de botella
            </h3>
            <p className="mt-1 text-[12.5px] text-stone-500">Etapas en riesgo o vencidas y quién tiene la pelota.</p>
            <ul className="mt-4 space-y-2.5">
              {bloqueos.length ? bloqueos.map((v) => (
                <li key={v.id}>
                  <Link href={`/hm/vacantes/${v.id}`} className="press flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-stone-900/[0.03]">
                    <SlaDot valor={v.semaforo} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{v.titulo}</span>
                      <span className="block truncate text-[12px] text-stone-500">{NOMBRE_ETAPA[v.etapa_actual]} · {v.bloquea?.nombre ?? v.bloquea?.rol}</span>
                    </span>
                  </Link>
                </li>
              )) : <li className="text-[13px] text-stone-400">Sin bloqueos. Todo fluye.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
