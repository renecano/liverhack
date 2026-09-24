"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface OpcionGlide<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Si se da, la opción es un enlace (filtros por URL); si no, llama a onChange. */
  href?: string;
  tone?: "default" | "ok" | "warn" | "bad";
}

const TONO: Record<NonNullable<OpcionGlide<string>["tone"]>, string> = {
  default: "bg-stone-900/5 text-stone-600",
  ok: "bg-emerald-500/10 text-emerald-700",
  warn: "bg-amber-500/15 text-amber-700",
  bad: "bg-rose-500/10 text-rose-700",
};

/**
 * Glide Select: control segmentado cuya píldora activa se desliza con resorte
 * hasta la opción elegida. Sirve como filtro (onChange) o como navegación (href).
 */
export function GlideSelect<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  ariaLabel,
}: {
  options: OpcionGlide<T>[];
  value: T;
  onChange?: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const cont = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Mide la opción activa tras cada render y mueve la píldora (sin parpadeo).
  useLayoutEffect(() => {
    const el = cont.current?.querySelector<HTMLElement>(`[data-glide="${CSS.escape(value)}"]`);
    if (!el) return;
    const medir = () => setPill({ left: el.offsetLeft, width: el.offsetWidth });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  const pad = size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]";

  return (
    <div
      ref={cont}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-stone-900/[0.06] bg-stone-900/[0.035] p-1 scrollbar-none ${className}`}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.12)] ring-1 ring-stone-900/[0.04] transition-[left,width] duration-500 ease-spring"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => {
        const activo = o.value === value;
        const contenido = (
          <>
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              <span className={`tabular rounded-full px-1.5 py-px text-[11px] font-semibold ${activo && o.tone === undefined ? "bg-liv text-white" : TONO[o.tone ?? "default"]}`}>
                {o.count}
              </span>
            )}
          </>
        );
        const clase = `press focus-ring relative z-10 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${pad} ${
          activo ? "text-stone-950" : "text-stone-500 hover:text-stone-800"
        }`;
        return o.href ? (
          <Link key={o.value} href={o.href} data-glide={o.value} role="tab" aria-selected={activo} className={clase} scroll={false}>
            {contenido}
          </Link>
        ) : (
          <button key={o.value} type="button" data-glide={o.value} role="tab" aria-selected={activo} onClick={() => onChange?.(o.value)} className={clase}>
            {contenido}
          </button>
        );
      })}
    </div>
  );
}
