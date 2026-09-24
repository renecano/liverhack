"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import { preguntarAsistenteHM } from "@/lib/actions/asistente";

type Mensaje =
  | { de: "hm"; texto: string }
  | { de: "ia"; texto: string; enlaces: { titulo: string; href: string }[]; respaldo: boolean }
  | { de: "error"; texto: string };

const SUGERIDAS = ["¿Qué tengo que hacer hoy?", "¿Qué vacante va más atrasada?", "¿A quién estoy bloqueando?"];

/**
 * Chat del asistente del HM (agente 8). Solo lee y guía; no ejecuta acciones.
 * `semilla` permite que otra pantalla dispare una pregunta (cambia `n` para repetirla).
 */
export function ChatAsistenteHM({ semilla }: { semilla?: { texto: string; n: number } | null }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const ocupado = useRef(false);

  async function preguntar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || ocupado.current) return;
    ocupado.current = true;
    setMensajes((m) => [...m, { de: "hm", texto: q }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await preguntarAsistenteHM(q);
      setMensajes((m) => [
        ...m,
        r.ok ? { de: "ia", texto: r.respuesta, enlaces: r.enlaces, respaldo: r.generado_por === "respaldo" } : { de: "error", texto: r.error },
      ]);
    } catch {
      setMensajes((m) => [...m, { de: "error", texto: "No se pudo contactar al asistente." }]);
    } finally {
      ocupado.current = false;
      setPensando(false);
    }
  }

  // Pregunta disparada desde fuera (p. ej. un botón del tablero). El ref se marca
  // dentro del timeout para que el doble efecto de StrictMode no la pierda.
  const ultimaSemilla = useRef<number | null>(null);
  const alSemilla = useEffectEvent((s: { texto: string; n: number }) => {
    if (ultimaSemilla.current === s.n) return;
    ultimaSemilla.current = s.n;
    void preguntar(s.texto);
  });
  useEffect(() => {
    if (!semilla) return;
    const t = setTimeout(() => alSemilla(semilla), 0);
    return () => clearTimeout(t);
  }, [semilla]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length, pensando]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void preguntar(texto);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {mensajes.length === 0 && (
          <div className="animate-rise space-y-3">
            <div className="rounded-2xl rounded-tl-md bg-stone-900/[0.04] px-4 py-3 text-[13.5px] leading-relaxed text-stone-700">
              Hola. Reviso tus vacantes, compuertas y SLA reales y te digo <strong>qué hacer primero</strong>. Solo leo y
              ordeno: las decisiones siempre son tuyas.
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGERIDAS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => preguntar(s)}
                  disabled={pensando}
                  className="press focus-ring animate-rise rounded-full border border-liv/25 bg-liv-50 px-3 py-1.5 text-[12.5px] font-medium text-liv-deep hover:border-liv/50 hover:bg-liv-100 disabled:opacity-50"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`animate-rise flex ${m.de === "hm" ? "justify-end" : "justify-start"}`}>
            {m.de === "hm" && (
              <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-stone-950 px-3.5 py-2 text-[13.5px] text-white">{m.texto}</p>
            )}
            {m.de === "error" && <p className="max-w-[90%] rounded-2xl bg-rose-50 px-3.5 py-2 text-[13px] text-rose-700">{m.texto}</p>}
            {m.de === "ia" && (
              <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-stone-900/[0.06] bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-stone-700 shadow-sm">
                <p className="whitespace-pre-line">{m.texto}</p>
                {m.enlaces.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.enlaces.map((e) => (
                      <Link
                        key={e.href + e.titulo}
                        href={e.href}
                        className="press inline-flex items-center gap-1 rounded-full bg-liv-50 px-2.5 py-1 text-[12px] font-semibold text-liv-deep ring-1 ring-liv/20 hover:bg-liv-100"
                      >
                        {e.titulo}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ))}
                  </div>
                )}
                {m.respaldo && <p className="mt-2 text-[11px] text-stone-400">Resumen sin IA (el asistente no respondió a tiempo).</p>}
              </div>
            )}
          </div>
        ))}
        {pensando && (
          <div className="flex items-center gap-1.5 px-1 text-[12px] text-stone-400">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-liv [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-liv [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-liv" />
            <span className="ml-1">Revisando tus pendientes…</span>
          </div>
        )}
        <div ref={fin} />
      </div>
      <form onSubmit={enviar} className="border-t hairline bg-white/70 p-3">
        <div className="flex items-center gap-2 rounded-full border border-stone-900/10 bg-white py-1 pl-4 pr-1 shadow-sm focus-within:border-liv/50 focus-within:ring-4 focus-within:ring-liv/10">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Pregunta sobre tus vacantes…"
            aria-label="Pregunta para el asistente"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-stone-400"
          />
          <button
            disabled={pensando || !texto.trim()}
            aria-label="Enviar"
            className="press btn-liv grid h-8 w-8 place-items-center rounded-full disabled:opacity-35"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
