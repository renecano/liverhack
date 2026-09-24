'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsRight, LoaderCircle } from 'lucide-react';
import { avanzarEtapa } from '@/lib/actions/proceso';

/** AT/HRBP avanzan el tramo operativo. El orquestador nunca cruza una compuerta del HM. */
export function AvanzarEtapa({ vacanteId }: { vacanteId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // Doble paso: el primer clic "arma" el botón y el segundo confirma (se desarma a los 3 s).
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 3000);
    return () => clearTimeout(t);
  }, [armado]);

  async function avanzar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!armado) { setArmado(true); setAviso(null); return; }
    setArmado(false);
    setEnviando(true); setAviso(null);
    const r = await avanzarEtapa(vacanteId);
    setEnviando(false);
    if (r.ok) { setAviso({ ok: true, texto: 'Etapa avanzada' }); router.refresh(); }
    else setAviso({ ok: false, texto: r.codigo === 'TRANSICION_INVALIDA' ? 'Requiere decisión del HM' : r.error });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={avanzar}
        disabled={enviando}
        className={`press focus-ring inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 ${armado ? 'btn-liv' : 'bg-stone-950 hover:bg-stone-800'}`}
      >
        {enviando ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ChevronsRight className="h-3.5 w-3.5" />}
        {armado ? '¿Confirmar?' : 'Avanzar'}
      </button>
      {aviso && <span role="status" className={`animate-rise text-[11.5px] font-medium ${aviso.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{aviso.texto}</span>}
    </div>
  );
}
