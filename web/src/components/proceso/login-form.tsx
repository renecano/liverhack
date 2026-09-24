'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const campo =
  'mt-1.5 w-full rounded-xl border border-stone-900/10 bg-white/90 px-3.5 py-2.5 text-[14.5px] outline-none transition-shadow placeholder:text-stone-300 focus:border-liv/50 focus:ring-4 focus:ring-liv/10';

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
  return (
    <form onSubmit={enviar} className="mt-7 space-y-4">
      <label className="block text-[13px] font-medium text-stone-700">Correo
        <input required name="email" type="email" autoComplete="email" placeholder="nombre@liverpool.com.mx" className={campo} />
      </label>
      <label className="block text-[13px] font-medium text-stone-700">Contraseña
        <input required name="password" type="password" autoComplete="current-password" placeholder="••••••••" className={campo} />
      </label>
      {error && <p role="alert" className="animate-shake rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700 ring-1 ring-rose-600/10">{error}</p>}
      <button disabled={enviando} className="press btn-liv focus-ring group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14.5px] font-semibold disabled:opacity-60">
        {enviando ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Ingresando…</> : <>Iniciar sesión <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" /></>}
      </button>
      <p className="text-center text-[12px] leading-5 text-stone-400">Demo: ejecuta <code className="rounded bg-stone-900/5 px-1 font-mono">npm run seed:auth</code> para habilitar los usuarios del seed.</p>
    </form>
  );
}
