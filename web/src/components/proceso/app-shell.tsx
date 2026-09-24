import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RolUsuario } from '@/lib/supabase/types';
import { Copiloto } from '@/components/copiloto/Copiloto';
import { LogoutButton } from './logout-button';
import { NavRol, type ItemNav } from './nav-rol';

export const NOMBRE_ROL: Record<RolUsuario, string> = {
  hm: 'Hiring Manager',
  hrbp: 'HR Business Partner',
  at: 'Atracción de Talento',
  entrevistador: 'Entrevistador',
  admin: 'Administrador',
};

const INICIO: Record<RolUsuario, string> = {
  hm: '/hm',
  hrbp: '/hrbp',
  at: '/at',
  entrevistador: '/entrevistador',
  admin: '/hrbp',
};

const NAV: Record<RolUsuario, ItemNav[]> = {
  hm: [
    { href: '/hm', label: 'Mis vacantes' },
    { href: '/hm/candidatos', label: 'Candidatos' },
  ],
  at: [
    { href: '/at', label: 'Pipeline' },
    { href: '/at/candidatos', label: 'Candidatos' },
    { href: '/at/carga', label: 'Carga IA' },
    { href: '/at/comunicaciones', label: 'Comunicaciones' },
  ],
  hrbp: [
    { href: '/hrbp', label: 'SLA y directorio' },
    { href: '/hrbp/equidad', label: 'Equidad' },
  ],
  admin: [
    { href: '/hrbp', label: 'SLA y directorio' },
    { href: '/hrbp/equidad', label: 'Equidad' },
  ],
  entrevistador: [{ href: '/entrevistador', label: 'Mis entrevistas' }],
};

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function Marca({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#ff3d9e] to-liv text-[15px] font-black text-white shadow-[0_6px_16px_-6px_rgb(226_0_122/0.7)]">
        L
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-stone-950">
        Liv<span className="text-liv">Hire</span>
      </span>
    </span>
  );
}

/** Cabecera común a todas las vistas autenticadas: identidad + cerrar sesión. */
export function ShellBase({ children, nombre, rolLabel, inicio, nav, extra }: { children: ReactNode; nombre: string; rolLabel: string; inicio: string; nav?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="ambient min-h-screen text-stone-900">
      <header className="glass sticky top-0 z-40 border-b hairline">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link href={inicio} className="focus-ring shrink-0 rounded-lg">
              <Marca />
            </Link>
            <div className="hidden min-w-0 md:block">{nav}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-semibold">{nombre}</p>
              <p className="text-[11px] font-medium uppercase tracking-[.14em] text-stone-400">{rolLabel}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-950 text-[12px] font-semibold text-white ring-2 ring-white">
              {iniciales(nombre) || '·'}
            </span>
            <LogoutButton />
          </div>
        </div>
        {nav && <div className="mx-auto max-w-7xl overflow-x-auto px-4 pb-3 md:hidden">{nav}</div>}
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      {extra}
    </div>
  );
}

/** Shell para roles internos (hm, hrbp, at, entrevistador, admin). */
export function AppShell({ children, nombre, rol }: { children: ReactNode; nombre: string; rol: RolUsuario }) {
  const inicio = INICIO[rol] ?? '/';
  return (
    <ShellBase
      nombre={nombre}
      rolLabel={NOMBRE_ROL[rol]}
      inicio={inicio}
      nav={<NavRol items={NAV[rol]} />}
      extra={<Copiloto rol={rol} nombre={nombre} />}
    >
      {children}
    </ShellBase>
  );
}
