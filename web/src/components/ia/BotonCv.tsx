"use client";

import { useState } from "react";
import { VisorCv } from "./VisorCv";

export function BotonCv({ candidatoId, nombre }: { candidatoId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded border border-[var(--lh-rule)] px-2.5 py-1 text-xs hover:border-[var(--lh-ink)]"
      >
        Ver CV (PDF)
      </button>
      {abierto && <VisorCv candidatoId={candidatoId} nombre={nombre} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
