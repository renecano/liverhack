import { Gavel, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Historial del candidato (solo lectura): decisiones del HM (con justificación) y veredictos
// de sus entrevistas, en orden cronológico. Lee con el cliente de SESIÓN: RLS decide qué
// vacantes/entrevistas ve cada rol. Sin tablas nuevas: solo lo ya registrado.

type Uno<T> = T | T[] | null;
const uno = <T,>(x: Uno<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

const DECISION: Record<string, { texto: string; tono: string }> = {
  finalista: { texto: "Finalista", tono: "bg-emerald-50 text-emerald-800 ring-emerald-600/15" },
  avanzar_oferta: { texto: "Avanza a oferta", tono: "bg-emerald-50 text-emerald-800 ring-emerald-600/15" },
  descartado: { texto: "Descartado", tono: "bg-rose-50 text-rose-800 ring-rose-600/15" },
  pool: { texto: "Queda en pool", tono: "bg-stone-100 text-stone-700 ring-stone-600/10" },
  reemparejar: { texto: "Re-emparejar", tono: "bg-sky-50 text-sky-800 ring-sky-600/15" },
};
const VEREDICTO: Record<string, { texto: string; tono: string }> = {
  recomendado: { texto: "Recomendado", tono: "bg-emerald-50 text-emerald-800 ring-emerald-600/15" },
  no_recomendado: { texto: "No recomendado", tono: "bg-rose-50 text-rose-800 ring-rose-600/15" },
};

type Evento =
  | { tipo: "decision"; id: string; ts: string; vacante: string; decision: string; justificacion: string; quien: string | null }
  | {
      tipo: "entrevista";
      id: string;
      ts: string;
      vacante: string;
      entrevista: string | null;
      veredicto: string | null;
      notas: string | null;
      quien: string | null;
      scores: Record<string, number>;
    };

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const bonito = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

export async function HistorialCandidato({ candidatoId, vacanteActual }: { candidatoId: string; vacanteActual: string }) {
  const db = await createClient();
  const [decRes, fbRes] = await Promise.all([
    db
      .from("decisiones")
      .select("id, decision, justificacion, ts, vacantes(titulo), usuarios(nombre)")
      .eq("candidato_id", candidatoId)
      .order("ts", { ascending: true }),
    db
      .from("feedback_entrevista")
      .select("id, veredicto, notas, scores, ts, usuarios(nombre), entrevistas(tipo, fecha, vacantes(titulo))")
      .eq("candidato_id", candidatoId)
      .order("ts", { ascending: true }),
  ]);

  type FilaDec = { id: string; decision: string; justificacion: string; ts: string; vacantes: Uno<{ titulo: string }>; usuarios: Uno<{ nombre: string }> };
  type FilaFb = {
    id: string;
    veredicto: string | null;
    notas: string | null;
    scores: Record<string, number> | null;
    ts: string;
    usuarios: Uno<{ nombre: string }>;
    entrevistas: Uno<{ tipo: string; fecha: string; vacantes: Uno<{ titulo: string }> }>;
  };
  const eventos: Evento[] = [
    ...((decRes.data ?? []) as FilaDec[]).map((d) => ({
      tipo: "decision" as const,
      id: d.id,
      ts: d.ts,
      vacante: uno(d.vacantes)?.titulo ?? "—",
      decision: d.decision,
      justificacion: d.justificacion,
      quien: uno(d.usuarios)?.nombre ?? null,
    })),
    ...((fbRes.data ?? []) as FilaFb[]).map((f) => {
      const e = uno(f.entrevistas);
      return {
        tipo: "entrevista" as const,
        id: f.id,
        ts: f.ts,
        vacante: uno(e?.vacantes ?? null)?.titulo ?? "—",
        entrevista: e?.tipo ?? null,
        veredicto: f.veredicto,
        notas: f.notas,
        quien: uno(f.usuarios)?.nombre ?? null,
        scores: f.scores ?? {},
      };
    }),
  ].sort((a, b) => a.ts.localeCompare(b.ts));

  const error = decRes.error || fbRes.error;

  return (
    <section className="surface rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">Historial</h2>
        <p className="text-[12px] text-stone-400">Decisiones y entrevistas registradas · orden cronológico · solo lectura</p>
      </div>
      {error ? (
        <p className="text-[13px] text-rose-700">No se pudo leer el historial en este momento.</p>
      ) : !eventos.length ? (
        <p className="text-[13px] text-stone-500">Aún no hay decisiones ni entrevistas calificadas para este candidato.</p>
      ) : (
        <ol className="relative space-y-5 border-l border-stone-200 pl-6">
          {eventos.map((ev) => {
            const esDecision = ev.tipo === "decision";
            const etiqueta = esDecision ? DECISION[ev.decision] : ev.veredicto ? VEREDICTO[ev.veredicto] : null;
            return (
              <li key={`${ev.tipo}-${ev.id}`} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-[37px] top-0 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white ${esDecision ? "bg-stone-900 text-white" : "bg-liv-50 text-liv ring-liv/10"}`}
                >
                  {esDecision ? <Gavel className="h-3 w-3" /> : <MessageSquareText className="h-3 w-3" />}
                </span>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone-500">
                  <time dateTime={ev.ts} className="tabular font-medium text-stone-700">
                    {fecha(ev.ts)}
                  </time>
                  <span>·</span>
                  <span>{esDecision ? "Decisión del HM" : `Entrevista${ev.entrevista ? ` de ${ev.entrevista}` : ""}`}</span>
                  {ev.vacante !== vacanteActual && <span className="rounded-full bg-stone-900/[0.04] px-2 py-0.5 text-[11px]">{ev.vacante}</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${etiqueta?.tono ?? "bg-stone-100 text-stone-700 ring-stone-600/10"}`}>
                    {etiqueta?.texto ?? (esDecision ? bonito(ev.decision) : "Sin veredicto")}
                  </span>
                  <span className="text-[12.5px] text-stone-600">
                    por <strong className="font-semibold text-stone-800">{ev.quien ?? "—"}</strong>
                  </span>
                </div>
                {esDecision ? (
                  <p className="mt-2 rounded-2xl bg-stone-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-stone-700 ring-1 ring-stone-900/5">
                    <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Justificación</span>
                    {ev.justificacion}
                  </p>
                ) : (
                  <>
                    {ev.notas && (
                      <p className="mt-2 rounded-2xl bg-stone-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-stone-700 ring-1 ring-stone-900/5">
                        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Notas</span>
                        {ev.notas}
                      </p>
                    )}
                    {Object.keys(ev.scores).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(ev.scores).map(([k, v]) => (
                          <span key={k} className="rounded-full bg-white px-2 py-0.5 text-[11.5px] text-stone-600 ring-1 ring-stone-900/10">
                            {bonito(k)} <span className="num font-semibold text-stone-900">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
