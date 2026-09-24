import { CalendarClock, ExternalLink, Users } from 'lucide-react';
import { sesion } from '@/lib/auth/sesion';
import { calendarioReal } from '@/lib/acciones/calendar';
import { estadoConexion } from '@/lib/acciones/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { AgendarEntrevista, type OpcionCandidato } from '@/components/proceso/agendar-entrevista';
import { ConexionGoogle } from '@/components/proceso/conexion-google';
import { Encabezado, Seccion, Vacio } from '@/components/proceso/piezas';

export const dynamic = 'force-dynamic';

type Uno<T> = T | T[] | null;
const uno = <T,>(x: Uno<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

type Db = NonNullable<Awaited<ReturnType<typeof sesion>>>['supabase'];

/** Entrevistas programadas desde hace 12 h (visibles por RLS). */
function proximasEntrevistas(db: Db) {
  return db
    .from('entrevistas')
    .select('id, fecha, tipo, estatus, calendar_event_id, candidatos(nombre), vacantes(titulo), entrevista_participantes(usuarios(nombre))')
    .eq('estatus', 'programada')
    .gte('fecha', new Date(Date.now() - 12 * 3600_000).toISOString())
    .order('fecha', { ascending: true });
}

// Agenda de entrevistas del AT. El layout exige rol "at"; las lecturas van con la sesión (RLS).
export default async function AgendaEntrevistas({ searchParams }: PageProps<'/at/entrevistas'>) {
  const { google } = await searchParams;
  const s = await sesion();
  if (!s) return null;
  const conexion = await estadoConexion(s.usuario.id);
  const modoReal = calendarioReal() && conexion.estado === 'conectado';

  const [cvRes, personasRes, entRes] = await Promise.all([
    s.supabase
      .from('candidato_vacante')
      .select('id, estatus, candidatos(nombre), vacantes!inner(titulo, estatus)')
      .in('vacantes.estatus', ['abierta', 'en_proceso'])
      .in('estatus', ['activo', 'finalista']),
    s.supabase.from('usuarios').select('id, nombre, area').eq('rol', 'entrevistador').eq('activo', true).order('nombre'),
    proximasEntrevistas(s.supabase),
  ]);

  type FilaCv = { id: string; candidatos: Uno<{ nombre: string }>; vacantes: Uno<{ titulo: string }> };
  const candidatos: OpcionCandidato[] = ((cvRes.data ?? []) as FilaCv[])
    .map((c) => ({ id: c.id, nombre: uno(c.candidatos)?.nombre ?? '—', vacante: uno(c.vacantes)?.titulo ?? '—' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  type FilaEnt = {
    id: string;
    fecha: string;
    tipo: string;
    calendar_event_id: string | null;
    candidatos: Uno<{ nombre: string }>;
    vacantes: Uno<{ titulo: string }>;
    entrevista_participantes: { usuarios: Uno<{ nombre: string }> }[];
  };
  const entrevistas = (entRes.data ?? []) as FilaEnt[];

  // Enlace del evento real: se guardó en audit_log al agendar (la tabla solo tiene el id).
  const enlaces = new Map<string, string>();
  const conEvento = entrevistas.filter((x) => x.calendar_event_id).map((x) => x.id);
  if (conEvento.length) {
    const { data } = await createAdminClient()
      .from('audit_log')
      .select('entidad_id, detalle')
      .eq('accion', 'agendar_entrevista')
      .in('entidad_id', conEvento);
    for (const a of data ?? []) {
      const link = (a.detalle as { html_link?: string } | null)?.html_link;
      if (link) enlaces.set(a.entidad_id as string, link);
    }
  }

  return (
    <div className="space-y-8">
      <Encabezado eyebrow="Atracción de Talento" titulo={<>Agenda de <span className="text-gradient-liv">entrevistas.</span></>}>
        Programa entrevistas con varios entrevistadores. Con Google Calendar conectado se crea el evento real; si no, se guarda en LivHire.
      </Encabezado>
      <ConexionGoogle conexion={conexion} modoReal={calendarioReal()} resultado={typeof google === 'string' ? google : undefined} />
      <AgendarEntrevista candidatos={candidatos} entrevistadores={(personasRes.data ?? []) as { id: string; nombre: string; area: string | null }[]} modoReal={modoReal} />

      <Seccion titulo="Próximas entrevistas">
        {entrevistas.length ? (
          <ul className="surface divide-y divide-stone-100 rounded-3xl">
            {entrevistas.map((x) => {
              const link = enlaces.get(x.id);
              return (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold">
                      {uno(x.candidatos)?.nombre ?? 'Candidato'} <span className="font-normal text-stone-500">· {uno(x.vacantes)?.titulo}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmt(x.fecha)}
                      </span>
                      <span className="capitalize">{x.tipo}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {x.entrevista_participantes.map((p) => uno(p.usuarios)?.nombre).filter(Boolean).join(', ') || '—'}
                      </span>
                    </p>
                  </div>
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-liv-deep ring-1 ring-liv/25 hover:bg-liv-50">
                      Ver en Google Calendar <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="rounded-full bg-stone-900/[0.04] px-2.5 py-1 text-[11.5px] font-medium text-stone-500">Agenda interna</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio>No hay entrevistas programadas.</Vacio>
        )}
      </Seccion>
    </div>
  );
}
