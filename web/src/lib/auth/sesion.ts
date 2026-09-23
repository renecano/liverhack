import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { RolUsuario, Usuario } from '@/lib/supabase/types';

export async function exigirRol(rolEsperado: RolUsuario): Promise<Usuario> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', user.id).maybeSingle();
  if (!perfil) redirect('/login');
  const usuario = perfil as Usuario;
  if (usuario.rol === rolEsperado) return usuario;
  if (usuario.rol === 'hm') redirect('/hm');
  if (usuario.rol === 'hrbp') redirect('/hrbp');
  if (usuario.rol === 'at') redirect('/at');
  if (usuario.rol === 'entrevistador') redirect('/entrevistador');
  redirect('/login');
}
