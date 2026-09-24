'use client';

import { usePathname } from 'next/navigation';
import { GlideSelect } from '@/components/ui/GlideSelect';

export type ItemNav = { href: string; label: string };

/** Navegación por rol con la píldora deslizante (Glide Select) sobre la ruta activa. */
export function NavRol({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();
  // La coincidencia más larga gana (/at/candidatos antes que /at).
  const activo = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => ruta === i.href || ruta.startsWith(`${i.href}/`))?.href ?? items[0]?.href ?? '';
  if (items.length === 0) return null;
  return (
    <GlideSelect
      size="sm"
      ariaLabel="Navegación"
      value={activo}
      options={items.map((i) => ({ value: i.href, label: i.label, href: i.href }))}
    />
  );
}
