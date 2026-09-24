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

/**
 * Sesión del usuario para Server Actions y Route Handlers (no redirige).
 * Devuelve el cliente de sesión (respeta RLS) y el usuario activo, o null.
 * Vive aquí (y no en lib/actions/proceso.ts) porque ese archivo es "use server":
 * exportarla allí la volvería una Server Action invocable desde el cliente.
 */
export async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, rol, activo')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.activo) return null;
  return { supabase, usuario: usuario as { id: string; rol: RolUsuario } };
}
