"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";

type Estado = { tipo: "cargando" } | { tipo: "ok"; url: string } | { tipo: "error"; mensaje: string };

/** Carga el PDF del CV (Storage vía /api/cv) como blob URL; lo libera al desmontar. */
function useCvPdf(candidatoId: string): Estado {
  const [estado, setEstado] = useState<Estado & { de?: string }>({ tipo: "cargando" });

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
        if (vivo) setEstado({ tipo: "ok", url, de: candidatoId });
      })
      .catch((e: Error) => {
        if (vivo) setEstado({ tipo: "error", mensaje: e.message, de: candidatoId });
      });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [candidatoId]);

  // Si cambió el candidato y aún no llega su PDF, se muestra "cargando".
  return estado.de === candidatoId ? estado : { tipo: "cargando" };
}

function Cuerpo({ estado, nombre }: { estado: Estado; nombre: string }) {
  if (estado.tipo === "cargando")
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="w-full max-w-md space-y-3">
          <div className="skeleton h-5 w-1/2 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-5/6 rounded" />
          <div className="skeleton h-3 w-4/6 rounded" />
          <div className="skeleton mt-6 h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  if (estado.tipo === "error")
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm">
        <div>
          <FileText className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-semibold">CV no disponible</p>
          <p className="mt-1 text-stone-500">{estado.mensaje}</p>
        </div>
      </div>
    );
  return <iframe src={estado.url} title={`CV de ${nombre}`} className="h-full w-full" />;
}

/** Visor de CV incrustado en la página (p. ej. panel de la comparativa). */
export function VisorCvInline({ candidatoId, nombre }: { candidatoId: string; nombre: string }) {
  const estado = useCvPdf(candidatoId);
  return (
    <div className="h-full overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-900/5">
      <Cuerpo estado={estado} nombre={nombre} />
    </div>
  );
}

// Visor de CV en PDF integrado (panel lateral con iframe del PDF de Storage).
export function VisorCv({ candidatoId, nombre, onCerrar }: { candidatoId: string; nombre: string; onCerrar: () => void }) {
  const estado = useCvPdf(candidatoId);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  // Portal: quien lo abre puede estar dentro de una tarjeta con transform.
  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-[60] flex justify-end bg-stone-950/25 backdrop-blur-[3px]"
      onClick={onCerrar}
      role="dialog"
      aria-modal
      aria-label={`CV de ${nombre}`}
    >
      <div
        className="animate-sheet m-0 flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-900/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-liv-50 text-liv ring-1 ring-liv/15">
              <FileText className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Curriculum vitae</p>
              <p className="text-[16px] font-semibold tracking-tight">{nombre}</p>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="press grid h-9 w-9 place-items-center rounded-full text-stone-500 hover:bg-stone-900/5 hover:text-stone-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 bg-stone-100">
          <Cuerpo estado={estado} nombre={nombre} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
