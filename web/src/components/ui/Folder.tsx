"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";

/**
 * Folder Float: tarjeta-carpeta con hojas apiladas detrás y una inclinación 3D
 * que sigue al puntero. La inclinación es sutil (máx. ~5°) y se desactiva con
 * prefers-reduced-motion (ver .folder en globals.css).
 */
export function Folder({
  children,
  className = "",
  cardClassName = "",
  tab = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  tab?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function mover(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${x * 7}deg`);
    el.style.setProperty("--rx", `${-y * 6}deg`);
  }

  function soltar() {
    ref.current?.style.setProperty("--ry", "0deg");
    ref.current?.style.setProperty("--rx", "0deg");
  }

  return (
    <div ref={ref} onPointerMove={mover} onPointerLeave={soltar} className={`folder rounded-2xl ${className}`} style={style}>
      <span className="folder-sheet s2 rounded-2xl" aria-hidden />
      <span className="folder-sheet s1 rounded-2xl" aria-hidden />
      <div className={`folder-card surface rounded-2xl ${cardClassName}`}>
        {tab && <span className="folder-tab" aria-hidden />}
        {children}
      </div>
    </div>
  );
}
