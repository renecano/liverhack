import { getResumenVacantes } from '@/lib/actions/proceso';
import { NotificationCenter } from '@/components/proceso/notification-center';
import { RequisitionForm } from '@/components/proceso/requisition-form';
import { Semaforo } from '@/components/proceso/semaforo';
import { createClient } from '@/lib/supabase/server';
import type { Notificacion } from '@/lib/supabase/types';
import { entregasDe } from '@/lib/acciones/entrega';

type Area = { nombre: string; a_tiempo: number; en_riesgo: number; atrasada: number; bloqueos: string[] };

export default async function HrbpDashboard() {
  const [resumen, supabase] = await Promise.all([getResumenVacantes(), createClient()]);
  const [posicionesRes, personasRes, notificacionesRes] = await Promise.all([
    supabase.from('posiciones').select('id, nombre_puesto, area, nivel, autorizada').eq('autorizada', true).order('nombre_puesto'),
    supabase.from('usuarios').select('id, nombre, rol').eq('activo', true).order('nombre'),
    supabase.from('notificaciones').select('*').order('ts', { ascending: false }).limit(8),
  ]);
  const entregas = await entregasDe(notificacionesRes.data ?? []);
  const vacantes = resumen.ok ? resumen.data : [];
  const areas = new Map<string, Area>();
  for (const v of vacantes) {
    const area = v.directorio.hrbp ?? 'Sin área asignada';
    const actual = areas.get(area) ?? { nombre: area, a_tiempo: 0, en_riesgo: 0, atrasada: 0, bloqueos: [] };
    if (v.semaforo === 'a_tiempo') actual.a_tiempo += 1;
    if (v.semaforo === 'en_riesgo') actual.en_riesgo += 1;
    if (v.semaforo === 'atrasada') actual.atrasada += 1;
    if (v.bloquea) actual.bloqueos.push(`${v.titulo}: ${v.bloquea.nombre ?? v.bloquea.rol}`);
    areas.set(area, actual);
  }
  return <div className="space-y-8"><section><p className="text-sm font-semibold uppercase tracking-[.18em] text-[#c8105a]">HR Business Partner</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Visibilidad del proceso</h1><p className="mt-2 text-slate-600">Directorio, candado de posiciones y SLA por área.</p></section>{!resumen.ok && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{resumen.codigo}: {resumen.error}</p>}<RequisitionForm posiciones={posicionesRes.data ?? []} personas={personasRes.data ?? []} /><section><h2 className="mb-3 text-xl font-semibold">Tablero de SLA por área</h2><div className="grid gap-4 lg:grid-cols-2">{[...areas.values()].map((area) => <article key={area.nombre} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">{area.nombre}</h3><div className="mt-4 flex flex-wrap gap-4 text-sm"><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">A tiempo: {area.a_tiempo}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">En riesgo: {area.en_riesgo}</span><span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">Atrasada: {area.atrasada}</span></div>{area.bloqueos.length > 0 && <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800"><strong>Bloqueos:</strong><ul className="mt-1 list-disc pl-5">{area.bloqueos.map((b) => <li key={b}>{b}</li>)}</ul></div>}</article>)}</div></section><section><h2 className="mb-3 text-xl font-semibold">Directorio de vacantes</h2><div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm"><table className="w-full min-w-175 text-left text-sm"><thead className="bg-stone-100 text-slate-600"><tr><th className="p-3">Vacante</th><th className="p-3">SLA</th><th className="p-3">HM</th><th className="p-3">AT</th><th className="p-3">HRBP</th><th className="p-3">Bloquea</th></tr></thead><tbody>{vacantes.map((v) => <tr key={v.id} className="border-t border-stone-100"><td className="p-3 font-medium">{v.titulo}<p className="text-xs font-normal text-slate-500">{v.etapa_actual}</p></td><td className="p-3"><Semaforo color={v.color} etiqueta={v.semaforo} /></td><td className="p-3">{v.directorio.hm ?? '—'}</td><td className="p-3">{v.directorio.at ?? '—'}</td><td className="p-3">{v.directorio.hrbp ?? '—'}</td><td className="p-3 text-rose-700">{v.bloquea?.nombre ?? '—'}</td></tr>)}</tbody></table></div></section><NotificationCenter notificaciones={(notificacionesRes.data ?? []) as Notificacion[]} entregas={entregas} /></div>;
}
