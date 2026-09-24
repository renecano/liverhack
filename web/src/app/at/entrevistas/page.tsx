import { CalendarClock } from 'lucide-react';
import { sesion } from '@/lib/auth/sesion';
import { estadoConexion } from '@/lib/acciones/google';
import { Encabezado } from '@/components/proceso/piezas';
import { ConexionGoogle } from '@/components/proceso/conexion-google';

export const dynamic = 'force-dynamic';

// Agenda de entrevistas del AT. El layout exige rol "at"; aquí se lee la conexión de
// Google Calendar del usuario en sesión.
export default async function AgendaEntrevistas({ searchParams }: PageProps<'/at/entrevistas'>) {
  const { google } = await searchParams;
  const s = await sesion();
  const conexion = s ? await estadoConexion(s.usuario.id) : ({ estado: 'no_conectado' } as const);
  const modoReal = process.env.ACTIONS_MODE === 'real';

  return (
    <div className="space-y-8">
      <Encabezado eyebrow="Atracción de Talento" titulo={<>Agenda de <span className="text-gradient-liv">entrevistas.</span></>}>
        Programa entrevistas con varios entrevistadores. Con Google Calendar conectado se crea el evento real; si no, se guarda en LivHire.
      </Encabezado>
      <ConexionGoogle conexion={conexion} modoReal={modoReal} resultado={typeof google === 'string' ? google : undefined} />
      <p className="flex items-center gap-2 text-[13px] text-stone-400">
        <CalendarClock className="h-4 w-4" /> La programación de entrevistas llega en el siguiente paso.
      </p>
    </div>
  );
}
