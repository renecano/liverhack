import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).maybeSingle();
  if (perfil?.rol === 'hm') redirect('/hm');
  if (perfil?.rol === 'hrbp') redirect('/hrbp');
  if (perfil?.rol === 'at') redirect('/at');
  if (perfil?.rol === 'entrevistador') redirect('/entrevistador');
  if (perfil?.rol === 'admin') redirect('/hrbp');
  redirect('/login');
}
