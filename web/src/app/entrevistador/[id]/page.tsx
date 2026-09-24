import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { obtenerCandidatos } from '@/lib/ia/consultas';
import type { PreguntaGuardada } from '@/lib/ia/schemas';
import { TemaIA } from '@/components/ia/TemaIA';
import { FichaEntrevista } from '@/components/entrevista/FichaEntrevista';
import { ScorecardEnVivo, type FeedbackFila } from '@/components/entrevista/ScorecardEnVivo';
import { clave } from '@/components/entrevista/competencias';

export const dynamic = 'force-dynamic';

const BASE = ['liderazgo', 'comunicacion', 'conocimiento_tecnico', 'resolucion_problemas', 'orientacion_resultados'];

export default async function EntrevistaPage({ params }: PageProps<'/entrevistador/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: entrevista } = await supabase
    .from('entrevistas')
    .select('id, vacante_id, candidato_id, fecha, tipo, estatus, vacantes(titulo)')
    .eq('id', id)
    .maybeSingle();
  if (!entrevista) notFound();

  const [cvRes, preguntasRes, participantesRes, feedbackRes, yoRes] = await Promise.all([
    supabase.from('candidato_vacante').select('id').eq('vacante_id', entrevista.vacante_id).eq('candidato_id', entrevista.candidato_id).maybeSingle(),
    supabase.from('preguntas_entrevista').select('preguntas, tipo').eq('vacante_id', entrevista.vacante_id).eq('candidato_id', entrevista.candidato_id),
    supabase.from('entrevista_participantes').select('entrevistador_id').eq('entrevista_id', id),
    supabase.from('feedback_entrevista').select('id, entrevistador_id, scores, veredicto, notas, ts').eq('entrevista_id', id),
    supabase.from('usuarios').select('id, nombre').eq('id', user.id).maybeSingle(),
  ]);

  const participantesIds = (participantesRes.data ?? []).map((p) => p.entrevistador_id as string);
  const participa = participantesIds.includes(user.id);
  const { data: personas } = participantesIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', participantesIds)
    : { data: [] };
  const nombres = Object.fromEntries((personas ?? []).map((p) => [p.id as string, p.nombre as string]));

  const [ficha] = cvRes.data ? await obtenerCandidatos(supabase, [cvRes.data.id as string]) : [];
  const juegos = (preguntasRes.data ?? []) as { preguntas: PreguntaGuardada[]; tipo: string }[];
  const preguntas = (juegos.find((j) => j.tipo === entrevista.tipo) ?? juegos[0])?.preguntas ?? [];
  const feedback = (feedbackRes.data ?? []) as FeedbackFila[];

  // Competencias del scorecard: las ya usadas por el panel + las de las preguntas sugeridas.
  const usadas = new Set<string>();
  for (const f of feedback) for (const k of Object.keys(f.scores ?? {})) usadas.add(k);
  for (const p of preguntas) if (p.competencia) usadas.add(clave(p.competencia));
  const competencias = (usadas.size ? [...usadas] : BASE).slice(0, 7);
  const vacante = Array.isArray(entrevista.vacantes) ? entrevista.vacantes[0] : entrevista.vacantes;

  return (
    <TemaIA>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/entrevistador" className="press group inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 hover:text-liv">
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" /> Mis entrevistas
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-stone-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-stone-900/5"><CalendarClock className="h-3.5 w-3.5" />{new Date(entrevista.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 capitalize ring-1 ring-stone-900/5"><Users className="h-3.5 w-3.5" />{entrevista.tipo} · {vacante?.titulo}</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <FichaEntrevista ficha={ficha ?? null} preguntas={preguntas} />
          </div>
          <ScorecardEnVivo
            entrevistaId={id}
            candidatoId={entrevista.candidato_id}
            yo={{ id: user.id, nombre: (yoRes.data?.nombre as string) ?? 'Yo' }}
            puedeCalificar={participa}
            nombres={nombres}
            participantes={participantesIds}
            competencias={competencias}
            feedbackInicial={feedback}
          />
        </div>
      </div>
    </TemaIA>
  );
}
