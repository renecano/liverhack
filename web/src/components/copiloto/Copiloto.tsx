"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  FileUp,
  GitCompare,
  Inbox,
  Kanban,
  LockKeyhole,
  MailCheck,
  Scale,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import type { RolUsuario } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { ChatAsistenteHM } from "@/components/ia/ChatAsistenteHM";
import { GlideSelect } from "@/components/ui/GlideSelect";
import { EstatusCandidato } from "./EstatusCandidato";

/** Evento global para abrir el copiloto desde cualquier pantalla (con pregunta opcional). */
export const EVENTO_COPILOTO = "livhire:copiloto";
export function abrirCopiloto(pregunta?: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_COPILOTO, { detail: { pregunta } }));
}

type Accion = { titulo: string; detalle: string; href: string; icono: LucideIcon; conteo?: "borradores" };

const ACCIONES: Record<RolUsuario, Accion[]> = {
  hm: [
    { titulo: "Decisiones pendientes", detalle: "Compuertas que esperan tu firma", href: "/hm", icono: Scale },
    { titulo: "Comparar candidatos", detalle: "Matriz de no negociables lado a lado", href: "/hm/candidatos", icono: GitCompare },
  ],
  at: [
    { titulo: "Aprobar comunicaciones", detalle: "Cero ghosting · aprobación por lote", href: "/at/comunicaciones", icono: MailCheck, conteo: "borradores" },
    { titulo: "Redactar con IA", detalle: "Personaliza borradores de avance o cierre", href: "/at/comunicaciones", icono: WandSparkles },
    { titulo: "Cargar CV mágico", detalle: "PDF → ficha con citas en segundos", href: "/at/carga", icono: FileUp },
    { titulo: "Pipeline por etapa", detalle: "Mueve vacantes y vigila SLA", href: "/at", icono: Kanban },
  ],
  hrbp: [
    { titulo: "Nueva requisición", detalle: "Con candado de posición", href: "/hrbp#requisicion", icono: LockKeyhole },
    { titulo: "Salud SLA por área", detalle: "Quién bloquea, en tiempo real", href: "/hrbp#sla", icono: CalendarClock },
    { titulo: "Reporte de equidad", detalle: "Tasas de avance por grupo", href: "/hrbp/equidad", icono: Scale },
  ],
  admin: [
    { titulo: "Salud SLA por área", detalle: "Quién bloquea, en tiempo real", href: "/hrbp#sla", icono: CalendarClock },
    { titulo: "Reporte de equidad", detalle: "Tasas de avance por grupo", href: "/hrbp/equidad", icono: Scale },
  ],
  entrevistador: [{ titulo: "Mis entrevistas", detalle: "Scorecard en vivo con tu panel", href: "/entrevistador", icono: Inbox }],
};

type Pestana = "chat" | "acciones" | "estatus";

/**
 * Copiloto flotante con la mascota de LivHire. Abre un panel con:
 * - Chat del asistente (solo HM: el agente 8 responde con sus pendientes reales).
 * - Acciones rápidas por rol (atajos a las pantallas donde un humano aprueba).
 * - Estatus de candidatos (lectura con la sesión: RLS decide qué se ve).
 * Nunca decide ni envía nada por sí mismo.
 */
