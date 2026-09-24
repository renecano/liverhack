/**
 * Semáforo SLA de 3 estados. Acepta el color del motor de SLA
 * (verde/amarillo/rojo/gris) o el estatus de etapa (a_tiempo/en_riesgo/atrasada/completada).
 */
type Tono = "ok" | "warn" | "bad" | "idle";

export function tonoSla(valor: string | null | undefined): Tono {
  switch (valor) {
    case "verde":
    case "a_tiempo":
    case "completada":
      return "ok";
    case "amarillo":
    case "en_riesgo":
      return "warn";
    case "rojo":
    case "atrasada":
      return "bad";
    default:
      return "idle";
  }
}

const PUNTO: Record<Tono, string> = {
  ok: "bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]",
  warn: "bg-amber-400 shadow-[0_0_0_3px_rgb(245_158_11/0.18)] pulse-warn",
  bad: "bg-rose-500 shadow-[0_0_0_3px_rgb(239_68_68/0.18)] pulse-bad",
  idle: "bg-stone-300",
};

const CHIP: Record<Tono, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
  bad: "bg-rose-50 text-rose-700 ring-rose-600/15",
  idle: "bg-stone-100 text-stone-600 ring-stone-600/10",
};

export const TEXTO_SLA: Record<string, string> = {
  a_tiempo: "A tiempo",
  en_riesgo: "En riesgo",
  atrasada: "Atrasada",
  completada: "Completada",
  verde: "A tiempo",
  amarillo: "En riesgo",
  rojo: "Atrasada",
};

export function SlaDot({ valor, className = "" }: { valor: string | null | undefined; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[tonoSla(valor)]} ${className}`} />;
}

export function SlaChip({ valor, etiqueta }: { valor: string | null | undefined; etiqueta?: string }) {
  const tono = tonoSla(valor);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${CHIP[tono]}`}>
      <SlaDot valor={valor} />
      {etiqueta ?? TEXTO_SLA[valor ?? ""] ?? "Sin SLA"}
    </span>
  );
}

/** Semáforo vertical estilo "stoplight" con la luz activa encendida. */
export function Stoplight({ valor }: { valor: string | null | undefined }) {
  const tono = tonoSla(valor);
  const luz = (t: Tono, on: string) => (
    <span className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${tono === t ? on : "bg-stone-200"}`} />
  );
  return (
    <span className="inline-flex flex-col gap-1 rounded-full bg-stone-900/[0.04] p-1 ring-1 ring-stone-900/[0.05]" title={TEXTO_SLA[valor ?? ""] ?? "Sin SLA"}>
      {luz("bad", "bg-rose-500 shadow-[0_0_10px_rgb(239_68_68/0.8)]")}
      {luz("warn", "bg-amber-400 shadow-[0_0_10px_rgb(245_158_11/0.8)]")}
      {luz("ok", "bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129/0.7)]")}
    </span>
  );
}
