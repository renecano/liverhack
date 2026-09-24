"use client";

import { useEffect, useState } from "react";

type Estado = { tipo: "cargando" } | { tipo: "ok"; url: string } | { tipo: "error"; mensaje: string };

// Visor de CV en PDF integrado (panel lateral con iframe del PDF de Storage).
export function VisorCv({ candidatoId, nombre, onCerrar }: { candidatoId: string; nombre: string; onCerrar: () => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  useEffect(() => {
    let url: string | null = null;
    let vivo = true;
    fetch(`/api/cv/${candidatoId}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "No se pudo cargar el CV");
        }
        url = URL.createObjectURL(await r.blob());
        if (vivo) setEstado({ tipo: "ok", url });
      })
      .catch((e: Error) => {
        if (vivo) setEstado({ tipo: "error", mensaje: e.message });
      });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [candidatoId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-stone-900/40"
      onClick={onCerrar}
      role="dialog"
      aria-modal
      aria-label={`CV de ${nombre}`}
    >
      <div
        className="lh-rise flex h-full w-full max-w-3xl flex-col bg-[var(--lh-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--lh-rule)] px-5 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--lh-muted)]">Curriculum vitae</p>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{nombre}</p>
          </div>
          <button onClick={onCerrar} className="rounded px-3 py-1 text-sm text-[var(--lh-ink-2)] hover:bg-stone-100">
            Cerrar ✕
          </button>
        </div>
        <div className="flex-1 bg-stone-100">
          {estado.tipo === "cargando" && <p className="p-8 text-sm text-[var(--lh-muted)]">Cargando PDF…</p>}
          {estado.tipo === "error" && (
            <div className="p-8 text-sm">
              <p className="font-medium">CV no disponible</p>
              <p className="mt-1 text-[var(--lh-muted)]">{estado.mensaje}</p>
            </div>
          )}
          {estado.tipo === "ok" && <iframe src={estado.url} title={`CV de ${nombre}`} className="h-full w-full" />}
        </div>
      </div>
    </div>
  );
}
