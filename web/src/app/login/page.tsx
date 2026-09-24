import Image from 'next/image';
import { CheckCheck, GitCompare, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/proceso/login-form';
import { Marca } from '@/components/proceso/app-shell';

const PILARES = [
  { icono: GitCompare, titulo: 'Decide en minutos', texto: 'Comparativa lado a lado con no negociables y citas de origen.' },
  { icono: CheckCheck, titulo: 'Cero ghosting', texto: 'Cada candidato recibe respuesta: la IA redacta, tú apruebas.' },
  { icono: ShieldCheck, titulo: 'Humano decide', texto: 'Decisiones con justificación y trazabilidad total.' },
];

export default function LoginPage() {
  return (
    <main className="ambient relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div aria-hidden className="grid-fade pointer-events-none absolute inset-0" />
      <section className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Marca />
        <div className="max-w-xl">
          <p className="animate-rise text-[12px] font-semibold uppercase tracking-[.22em] text-liv">El Puerto de Liverpool · Atracción de talento</p>
          <h1 className="animate-rise mt-4 text-[56px] leading-[1.02] font-semibold tracking-[-0.035em] [animation-delay:80ms]">
            <span className="text-gradient-liv">El copiloto</span>
            <br />
            de tu proceso de talento.
          </h1>
          <p className="animate-rise mt-5 max-w-md text-[16px] leading-relaxed text-stone-500 [animation-delay:160ms]">
            De la requisición a la oferta, con SLA visibles, IA que cita su fuente y decisiones que siempre toma una persona.
          </p>
          <ul className="mt-10 grid gap-3">
            {PILARES.map((p, i) => (
              <li
                key={p.titulo}
                className="animate-rise glass surface flex items-start gap-4 rounded-2xl p-4"
                style={{ animationDelay: `${260 + i * 90}ms` }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-liv-50 text-liv ring-1 ring-liv/15">
                  <p.icono className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold">{p.titulo}</span>
                  <span className="block text-[13px] text-stone-500">{p.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-stone-400">LiverHack 2026 · Uso interno</p>
      </section>

      <section className="relative flex items-center justify-center p-5 sm:p-10">
        <div className="animate-drawer glass w-full max-w-[420px] rounded-[28px] border border-white/70 p-8 shadow-[0_40px_120px_-40px_rgb(17_24_39/0.35),0_0_0_1px_rgb(17_24_39/0.05)] sm:p-10">
          <div className="flex items-center justify-between">
            <div className="lg:hidden">
              <Marca />
            </div>
            <span className="relative ml-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-liv-50 to-white ring-1 ring-liv/15">
              <Image src="/Mascota.gif" alt="" width={64} height={64} unoptimized priority className="scale-[2.3] object-contain" />
            </span>
          </div>
          <h2 className="mt-6 text-[28px] font-semibold tracking-[-0.02em]">Bienvenido de vuelta</h2>
          <p className="mt-1.5 text-[14px] text-stone-500">Accede con tu cuenta corporativa.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
