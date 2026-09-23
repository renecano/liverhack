import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RolUsuario } from '@/lib/supabase/types';
import { LogoutButton } from './logout-button';

export function AppShell({ children, nombre, rol }: { children: ReactNode; nombre: string; rol: RolUsuario }) {
  const inicio = rol === 'hrbp' ? '/hrbp' : '/hm';
  return <div className="min-h-screen bg-stone-50 text-slate-900"><header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4"><div className="flex items-center gap-7"><Link href={inicio} className="text-xl font-bold tracking-tight text-[#c8105a]">LivHire</Link><nav className="hidden gap-4 text-sm font-medium text-slate-600 sm:flex"><Link href={inicio} className="hover:text-[#c8105a]">Inicio</Link>{rol === 'hm' && <Link href="/hm" className="hover:text-[#c8105a]">Mis decisiones</Link>}{rol === 'hrbp' && <Link href="/hrbp" className="hover:text-[#c8105a]">SLA y directorio</Link>}</nav></div><div className="flex items-center gap-3 text-right"><div className="hidden text-sm sm:block"><p className="font-medium">{nombre}</p><p className="text-xs uppercase tracking-wide text-slate-500">{rol}</p></div><LogoutButton /></div></div></header><main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main></div>;
}