export function Copiloto({ rol, nombre }: { rol: RolUsuario; nombre: string }) {
  const esHM = rol === "hm" || rol === "admin";
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>(esHM ? "chat" : "acciones");
  const [semilla, setSemilla] = useState<{ texto: string; n: number } | null>(null);
  const [saludo, setSaludo] = useState(false);
  const [borradores, setBorradores] = useState<number | null>(null);

  // Tras la primera apertura el panel queda montado (oculto al cerrar) para no perder la conversación.
  const [montado, setMontado] = useState(false);
  const abrir = useCallback(() => {
    setMontado(true);
    setAbierto(true);
  }, []);
  const alternar = useCallback(() => {
    setMontado(true);
    setAbierto((a) => !a);
  }, []);

  // Saludo breve de la mascota al entrar (una vez por sesión de pestaña).
  useEffect(() => {
    let ya = false;
    try {
      ya = sessionStorage.getItem("livhire:saludo") === "1";
      sessionStorage.setItem("livhire:saludo", "1");
    } catch {}
    if (ya) return;
    const t1 = setTimeout(() => setSaludo(true), 1200);
    const t2 = setTimeout(() => setSaludo(false), 6500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Borradores pendientes (cero ghosting): badge sobre la mascota.
  useEffect(() => {
    if (rol === "entrevistador") return;
    let vivo = true;
    createClient()
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("estatus", "borrador")
      .then(({ count }) => {
        if (vivo) setBorradores(count ?? 0);
      });
    return () => {
      vivo = false;
    };
  }, [rol]);

  // Abrir desde otras pantallas (CustomEvent) y atajo ⌘K / Ctrl+K; Esc cierra.
  useEffect(() => {
    const alEvento = (e: Event) => {
      const pregunta = (e as CustomEvent<{ pregunta?: string }>).detail?.pregunta;
      abrir();
      if (pregunta && esHM) {
        setPestana("chat");
        setSemilla((s) => ({ texto: pregunta, n: (s?.n ?? 0) + 1 }));
      }
    };
    const alTeclado = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        alternar();
      }
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener(EVENTO_COPILOTO, alEvento);
    window.addEventListener("keydown", alTeclado);
    return () => {
      window.removeEventListener(EVENTO_COPILOTO, alEvento);
      window.removeEventListener("keydown", alTeclado);
    };
  }, [abrir, alternar, esHM]);

  const pestanas = [
    ...(esHM ? [{ value: "chat" as const, label: "Asistente" }] : []),
    { value: "acciones" as const, label: "Acciones" },
    { value: "estatus" as const, label: "Estatus" },
  ];
  const primerNombre = nombre.split(/\s+/)[0] ?? nombre;

  return (
    <>
      {abierto && <div className="animate-fade fixed inset-0 z-40 bg-stone-950/10 backdrop-blur-[2px] sm:hidden" onClick={() => setAbierto(false)} />}

      {montado && (
        <section
          role="dialog"
          aria-label="Copiloto LivHire"
          hidden={!abierto}
          className="animate-drawer glass fixed inset-x-2 bottom-2 z-50 flex h-[min(640px,calc(100dvh-1rem))] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-white/60 shadow-[0_40px_100px_-30px_rgb(17_24_39/0.45),0_0_0_1px_rgb(17_24_39/0.06)] sm:inset-x-auto sm:right-6 sm:bottom-28 sm:w-[410px]"
        >
          <header className="relative overflow-hidden border-b hairline px-4 pt-4 pb-3">
            <div aria-hidden className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-liv/15 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-liv-50 to-white ring-1 ring-liv/20">
                  <Image src="/Mascota.gif" alt="" width={44} height={44} unoptimized className="scale-[2.3] object-contain" />
                </span>
                <div className="leading-tight">
                  <p className="text-[15px] font-semibold tracking-tight">Copiloto LivHire</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.2)]" />
                    Hola, {primerNombre} · <kbd className="font-mono text-[10.5px] text-stone-400">⌘K</kbd>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar copiloto"
                className="press focus-ring grid h-8 w-8 place-items-center rounded-full text-stone-500 hover:bg-stone-900/5 hover:text-stone-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mt-3">
              <GlideSelect size="sm" value={pestana} onChange={setPestana} options={pestanas} ariaLabel="Secciones del copiloto" />
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-white/40">
            {pestana === "chat" && esHM && <ChatAsistenteHM semilla={semilla} />}
            {pestana === "acciones" && (
              <div className="h-full space-y-2 overflow-y-auto p-4">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">Atajos</p>
                {ACCIONES[rol].map((a, i) => (
                  <Link
                    key={a.titulo}
                    href={a.href}
                    onClick={() => setAbierto(false)}
                    className="press group animate-rise flex items-center gap-3 rounded-2xl border border-stone-900/[0.06] bg-white p-3 shadow-sm hover:border-liv/30 hover:shadow-md"
                    style={{ animationDelay: `${i * 55}ms` }}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-liv-50 text-liv ring-1 ring-liv/15 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6">
                      <a.icono className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] font-semibold text-stone-900">
                        {a.titulo}
                        {a.conteo === "borradores" && borradores !== null && borradores > 0 && (
                          <span className="tabular rounded-full bg-liv px-1.5 py-px text-[11px] font-bold text-white">{borradores}</span>
                        )}
                      </span>
                      <span className="block truncate text-[12.5px] text-stone-500">{a.detalle}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-stone-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-liv" />
                  </Link>
                ))}
                <p className="flex items-start gap-2 px-1 pt-3 text-[11.5px] leading-snug text-stone-400">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-liv/60" />
                  La IA redacta y sugiere; un humano aprueba cada envío y cada decisión queda en el audit log.
                </p>
              </div>
            )}
            {pestana === "estatus" && <EstatusCandidato />}
          </div>
        </section>
      )}

      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
        {saludo && !abierto && (
          <button
            onClick={() => {
              setSaludo(false);
              abrir();
            }}
            className="animate-drawer glass relative max-w-[240px] rounded-2xl rounded-br-md border border-white/70 px-4 py-2.5 text-left text-[13px] text-stone-700 shadow-xl"
          >
            ¡Hola, {primerNombre}! {esHM ? "¿Vemos qué decidir hoy?" : "¿Te ayudo con algo?"}
          </button>
        )}
        <button
          onClick={alternar}
          aria-label={abierto ? "Cerrar copiloto" : "Abrir copiloto"}
          aria-expanded={abierto}
          className={`press focus-ring group relative grid h-16 w-16 place-items-center rounded-full bg-white shadow-[0_18px_40px_-12px_rgb(226_0_122/0.55),0_0_0_1px_rgb(226_0_122/0.15)] transition-transform duration-500 ease-spring hover:scale-110 ${abierto ? "scale-95" : "animate-float"}`}
        >
          <span aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-br from-liv-50 via-white to-liv-100" />
          <span aria-hidden className={`absolute -inset-1 rounded-full border-2 border-liv/30 transition-opacity ${abierto ? "opacity-0" : "pulse-liv opacity-100"}`} />
          <span className="relative h-full w-full overflow-hidden rounded-full">
            <Image src="/Mascota.gif" alt="Mascota LivHire" width={64} height={64} unoptimized priority className="h-full w-full scale-[2.4] object-contain transition-transform duration-500 ease-spring group-hover:scale-[2.65]" />
          </span>
          {borradores !== null && borradores > 0 && !abierto && (
            <span className="tabular animate-pop absolute -top-1 -right-1 grid h-6 min-w-6 place-items-center rounded-full bg-liv px-1.5 text-[11px] font-bold text-white ring-2 ring-white">
              {borradores > 99 ? "99+" : borradores}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
