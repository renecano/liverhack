'use client';

import { useTransition } from 'react';
import { cerrarSesion } from '@/lib/actions/sesion';

export function LogoutButton() {
  const [saliendo, iniciarSalida] = useTransition();
  return (
    <button
      type="button"
      disabled={saliendo}
      onClick={() => iniciarSalida(() => cerrarSesion())}
      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium transition hover:border-[#c8105a] hover:text-[#c8105a] disabled:opacity-50"
    >
      {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
