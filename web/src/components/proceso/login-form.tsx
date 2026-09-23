'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setEnviando(true);
    const form = new FormData(event.currentTarget);
    const { error: authError } = await createClient().auth.signInWithPassword({ email: String(form.get('email')), password: String(form.get('password')) });
    setEnviando(false);
    if (authError) { setError('No fue posible iniciar sesión. Revisa tu correo y contraseña.'); return; }
    router.replace('/'); router.refresh();
  }
  return <form onSubmit={enviar} className="mt-7 space-y-4"><label className="block text-sm font-medium">Correo<input required name="email" type="email" autoComplete="email" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-[#c8105a]" /></label><label className="block text-sm font-medium">Contraseña<input required name="password" type="password" autoComplete="current-password" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-[#c8105a]" /></label>{error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={enviando} className="w-full rounded-md bg-[#c8105a] px-4 py-2.5 font-semibold text-white hover:bg-[#a70d4d] disabled:opacity-60">{enviando ? 'Ingresando…' : 'Iniciar sesión'}</button><p className="text-xs leading-5 text-slate-500">Demo: ejecuta <code>npm run seed:auth</code> para habilitar los usuarios del seed.</p></form>;
}
