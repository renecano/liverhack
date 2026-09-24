import type { ReactNode } from 'react';
import { AppShell } from '@/components/proceso/app-shell';
import { exigirRol } from '@/lib/auth/sesion';

export default async function HrbpLayout({ children }: { children: ReactNode }) {
  const usuario = await exigirRol(['hrbp', 'admin']);
  return <AppShell nombre={usuario.nombre} rol={usuario.rol}>{children}</AppShell>;
}
