import Link from 'next/link';
import { ArrowUpRight, CalendarClock, CircleCheck, Clock, Radio, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Encabezado, Metrica, Seccion, Vacio } from '@/components/proceso/piezas';
import { Folder } from '@/components/ui/Folder';

export const dynamic = 'force-dynamic';

type Fila = {
  id: string;
  fecha: string;
  tipo: 'competencias' | 'panel';
  estatus: 'programada' | 'realizada' | 'cancelada';
  candidatos: { nombre: string; puesto_actual: string | null } | { nombre: string; puesto_actual: string | null }[] | null;
  vacantes: { titulo: string } | { titulo: string }[] | null;
  feedback_entrevista: { entrevistador_id: string; veredicto: string | null }[];
  entrevista_participantes: { entrevistador_id: string }[];
};

const uno = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function EntrevistadorInicio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const yo = user?.id ?? '';
  // Solo las entrevistas donde participo (RLS ya limita; el filtro explícito evita las del resto de la vacante).
  const { data: mias } = await supabase.from('entrevista_participantes').select('entrevista_id').eq('entrevistador_id', yo);
  const ids = (mias ?? []).map((m) => m.entrevista_id as string);
  const { data } = ids.length
    ? await supabase
        .from('entrevistas')
        .select('id, fecha, tipo, estatus, candidatos(nombre, puesto_actual), vacantes(titulo), feedback_entrevista(entrevistador_id, veredicto), entrevista_participantes(entrevistador_id)')
        .in('id', ids)
        .order('fecha', { ascending: true })
    : { data: [] };
  const filas = (data ?? []) as unknown as Fila[];
  const proximas = filas.filter((f) => f.estatus === 'programada');
  const realizadas = filas.filter((f) => f.estatus === 'realizada').reverse();
  const pendientesFeedback = filas.filter((f) => f.estatus !== 'cancelada' && !f.feedback_entrevista.some((x) => x.entrevistador_id === yo));

  const tarjeta = (f: Fila, i: number) => {
    const c = uno(f.candidatos);
    const mio = f.feedback_entrevista.find((x) => x.entrevistador_id === yo);
    return (
      <Folder key={f.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }} cardClassName="h-full">
        <Link href={`/entrevistador/${f.id}`} className="group block h-full p-5">
          <div className="flex items-start justify-between gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize ring-1 ring-inset ${f.tipo === 'panel' ? 'bg-liv-50 text-liv-deep ring-liv/20' : 'bg-stone-900/[0.04] text-stone-600 ring-stone-900/5'}`}>
              {f.tipo === 'panel' ? <Users className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {f.tipo}
            </span>
            <ArrowUpRight className="h-4 w-4 text-stone-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-liv" />
          </div>
          <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.01em]">{c?.nombre ?? 'Candidato'}</h3>
          <p className="truncate text-[12.5px] text-stone-500">{uno(f.vacantes)?.titulo}</p>
          <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-stone-600"><CalendarClock className="h-3.5 w-3.5" />{fmt(f.fecha)}</p>
          <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-stone-500"><Users className="h-3.5 w-3.5" />{f.entrevista_participantes.length} entrevistador{f.entrevista_participantes.length === 1 ? '' : 'es'}</span>
            {mio ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><CircleCheck className="h-3.5 w-3.5" />Calificada</span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-liv"><Radio className="h-3.5 w-3.5" />Por calificar</span>
            )}
          </div>
        </Link>
      </Folder>
    );
  };

  return (
    <div className="space-y-12">
      <Encabezado eyebrow="Entrevistador" titulo={<>Califica <span className="text-gradient-liv">en tiempo real.</span></>}>
        Ficha del candidato, preguntas sugeridas por IA y un scorecard que tu panel ve al instante.
      </Encabezado>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metrica etiqueta="Próximas" valor={proximas.length} icono={<CalendarClock className="h-4 w-4" />} />
        <Metrica etiqueta="Por calificar" valor={pendientesFeedback.length} tono={pendientesFeedback.length ? 'liv' : 'default'} icono={<Radio className="h-4 w-4" />} delay={60} />
        <Metrica etiqueta="Realizadas" valor={realizadas.length} tono="ok" icono={<CircleCheck className="h-4 w-4" />} delay={120} />
      </div>

      <Seccion titulo="Próximas entrevistas">
        {proximas.length ? <div className="grid gap-x-5 gap-y-8 pt-3 md:grid-cols-2 xl:grid-cols-3">{proximas.map(tarjeta)}</div> : <Vacio>No tienes entrevistas programadas.</Vacio>}
      </Seccion>
      <Seccion titulo="Historial">
        {realizadas.length ? <div className="grid gap-x-5 gap-y-8 pt-3 md:grid-cols-2 xl:grid-cols-3">{realizadas.map(tarjeta)}</div> : <Vacio>Aún no hay entrevistas realizadas.</Vacio>}
      </Seccion>
    </div>
  );
}
