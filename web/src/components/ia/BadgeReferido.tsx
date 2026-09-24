import { Star } from "lucide-react";

export function BadgeReferido() {
  return (
    <span
      title="Candidato referido: prioridad en el ranking (programa de referidos)"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-liv to-[#ff4fa7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_4px_10px_-4px_rgb(226_0_122/0.7)]"
    >
      <Star className="h-2.5 w-2.5 fill-white" strokeWidth={0} /> Referido
    </span>
  );
}
