import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CandidateActions } from '@/components/proceso/candidate-actions';
import { Semaforo } from '@/components/proceso/semaforo';
import { getResumenVacantes } from '@/lib/actions/proceso';
import { createClient } from '@/lib/supabase/server';
import { NOMBRE_ETAPA } from '@/lib/orquestador/estados';

type FichaCandidato = { candidato_id: string; estatus: string; fit_score: number | null; compatibilidad_nnn: number | null; es_referido: boolean; prioridad: number; candidatos: { nombre: string; puesto_actual: string | null; empresa_actual: string | null } | null };

export default async function VacanteHmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [resumen, supabase] = await Promise.all([getResumenVacantes(), createClient()]);
  const vacante = resumen.ok ? resumen.data.find((v) => v.id === id) : undefined;
  if (!vacante) notFound();
  const { data } = await supabase.from('candidato_vacante').select('candidato_id, estatus, fit_score, compatibilidad_nnn, es_referido, prioridad, candidatos(nombre, puesto_actual, empresa_actual)').eq('vacante_id', id).order('prioridad', { ascending: false });
  // PostgREST tipa la relación anidada como arreglo aunque candidato_vacante → candidato es 1:1.
  const candidatos = (data ?? []).map((fila) => ({
    ...fila,
    candidatos: Array.isArray(fila.candidatos) ? fila.candidatos[0] ?? null : fila.candidatos,
  })) as FichaCandidato[];
  const esCompuertaGeneral = ['ESPERANDO_HM_VALIDA_NNN', 'ESPERANDO_HM_SELECCIONA_PERFILES', 'ESPERANDO_HM_DEFINE_POOL'].includes(vacante.estado);
  const esFinalista = vacante.estado === 'ESPERANDO_HM_DECIDE_FINALISTA';
  const terminal = vacante.estado === 'CUBIERTA' || vacante.estado === 'CANCELADA';
  const sinAccionHM = !esCompuertaGeneral && !esFinalista && !terminal;
  return <div className="space-y-6"><Link href="/hm" className="text-sm font-semibold text-[#c8105a]">← Volver al tablero</Link><section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-[#c8105a]">{vacante.estado.replaceAll('_', ' ')}</p><h1 className="mt-1 text-3xl font-bold">{vacante.titulo}</h1><p className="mt-2 text-slate-600">Etapa actual: {NOMBRE_ETAPA[vacante.etapa_actual]}. Responsable: {vacante.responsable.nombre ?? vacante.responsable.rol ?? '—'}.</p></div><div className="text-right"><Semaforo color={vacante.color} etiqueta={vacante.semaforo} /><p className="mt-2 text-sm text-slate-500">{vacante.dias_restantes ?? '—'} días hábiles restantes</p></div></div>{esCompuertaGeneral && <div className="mt-5"><CandidateActions vacanteId={id} estado={vacante.estado} /></div>}{sinAccionHM && <p className="mt-5 rounded-md bg-stone-100 p-3 text-sm text-slate-600">No hay acciones pendientes para ti en este momento: la vacante está en manos de {vacante.responsable.nombre ?? vacante.responsable.rol ?? 'el equipo operativo'}.</p>}{terminal && <p className="mt-5 rounded-md bg-stone-100 p-3 text-sm text-slate-600">Proceso {vacante.estado === 'CUBIERTA' ? 'cubierto' : 'cancelado'}: no admite más decisiones.</p>}</section><section><h2 className="text-xl font-semibold">Candidatos para revisión</h2><p className="mt-1 text-sm text-slate-600">Las decisiones son humanas y exigen una justificación que se registra en el expediente.</p><div className="mt-4 space-y-3">{candidatos.length ? candidatos.map((c) => <article key={c.candidato_id} className="rounded-xl border border-stone-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{c.candidatos?.nombre ?? 'Candidato'}</h3>{c.es_referido && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-[#c8105a]">Referido</span>}</div><p className="mt-1 text-sm text-slate-600">{c.candidatos?.puesto_actual ?? 'Puesto no registrado'}{c.candidatos?.empresa_actual ? ` · ${c.candidatos.empresa_actual}` : ''}</p></div><span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold">{c.estatus}</span></div><div className="mt-4 flex gap-5 text-sm"><p><span className="text-slate-500">Fit:</span> <strong>{c.fit_score ?? '—'}</strong></p><p><span className="text-slate-500">NN:</span> <strong>{c.compatibilidad_nnn ?? '—'}</strong></p></div>{esFinalista && <div className="mt-4"><CandidateActions vacanteId={id} candidatoId={c.candidato_id} estado={vacante.estado} /></div>}</article>) : <p className="rounded-lg border border-dashed border-stone-300 p-5 text-sm text-slate-500">Aún no hay candidatos en esta vacante.</p>}</div></section></div>;
}
