import { CheckCheck, MailCheck, PenLine, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Notificacion } from '@/lib/supabase/types';
import { entregasDe } from '@/lib/acciones/entrega';
import { NotificationCenter } from '@/components/proceso/notification-center';
import { Encabezado, Metrica } from '@/components/proceso/piezas';

export const dynamic = 'force-dynamic';

// Centro de comunicaciones "Cero ghosting" del AT: borradores de la IA → aprobación por lote.
// Lee con la sesión (RLS: el AT ve todas las notificaciones).
export default async function ComunicacionesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('notificaciones').select('*').order('ts', { ascending: false }).limit(80);
  const notificaciones = (data ?? []) as Notificacion[];
  const entregas = await entregasDe(notificaciones);

  // Nombre visible de cada destinatario (candidato o usuario interno).
  const ids = (tipo: 'candidato' | 'usuario') => [...new Set(notificaciones.filter((n) => n.destinatario_tipo === tipo).map((n) => n.destinatario_id))];
  const [cands, usuarios] = await Promise.all([
    ids('candidato').length ? supabase.from('candidatos').select('id, nombre').in('id', ids('candidato')) : Promise.resolve({ data: [] }),
    ids('usuario').length ? supabase.from('usuarios').select('id, nombre').in('id', ids('usuario')) : Promise.resolve({ data: [] }),
  ]);
  const destinatarios: Record<string, string> = {};
  for (const x of [...(cands.data ?? []), ...(usuarios.data ?? [])] as { id: string; nombre: string }[]) destinatarios[x.id] = x.nombre;

  const cuenta = (e: string) => notificaciones.filter((n) => n.estatus === e).length;
  const aCandidatos = notificaciones.filter((n) => n.destinatario_tipo === 'candidato');
  const informados = aCandidatos.filter((n) => n.estatus === 'enviada').length;
  const cobertura = aCandidatos.length ? Math.round((informados / aCandidatos.length) * 100) : 100;

  return (
    <div className="space-y-10">
      <Encabezado eyebrow="Centro de comunicaciones" titulo={<>Cero ghosting, <span className="text-gradient-liv">por diseño.</span></>}>
        Cada cambio de etapa genera un aviso. La IA lo redacta y lo personaliza; tú lo apruebas en lote y sale. Nadie se queda sin respuesta.
      </Encabezado>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica etiqueta="Borradores por aprobar" valor={cuenta('borrador')} tono={cuenta('borrador') ? 'warn' : 'default'} icono={<PenLine className="h-4 w-4" />} />
        <Metrica etiqueta="Aprobadas sin enviar" valor={cuenta('aprobada')} icono={<MailCheck className="h-4 w-4" />} delay={60} />
        <Metrica etiqueta="Enviadas" valor={cuenta('enviada')} tono="ok" icono={<Send className="h-4 w-4" />} delay={120} />
        <Metrica etiqueta="Candidatos informados" valor={`${cobertura}%`} tono="liv" icono={<CheckCheck className="h-4 w-4" />} detalle={`${informados} de ${aCandidatos.length} avisos a candidatos`} delay={180} />
      </div>

      <NotificationCenter titulo="Bandeja de aprobación" notificaciones={notificaciones} entregas={entregas} destinatarios={destinatarios} />
    </div>
  );
}
