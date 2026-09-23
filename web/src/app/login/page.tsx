import { LoginForm } from '@/components/proceso/login-form';

export default function LoginPage() {
  return <main className="flex min-h-screen items-center justify-center bg-stone-100 p-5"><section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-sm"><p className="mb-2 text-sm font-semibold uppercase tracking-[.18em] text-[#c8105a]">El Puerto de Liverpool</p><h1 className="text-3xl font-bold tracking-tight">LivHire</h1><p className="mt-2 text-sm text-slate-600">Acceso interno al proceso de atracción de talento.</p><LoginForm /></section></main>;
}
