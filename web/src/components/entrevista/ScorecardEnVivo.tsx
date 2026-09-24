"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CloudUpload, LoaderCircle, Radio, ThumbsDown, ThumbsUp, TriangleAlert, Users, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { nombreCompetencia } from "./competencias";

export type FeedbackFila = {
  id?: string;
  entrevistador_id: string;
  scores: Record<string, number> | null;
  veredicto: "recomendado" | "no_recomendado" | null;
  notas: string | null;
  ts: string;
};

type Borrador = { scores: Record<string, number>; veredicto: FeedbackFila["veredicto"]; notas: string };
type Guardado = { estado: "idle" | "guardando" | "guardado" | "error"; ts?: number; error?: string };

const DESACUERDO = 25; // puntos de diferencia entre entrevistadores para marcar discrepancia

const nivel = (v: number) => (v >= 90 ? "Sobresaliente" : v >= 75 ? "Alto" : v >= 55 ? "Medio" : "Bajo");
const iniciales = (n: string) => n.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const promedio = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Scorecard en tiempo real (Supabase Realtime). Cada entrevistador escribe SU fila de
 * feedback_entrevista (RLS: entrevistador_id = auth.uid()); el guardado es automático.
 * Los cambios del resto del panel llegan por postgres_changes y la presencia muestra
 * quién está conectado. La vista consolidada es aritmética simple, no IA, y no decide.
 */
