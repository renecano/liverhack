'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { cerrarSesion } from '@/lib/actions/sesion';

export function LogoutButton() {
  const [saliendo, iniciarSalida] = useTransition();
  return (
    <button
      type="button"
      disabled={saliendo}
      onClick={() => iniciarSalida(() => cerrarSesion())}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="press focus-ring grid h-9 w-9 place-items-center rounded-full border border-stone-900/10 bg-white text-stone-500 hover:border-liv/40 hover:text-liv disabled:opacity-50"
    >
      <LogOut className={`h-4 w-4 ${saliendo ? 'animate-pulse' : ''}`} />
    </button>
  );
}
