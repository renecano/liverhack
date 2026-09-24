"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { VisorCv } from "./VisorCv";

export function BotonCv({ candidatoId, nombre }: { candidatoId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="press inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-stone-700 ring-1 ring-stone-900/10 hover:text-liv-deep hover:ring-liv/40"
      >
        <FileText className="h-3.5 w-3.5" /> CV
      </button>
      {abierto && <VisorCv candidatoId={candidatoId} nombre={nombre} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
