import { Layers, TriangleAlert } from 'lucide-react';
import { getResumenVacantes } from '@/lib/actions/proceso';
import { NotificationCenter } from '@/components/proceso/notification-center';
import { RequisitionForm } from '@/components/proceso/requisition-form';
import { Directorio, type FilaDirectorio } from '@/components/proceso/directorio';
import { Encabezado, Metrica, Seccion, Vacio } from '@/components/proceso/piezas';
import { SlaDot } from '@/components/ui/Sla';
import { Ring } from '@/components/ui/Ring';
import { createClient } from '@/lib/supabase/server';
import type { Notificacion } from '@/lib/supabase/types';
import { INFO_ESTADO, NOMBRE_ETAPA } from '@/lib/orquestador/estados';
import { entregasDe } from '@/lib/acciones/entrega';

type Area = { nombre: string; a_tiempo: number; en_riesgo: number; atrasada: number; bloqueos: { vacante: string; quien: string }[] };

export default async function HrbpDashboard() {
  const [resumen, supabase] = await Promise.all([getResumenVacantes(), createClient()]);
  const [posicionesRes, personasRes, notificacionesRes, areasRes] = await Promise.all([
    // Todas las posiciones: las no autorizadas se muestran con candado (la BD también lo valida).
    supabase.from('posiciones').select('id, nombre_puesto, area, nivel, autorizada').order('nombre_puesto'),
    supabase.from('usuarios').select('id, nombre, rol').eq('activo', true).order('nombre'),
    supabase.from('notificaciones').select('*').order('ts', { ascending: false }).limit(8),
    supabase.from('vacantes').select('id, posiciones(area)'),
  ]);
  const entregas = await entregasDe(notificacionesRes.data ?? []);
  const vacantes = resumen.ok ? resumen.data.filter((v) => !INFO_ESTADO[v.estado]?.terminal) : [];

  // Área real de cada vacante (posiciones.area). PostgREST puede tipar la relación como arreglo.
  const areaDe = new Map<string, string>();
  for (const f of (areasRes.data ?? []) as { id: string; posiciones: { area: string } | { area: string }[] | null }[]) {
    const p = Array.isArray(f.posiciones) ? f.posiciones[0] : f.posiciones;
    if (p?.area) areaDe.set(f.id, p.area);
  }

  const areas = new Map<string, Area>();
  for (const v of vacantes) {
    const area = areaDe.get(v.id) ?? 'Sin área asignada';
    const actual = areas.get(area) ?? { nombre: area, a_tiempo: 0, en_riesgo: 0, atrasada: 0, bloqueos: [] };
    if (v.semaforo === 'a_tiempo') actual.a_tiempo += 1;
    if (v.semaforo === 'en_riesgo') actual.en_riesgo += 1;
    if (v.semaforo === 'atrasada') actual.atrasada += 1;
    if (v.bloquea) actual.bloqueos.push({ vacante: v.titulo, quien: v.bloquea.nombre ?? v.bloquea.rol ?? '—' });
    areas.set(area, actual);
  }
  // Peor salud primero: lo atrasado arriba.
  const listaAreas = [...areas.values()].sort((a, b) => b.atrasada - a.atrasada || b.en_riesgo - a.en_riesgo);
  const total = (s: 'a_tiempo' | 'en_riesgo' | 'atrasada') => listaAreas.reduce((n, a) => n + a[s], 0);

  const filas: FilaDirectorio[] = vacantes.map((v) => ({
    id: v.id,
    titulo: v.titulo,
    etapa: NOMBRE_ETAPA[v.etapa_actual],
    area: areaDe.get(v.id) ?? '—',
    semaforo: v.semaforo,
    hm: v.directorio.hm,
    at: v.directorio.at,
    hrbp: v.directorio.hrbp,
    bloquea: v.bloquea ? (v.bloquea.nombre ?? v.bloquea.rol) : null,
  }));

  return (
    <div className="space-y-12">
      <Encabezado eyebrow="HR Business Partner" titulo={<>Visibilidad <span className="text-gradient-liv">estratégica.</span></>}>
        Salud del SLA por área, directorio de responsables y requisiciones con candado de posición.
      </Encabezado>

      {!resumen.ok && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-700">{resumen.codigo}: {resumen.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etiqueta="Vacantes activas" valor={vacantes.length} icono={<Layers className="h-4 w-4" />} detalle={`${listaAreas.length} áreas`} />
        <Metrica etiqueta="A tiempo" valor={total('a_tiempo')} tono="ok" icono={<SlaDot valor="a_tiempo" />} delay={60} />
        <Metrica etiqueta="En riesgo" valor={total('en_riesgo')} tono={total('en_riesgo') ? 'warn' : 'default'} icono={<SlaDot valor="en_riesgo" />} delay={120} />
        <Metrica etiqueta="Atrasadas" valor={total('atrasada')} tono={total('atrasada') ? 'bad' : 'default'} icono={<SlaDot valor="atrasada" />} delay={180} />
      </div>

      <Seccion id="sla" titulo="Salud del SLA por área" descripcion="Qué va a tiempo, qué está en riesgo y qué área bloquea.">
        {listaAreas.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listaAreas.map((area, i) => {
              const n = area.a_tiempo + area.en_riesgo + area.atrasada;
              const salud = n ? Math.round((area.a_tiempo / n) * 100) : 100;
              const pct = (x: number) => `${n ? (x / n) * 100 : 0}%`;
              return (
                <article key={area.nombre} className="animate-rise surface rounded-3xl p-5" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{area.nombre}</h3>
                      <p className="mt-0.5 text-[12.5px] text-stone-500">{n} vacante{n === 1 ? '' : 's'} activas</p>
                    </div>
                    <Ring valor={salud} size={54} destacado={salud < 60} label="Salud: % a tiempo" />
                  </div>
                  <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-stone-100">
                    <span className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: pct(area.a_tiempo) }} />
                    <span className="h-full bg-amber-400 transition-[width] duration-700" style={{ width: pct(area.en_riesgo) }} />
                    <span className="h-full bg-rose-500 transition-[width] duration-700" style={{ width: pct(area.atrasada) }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-stone-600">
                    <span className="inline-flex items-center gap-1.5"><SlaDot valor="a_tiempo" />{area.a_tiempo} a tiempo</span>
                    <span className="inline-flex items-center gap-1.5"><SlaDot valor="en_riesgo" />{area.en_riesgo} en riesgo</span>
                    <span className="inline-flex items-center gap-1.5"><SlaDot valor="atrasada" />{area.atrasada} atrasadas</span>
                  </div>
                  {area.bloqueos.length > 0 && (
                    <ul className="mt-4 space-y-1.5 rounded-2xl bg-rose-50/70 p-3 text-[12.5px] text-rose-800 ring-1 ring-rose-600/10">
                      {area.bloqueos.map((b) => (
                        <li key={b.vacante} className="flex items-start gap-2">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span><strong className="font-semibold">{b.quien}</strong> bloquea {b.vacante}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Vacio>No hay vacantes activas visibles.</Vacio>
        )}
      </Seccion>

      <Seccion id="requisicion" titulo="Requisición con candado" descripcion="Solo posiciones que existen y están autorizadas pueden abrir un proceso.">
        <RequisitionForm posiciones={posicionesRes.data ?? []} personas={personasRes.data ?? []} />
      </Seccion>

      <Seccion titulo="Directorio estratégico" descripcion="Por vacante: quién es HM, AT y HRBP, y quién tiene la pelota.">
        <Directorio filas={filas} />
      </Seccion>

      <NotificationCenter notificaciones={(notificacionesRes.data ?? []) as Notificacion[]} entregas={entregas} />
    </div>
  );
}