export function ScorecardEnVivo({
  entrevistaId,
  candidatoId,
  yo,
  puedeCalificar,
  nombres,
  participantes,
  competencias,
  feedbackInicial,
}: {
  entrevistaId: string;
  candidatoId: string;
  yo: { id: string; nombre: string };
  puedeCalificar: boolean;
  nombres: Record<string, string>;
  participantes: string[];
  competencias: string[];
  feedbackInicial: FeedbackFila[];
}) {
  const [panel, setPanel] = useState<Record<string, FeedbackFila>>(() => Object.fromEntries(feedbackInicial.map((f) => [f.entrevistador_id, f])));
  const mio = feedbackInicial.find((f) => f.entrevistador_id === yo.id);
  const [borrador, setBorrador] = useState<Borrador>({ scores: mio?.scores ?? {}, veredicto: mio?.veredicto ?? null, notas: mio?.notas ?? "" });
  const [guardado, setGuardado] = useState<Guardado>(mio ? { estado: "guardado", ts: new Date(mio.ts).getTime() } : { estado: "idle" });
  const [conectado, setConectado] = useState<"conectando" | "en_vivo" | "sin_conexion">("conectando");
  const [enLinea, setEnLinea] = useState<string[]>([]);
  const [pulso, setPulso] = useState<Record<string, number>>({});
  const sucio = useRef(false);
  const [sb] = useState(() => createClient());

  // Realtime: cambios de feedback del panel + presencia.
  useEffect(() => {
    const cliente = sb;
    const canal = cliente.channel(`entrevista:${entrevistaId}`, { config: { presence: { key: yo.id } } });
    canal
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback_entrevista", filter: `entrevista_id=eq.${entrevistaId}` },
        (payload) => {
          const fila = payload.new as FeedbackFila | undefined;
          if (!fila?.entrevistador_id || fila.entrevistador_id === yo.id) return; // mi eco no pisa lo que escribo
          setPanel((p) => ({ ...p, [fila.entrevistador_id]: fila }));
          setPulso((p) => ({ ...p, [fila.entrevistador_id]: Date.now() }));
        },
      )
      .on("presence", { event: "sync" }, () => setEnLinea(Object.keys(canal.presenceState())))
      .subscribe(async (estado) => {
        if (estado === "SUBSCRIBED") {
          setConectado("en_vivo");
          await canal.track({ nombre: yo.nombre, desde: Date.now() });
        } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
          setConectado("sin_conexion");
        }
      });
    return () => {
      void cliente.removeChannel(canal);
    };
  }, [sb, entrevistaId, yo.id, yo.nombre]);

  // Autoguardado con debounce: upsert de MI fila (una por entrevistador y entrevista).
  useEffect(() => {
    if (!sucio.current || !puedeCalificar) return;
    const t = setTimeout(async () => {
      setGuardado({ estado: "guardando" });
      const fila = {
        entrevista_id: entrevistaId,
        entrevistador_id: yo.id,
        candidato_id: candidatoId,
        scores: borrador.scores,
        veredicto: borrador.veredicto,
        notas: borrador.notas.trim() || null,
        ts: new Date().toISOString(),
      };
      const { error } = await sb.from("feedback_entrevista").upsert(fila, { onConflict: "entrevista_id,entrevistador_id" });
      if (error) setGuardado({ estado: "error", error: error.message });
      else {
        sucio.current = false;
        setGuardado({ estado: "guardado", ts: Date.now() });
        setPanel((p) => ({ ...p, [yo.id]: { ...fila, scores: fila.scores } }));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sb, borrador, entrevistaId, candidatoId, yo.id, puedeCalificar]);

  const editar = (cambio: Partial<Borrador>) => {
    sucio.current = true;
    setBorrador((b) => ({ ...b, ...cambio }));
  };

  // Vista consolidada: mi borrador + lo último del resto del panel.
  const todas: Record<string, FeedbackFila> = { ...panel };
  if (puedeCalificar) todas[yo.id] = { entrevistador_id: yo.id, scores: borrador.scores, veredicto: borrador.veredicto, notas: borrador.notas, ts: "" };
  const filas = Object.values(todas);
  const consolidado = competencias.map((c) => {
    const vals = filas.map((f) => f.scores?.[c]).filter((v): v is number => typeof v === "number");
    const rango = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
    return { c, prom: promedio(vals), n: vals.length, rango, desacuerdo: rango >= DESACUERDO };
  });
  const recomiendan = filas.filter((f) => f.veredicto === "recomendado").length;
  const noRecomiendan = filas.filter((f) => f.veredicto === "no_recomendado").length;
  const miPromedio = promedio(Object.values(borrador.scores));

  return (
    <div className="space-y-5">
      {/* Estado en vivo */}
      <div className="animate-rise glass surface flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          {conectado === "en_vivo" ? (
            <>
              <span className="pulse-liv h-2.5 w-2.5 rounded-full bg-liv" /> En vivo con tu panel
            </>
          ) : conectado === "conectando" ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin text-stone-400" /> Conectando…
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-amber-600" /> Sin tiempo real (se sigue guardando)
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {participantes.map((id) => {
            const nombre = id === yo.id ? yo.nombre : (nombres[id] ?? "Entrevistador");
            const online = enLinea.includes(id);
            return (
              <span key={id} title={`${nombre}${online ? " · en línea" : ""}`} className="relative">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold ring-2 ring-white transition-all duration-500 ${online ? "bg-stone-950 text-white" : "bg-stone-200 text-stone-500"}`}>
                  {iniciales(nombre)}
                </span>
                {online && <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
              </span>
            );
          })}
        </div>
      </div>

      {/* Mi scorecard */}
      <section className="animate-rise surface rounded-3xl p-6 [animation-delay:60ms]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-liv">Mi scorecard</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">Califica por competencia</h2>
          </div>
          <EstadoGuardado g={guardado} activo={puedeCalificar} />
        </div>

        {!puedeCalificar && (
          <p className="mt-4 rounded-xl bg-stone-900/[0.03] p-3 text-[13px] text-stone-600">No participas en esta entrevista: ves el panel en modo lectura.</p>
        )}

        <div className="mt-6 space-y-5">
          {competencias.map((c) => {
            const v = borrador.scores[c];
            const tiene = typeof v === "number";
            const val = tiene ? v : 50;
            return (
              <div key={c}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={`c-${c}`} className="text-[14px] font-semibold text-stone-800">{nombreCompetencia(c)}</label>
                  <span className={`tabular text-[13px] font-semibold transition-colors ${tiene ? "text-stone-900" : "text-stone-300"}`}>
                    {tiene ? (
                      <>
                        {v}
                        <span className="ml-1.5 text-[11.5px] font-medium text-stone-400">{nivel(v)}</span>
                      </>
                    ) : (
                      "Sin calificar"
                    )}
                  </span>
                </div>
                <input
                  id={`c-${c}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={val}
                  disabled={!puedeCalificar}
                  onChange={(e) => editar({ scores: { ...borrador.scores, [c]: Number(e.target.value) } })}
                  className="slider mt-2 w-full"
                  style={{ ["--pct" as string]: `${val}%`, ["--fill" as string]: tiene ? "#e2007a" : "#d6d3d1" }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-7">
          <p className="text-[14px] font-semibold text-stone-800">Veredicto</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!puedeCalificar}
              onClick={() => editar({ veredicto: borrador.veredicto === "recomendado" ? null : "recomendado" })}
              aria-pressed={borrador.veredicto === "recomendado"}
              className={`press flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[14px] font-semibold ring-1 transition-all duration-300 ${
                borrador.veredicto === "recomendado" ? "bg-emerald-500 text-white shadow-[0_12px_30px_-12px_rgb(16_185_129/0.7)] ring-emerald-500" : "bg-white text-stone-700 ring-stone-900/10 hover:ring-emerald-500/50"
              }`}
            >
              <ThumbsUp className="h-4 w-4" /> Recomendado
            </button>
            <button
              type="button"
              disabled={!puedeCalificar}
              onClick={() => editar({ veredicto: borrador.veredicto === "no_recomendado" ? null : "no_recomendado" })}
              aria-pressed={borrador.veredicto === "no_recomendado"}
              className={`press flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[14px] font-semibold ring-1 transition-all duration-300 ${
                borrador.veredicto === "no_recomendado" ? "bg-rose-500 text-white shadow-[0_12px_30px_-12px_rgb(239_68_68/0.7)] ring-rose-500" : "bg-white text-stone-700 ring-stone-900/10 hover:ring-rose-500/50"
              }`}
            >
              <ThumbsDown className="h-4 w-4" /> No recomendado
            </button>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="text-[14px] font-semibold text-stone-800">Notas</span>
          <textarea
            value={borrador.notas}
            disabled={!puedeCalificar}
            onChange={(e) => editar({ notas: e.target.value })}
            placeholder="Evidencia concreta: qué dijo, qué ejemplo dio, qué te hizo dudar…"
            className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-stone-900/10 bg-stone-50/60 p-3.5 text-[14px] leading-relaxed outline-none transition-shadow focus:border-liv/50 focus:bg-white focus:ring-4 focus:ring-liv/10"
          />
        </label>
        {miPromedio !== null && <p className="mt-2 text-right text-[12px] text-stone-500">Tu promedio: <span className="tabular font-semibold text-stone-800">{miPromedio}</span></p>}
      </section>

      {/* Panel consolidado en vivo */}
      <section className="animate-rise surface rounded-3xl p-6 [animation-delay:120ms]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.16em] text-stone-400">
              <Users className="h-3.5 w-3.5" /> Panel en vivo
            </p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">Así va la sesión</h2>
          </div>
          <div className="flex gap-2 text-[12.5px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-600/15"><ThumbsUp className="h-3.5 w-3.5" />{recomiendan}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-600/15"><ThumbsDown className="h-3.5 w-3.5" />{noRecomiendan}</span>
          </div>
        </div>

        <ul className="mt-5 space-y-3">
          {consolidado.map(({ c, prom, n, rango, desacuerdo }) => (
            <li key={c}>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="font-medium text-stone-700">{nombreCompetencia(c)}</span>
                <span className="flex items-center gap-2">
                  {desacuerdo && (
                    <span className="animate-pop inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-600/20">
                      <TriangleAlert className="h-3 w-3" /> Desacuerdo · {rango} pts
                    </span>
                  )}
                  <span className="tabular font-semibold">{prom ?? "—"}</span>
                  <span className="text-[11px] text-stone-400">({n})</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-stone-100">
                <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-stone-800 to-liv transition-[width] duration-700 ease-glide" style={{ width: `${prom ?? 0}%` }} />
                {filas.map((f) =>
                  typeof f.scores?.[c] === "number" ? (
                    <span
                      key={f.entrevistador_id}
                      title={`${f.entrevistador_id === yo.id ? "Tú" : (nombres[f.entrevistador_id] ?? "Entrevistador")}: ${f.scores[c]}`}
                      className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-700 ease-spring ${f.entrevistador_id === yo.id ? "bg-liv" : "bg-stone-950"}`}
                      style={{ left: `${f.scores[c]}%` }}
                    />
                  ) : null,
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-2.5">
          {participantes
            .filter((id) => id !== yo.id)
            .map((id) => {
              const f = panel[id];
              const nombre = nombres[id] ?? "Entrevistador";
              const vivo = pulso[id];
              return (
                <div key={`${id}-${vivo ?? 0}`} className={`flex items-start gap-3 rounded-2xl p-3 ring-1 ring-stone-900/5 ${vivo ? "animate-rise bg-liv-50/50" : "bg-stone-50/60"}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-950 text-[11px] font-bold text-white">{iniciales(nombre)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                      {nombre}
                      {f?.veredicto && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${f.veredicto === "recomendado" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {f.veredicto === "recomendado" ? "Recomendado" : "No recomendado"}
                        </span>
                      )}
                      {vivo && <Radio className="h-3.5 w-3.5 text-liv" />}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-stone-500">{f ? f.notas || "Sin notas aún." : "Aún no ha calificado."}</p>
                  </div>
                </div>
              );
            })}
        </div>
        <p className="mt-4 text-[11.5px] text-stone-400">Promedios y desacuerdos calculados en vivo. El HM decide; esta vista no.</p>
      </section>
    </div>
  );
}

function EstadoGuardado({ g, activo }: { g: Guardado; activo: boolean }) {
  if (!activo) return null;
  if (g.estado === "guardando")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-900/[0.04] px-3 py-1 text-[12px] font-medium text-stone-600">
        <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> Guardando…
      </span>
    );
  if (g.estado === "guardado")
    return (
      <span className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
        <CircleCheck className="h-3.5 w-3.5" /> Guardado en vivo
      </span>
    );
  if (g.estado === "error")
    return (
      <span title={g.error} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[12px] font-semibold text-rose-700 ring-1 ring-rose-600/15">
        <TriangleAlert className="h-3.5 w-3.5" /> No se guardó
      </span>
    );
  return <span className="text-[12px] text-stone-400">Se guarda automáticamente</span>;
}
