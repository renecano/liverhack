export function Semaforo({ color, etiqueta }: { color: string; etiqueta?: string }) {
  const clase = color === 'verde' ? 'bg-emerald-500' : color === 'amarillo' ? 'bg-amber-400' : color === 'rojo' ? 'bg-rose-500' : 'bg-slate-300';
  return <span className="inline-flex items-center gap-2 text-sm font-medium capitalize"><i className={`h-2.5 w-2.5 rounded-full ${clase}`} />{etiqueta ?? color}</span>;
}
