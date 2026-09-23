import type { ReactNode } from 'react';
import { AppShell } from '@/components/proceso/app-shell';
import { exigirRol } from '@/lib/auth/sesion';

export default async function HmLayout({ children }: { children: ReactNode }) {
  const usuario = await exigirRol('hm');
  return <AppShell nombre={usuario.nombre} rol={usuario.rol}>{children}</AppShell>;
}
