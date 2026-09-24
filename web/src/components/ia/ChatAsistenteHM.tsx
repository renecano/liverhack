"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { preguntarAsistenteHM } from "@/lib/actions/asistente";

type Mensaje =
  | { de: "hm"; texto: string }
  | { de: "ia"; texto: string; enlaces: { titulo: string; href: string }[]; respaldo: boolean }
  | { de: "error"; texto: string };

const SUGERIDA = "¿Qué tengo que hacer hoy?";

/** Chat del asistente del HM (agente 8). Solo lee y guía; no ejecuta acciones. */
export function ChatAsistenteHM() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);

  async function preguntar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || pensando) return;
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
      setPensando(false);
    }
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void preguntar(texto);
  };

  return (
    <div className="mt-4 space-y-3">
      {mensajes.length === 0 && (
        <button
          type="button"
          onClick={() => preguntar(SUGERIDA)}
          disabled={pensando}
          className="rounded-full border border-[#c8105a]/40 bg-pink-50 px-3 py-1.5 text-sm font-medium text-[#c8105a] hover:bg-pink-100 disabled:opacity-50"
        >
          {SUGERIDA}
        </button>
      )}
      {mensajes.length > 0 && (
        <ul className="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
          {mensajes.map((m, i) => (
            <li key={i} className={m.de === "hm" ? "flex justify-end" : "flex"}>
              {m.de === "hm" && <p className="max-w-[80%] rounded-lg bg-[#c8105a] px-3 py-2 text-sm text-white">{m.texto}</p>}
              {m.de === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{m.texto}</p>}
              {m.de === "ia" && (
                <div className="max-w-[90%] rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-slate-700">
                  <p className="whitespace-pre-line">{m.texto}</p>
                  {m.enlaces.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.enlaces.map((e) => (
                        <Link key={e.href + e.titulo} href={e.href} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-[#c8105a] hover:border-[#c8105a]">
                          {e.titulo} →
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.respaldo && <p className="mt-2 text-xs text-slate-400">Resumen sin IA (el asistente no respondió a tiempo).</p>}
                </div>
              )}
            </li>
          ))}
          {pensando && <li className="text-sm text-slate-400">Revisando tus pendientes…</li>}
        </ul>
      )}
      <form onSubmit={enviar} className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          placeholder="Escribe una pregunta…"
          aria-label="Pregunta para el asistente"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#c8105a]"
        />
        <button disabled={pensando || !texto.trim()} className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Preguntar
        </button>
      </form>
      <p className="text-xs text-slate-400">Solo lee y ordena tus pendientes; las decisiones las tomas tú.</p>
    </div>
  );
}
