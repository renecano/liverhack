"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { GlideSelect } from "@/components/ui/GlideSelect";
import { VisorCvInline } from "./VisorCv";

/** Visor de CV incrustado en la comparativa: pestañas deslizantes por candidato. */
export function PanelCvComparativa({ candidatos }: { candidatos: { candidato_id: string; nombre: string; tiene_cv: boolean }[] }) {
  const [actual, setActual] = useState(candidatos[0]?.candidato_id ?? "");
  const c = candidatos.find((x) => x.candidato_id === actual) ?? candidatos[0];
  if (!c) return null;
  return (
    <div className="surface flex h-full flex-col gap-3 rounded-3xl p-3">
      <div className="flex items-center gap-2 px-1 pt-1">
        <FileText className="h-4 w-4 text-liv" />
        <p className="text-[13px] font-semibold">Visor de CV</p>
      </div>
      <GlideSelect
        size="sm"
        value={c.candidato_id}
        onChange={setActual}
        ariaLabel="CV del candidato"
        options={candidatos.map((x) => ({ value: x.candidato_id, label: x.nombre.split(" ")[0] }))}
      />
      <div className="min-h-0 flex-1">
        {c.tiene_cv ? (
          <VisorCvInline candidatoId={c.candidato_id} nombre={c.nombre} />
        ) : (
          <div className="grid h-full place-items-center rounded-2xl bg-stone-50 p-6 text-center text-[13px] text-stone-500 ring-1 ring-stone-900/5">
            {c.nombre} no tiene un CV en PDF cargado.
          </div>
        )}
      </div>
    </div>
  );
}
