import Image from 'next/image';
import { CheckCheck, GitCompare, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/proceso/login-form';
import { Marca } from '@/components/proceso/app-shell';

const PILARES = [
  { icono: GitCompare, titulo: 'Decide en minutos', texto: 'Comparativa lado a lado con no negociables y citas de origen.' },
  { icono: CheckCheck, titulo: 'Cero ghosting', texto: 'Cada candidato recibe respuesta: la IA redacta, tú apruebas.' },
  { icono: ShieldCheck, titulo: 'Humano decide', texto: 'Decisiones con justificación y trazabilidad total.' },
];

// Mesh gradient: blanco puro con manchas del rosa de marca (#E2007A) y dos tonos derivados, difuminadas.
const MESH = [
  "radial-gradient(40% 50% at 8% 6%, rgb(226 0 122 / 0.10), transparent 70%)",
  "radial-gradient(35% 45% at 92% 14%, rgb(255 153 204 / 0.18), transparent 70%)",
  "radial-gradient(45% 55% at 96% 96%, rgb(226 0 122 / 0.16), transparent 70%)",
  "radial-gradient(40% 50% at 30% 100%, rgb(255 204 229 / 0.35), transparent 70%)",
  "radial-gradient(30% 35% at 60% 45%, rgb(255 255 255 / 0.9), transparent 70%)",
].join(", ");

export default function LoginPage() {
  return (
    // h-dvh en escritorio (sin scroll: la columna se compacta en pantallas bajas); min-h-dvh en móvil por si el teclado empuja.
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-white lg:h-dvh">
      <div aria-hidden className="pointer-events-none absolute -inset-16 blur-2xl" style={{ backgroundImage: MESH }} />

      <div className="relative mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-16">
        <div className="grid w-full grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <section className="hidden space-y-5 lg:block [@media(max-height:760px)]:space-y-4">
            <Marca />
            <p className="animate-rise pt-2 text-[12px] font-semibold uppercase tracking-[.22em] text-liv [@media(max-height:700px)]:hidden">El Puerto de Liverpool · Atracción de talento</p>
            <h1 className="animate-rise text-[44px] leading-[1.04] font-semibold tracking-[-0.035em] [animation-delay:80ms] xl:text-[52px] [@media(max-height:760px)]:text-[40px]">
              <span className="text-gradient-liv">El copiloto</span>
              <br />
              de tu proceso de talento.
            </h1>
            <p className="animate-rise max-w-md text-[16px] leading-relaxed text-stone-500 [animation-delay:160ms]">
              De la requisición a la oferta, con SLA visibles, IA que cita su fuente y decisiones que siempre toma una persona.
            </p>
            <ul className="grid max-w-xl gap-3">
              {PILARES.map((p, i) => (
                <li
                  key={p.titulo}
                  className="animate-rise flex items-start gap-4 rounded-2xl border border-stone-900/[0.05] bg-white/90 p-3.5 shadow-[0_1px_2px_rgb(17_24_39/0.04),0_8px_24px_-12px_rgb(17_24_39/0.10)] backdrop-blur-sm"
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
            <p className="text-[12px] text-stone-400 [@media(max-height:700px)]:hidden">LiverHack 2026 · Uso interno</p>
          </section>

          <section className="flex items-center justify-center lg:justify-end">
            <div className="animate-drawer w-full max-w-[420px] rounded-[28px] border border-white/80 bg-white/75 p-8 shadow-[0_40px_120px_-40px_rgb(17_24_39/0.30),0_0_0_1px_rgb(17_24_39/0.04)] backdrop-blur-xl sm:p-10">
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
        </div>
      </div>
    </main>
  );
}
