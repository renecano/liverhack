import Link from 'next/link';
import { ArrowUpRight, FileUp, Gavel, Layers, Users } from 'lucide-react';
import { getResumenVacantes } from '@/lib/actions/proceso';
import { createClient } from '@/lib/supabase/server';
import { ETAPAS, INFO_ESTADO, NOMBRE_ETAPA } from '@/lib/orquestador/estados';
import { AvanzarEtapa } from '@/components/proceso/avanzar-etapa';
import { Encabezado, Metrica } from '@/components/proceso/piezas';
import { Folder } from '@/components/ui/Folder';
import { SlaDot } from '@/components/ui/Sla';

export const dynamic = 'force-dynamic';

export default async function AtPipeline() {
  const [resumen, supabase] = await Promise.all([getResumenVacantes(), createClient()]);
  const vacantes = resumen.ok ? resumen.data.filter((v) => !INFO_ESTADO[v.estado]?.terminal) : [];
  const ids = vacantes.map((v) => v.id);
  const { data: cvs } = ids.length
    ? await supabase.from('candidato_vacante').select('vacante_id, estatus').in('vacante_id', ids)
    : { data: [] as { vacante_id: string; estatus: string }[] };
  const candidatosPor = new Map<string, number>();
  for (const c of cvs ?? []) if (c.estatus === 'activo' || c.estatus === 'finalista') candidatosPor.set(c.vacante_id, (candidatosPor.get(c.vacante_id) ?? 0) + 1);
  const activos = [...candidatosPor.values()].reduce((a, b) => a + b, 0);
  const atrasadas = vacantes.filter((v) => v.semaforo === 'atrasada').length;
  const esperandoHM = vacantes.filter((v) => v.esperando_hm).length;

  return (
    <div className="space-y-10">
      <Encabezado
        eyebrow="Atracción de Talento"
        titulo={<>Pipeline <span className="text-gradient-liv">por etapa.</span></>}
        acciones={
          <Link href="/at/carga" className="press btn-liv inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold">
            <FileUp className="h-4 w-4" /> Carga mágica de CV
          </Link>
        }
      >
        Cada vacante en su etapa, con su semáforo. Avanza el tramo operativo; las compuertas del HM se respetan solas.
      </Encabezado>

      {!resumen.ok && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-700">{resumen.codigo}: {resumen.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etiqueta="Vacantes activas" valor={vacantes.length} icono={<Layers className="h-4 w-4" />} />
        <Metrica etiqueta="Candidatos en proceso" valor={activos} icono={<Users className="h-4 w-4" />} delay={60} />
        <Metrica etiqueta="Esperando al HM" valor={esperandoHM} tono={esperandoHM ? 'liv' : 'default'} icono={<Gavel className="h-4 w-4" />} delay={120} />
        <Metrica etiqueta="SLA atrasado" valor={atrasadas} tono={atrasadas ? 'bad' : 'default'} icono={<SlaDot valor="atrasada" />} delay={180} />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[1180px] grid-cols-6 gap-3">
          {ETAPAS.map((etapa, col) => {
            const enEtapa = vacantes.filter((v) => v.etapa_actual === etapa);
            return (
              <section key={etapa} className="animate-rise flex min-h-[420px] flex-col rounded-3xl bg-stone-900/[0.025] p-2.5 ring-1 ring-stone-900/[0.04]" style={{ animationDelay: `${col * 60}ms` }}>
                <header className="flex items-center justify-between px-2 pt-1.5 pb-3">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className="tabular grid h-5 w-5 place-items-center rounded-md bg-white text-[10.5px] font-bold text-stone-500 ring-1 ring-stone-900/10">{col + 1}</span>
                    {NOMBRE_ETAPA[etapa]}
                  </h2>
                  <span className="tabular rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-stone-500 ring-1 ring-stone-900/5">{enEtapa.length}</span>
                </header>
                <div className="flex flex-1 flex-col gap-5 pt-2">
                  {enEtapa.map((v, i) => {
                    const info = INFO_ESTADO[v.estado];
                    return (
                      <Folder key={v.id} tab={false} className="animate-rise" style={{ animationDelay: `${col * 60 + i * 50}ms` }} cardClassName="p-3.5">
                        <Link href={`/at/candidatos?vacante=${v.id}`} className="group block">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="line-clamp-2 text-[13.5px] leading-snug font-semibold">{v.titulo}</h3>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-stone-300 transition-colors group-hover:text-liv" />
                          </div>
                          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-stone-500">
                            <SlaDot valor={v.semaforo} />
                            <span className="tabular">{v.dias_restantes === null ? 'Sin fecha' : v.dias_restantes < 0 ? `Vencida ${Math.abs(v.dias_restantes)} d` : `${v.dias_restantes} d háb.`}</span>
                            <span className="text-stone-300">·</span>
                            <Users className="h-3 w-3" />
                            <span className="tabular">{candidatosPor.get(v.id) ?? 0}</span>
                          </p>
                        </Link>
                        <div className="mt-3 border-t hairline pt-3">
                          {info?.esperaHM ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-liv-50 px-2 py-1 text-[11px] font-semibold text-liv-deep ring-1 ring-liv/15">
                              <Gavel className="h-3 w-3" /> Esperando al HM
                            </span>
                          ) : (
                            <AvanzarEtapa vacanteId={v.id} />
                          )}
                          {v.bloquea && <p className="mt-2 truncate text-[11px] font-medium text-rose-600">Bloquea: {v.bloquea.nombre ?? v.bloquea.rol}</p>}
                        </div>
                      </Folder>
                    );
                  })}
                  {enEtapa.length === 0 && <p className="px-2 pt-2 text-center text-[12px] text-stone-400">Sin vacantes</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
