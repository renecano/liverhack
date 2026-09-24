"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { abrirCopiloto } from "./Copiloto";

/** Botón que abre el copiloto (y opcionalmente le hace una pregunta). */
export function BotonCopiloto({ pregunta, children, variante = "liv" }: { pregunta?: string; children: ReactNode; variante?: "liv" | "suave" }) {
  return (
    <button
      type="button"
      onClick={() => abrirCopiloto(pregunta)}
      className={`press focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold ${
        variante === "liv" ? "btn-liv" : "border border-liv/25 bg-white text-liv-deep hover:bg-liv-50"
      }`}
    >
      <Sparkles className="h-4 w-4" />
      {children}
    </button>
  );
}
