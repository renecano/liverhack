/** Anillo de progreso (0-100) para compatibilidad / fit. */
export function Ring({
  valor,
  size = 52,
  stroke = 5,
  label,
  destacado = false,
}: {
  valor: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  destacado?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor ?? 0));
  const color = valor === null ? "#d6d3d1" : destacado ? "#e2007a" : v >= 85 ? "#0b0b0f" : v >= 70 ? "#57534e" : "#a8a29e";
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(17 24 39 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="tabular absolute text-[12.5px] font-semibold tracking-tight">{valor === null ? "—" : v}</span>
    </span>
  );
}
