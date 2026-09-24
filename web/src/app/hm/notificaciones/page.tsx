import { createClient } from '@/lib/supabase/server';
import type { Notificacion } from '@/lib/supabase/types';
import { entregasDe } from '@/lib/acciones/entrega';
import { NotificationCenter } from '@/components/proceso/notification-center';
import { Encabezado } from '@/components/proceso/piezas';

export const dynamic = 'force-dynamic';

// Centro de notificaciones "Cero ghosting" del HM. Lee con la sesión: RLS decide qué ve.
export default async function HmNotificacionesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('notificaciones').select('*').order('ts', { ascending: false }).limit(40);
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

  return (
    <div className="space-y-10">
      <Encabezado eyebrow="Hiring Manager" titulo={<>Cero <span className="text-gradient-liv">ghosting.</span></>}>
        Alertas de tus vacantes y el estado de cada aviso a candidatos: borrador, aprobado o enviado.
      </Encabezado>
      <NotificationCenter notificaciones={notificaciones} entregas={entregas} destinatarios={destinatarios} />
    </div>
  );
}
