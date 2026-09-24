import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ShellBase, NOMBRE_ROL } from '@/components/proceso/app-shell';
import { createClient } from '@/lib/supabase/server';
import type { RolUsuario } from '@/lib/supabase/types';

// El portal del candidato es "ligero": el candidato externo no tiene fila en `usuarios`.
// Mostramos su identidad de auth; si por error entra un usuario interno, respetamos su rol.
export default async function CandidatoLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('usuarios').select('nombre, rol').eq('id', user.id).maybeSingle();
  const nombre = perfil?.nombre ?? user.email ?? 'Candidato';
  const rolLabel = perfil ? NOMBRE_ROL[perfil.rol as RolUsuario] : 'Candidato';
  return <ShellBase nombre={nombre} rolLabel={rolLabel} email={user.email} inicio="/candidato">{children}</ShellBase>;
}
