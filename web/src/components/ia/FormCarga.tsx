"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResultadoExtraccion } from "@/lib/ia/schemas";

type Respuesta =
  | { ok: true; candidato_vacante_id: string; intentos: number; modelo: string; fit_fuente: string; resultado: ResultadoExtraccion }
  | { ok: false; error: string; detalles?: string[] };

const campo =
  "w-full rounded-sm border border-[var(--lh-rule)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--lh-ink)]";
const etiqueta = "mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--lh-muted)]";

export function FormCarga({ vacantes }: { vacantes: { id: string; titulo: string }[] }) {
  const [enviando, setEnviando] = useState(false);
  const [resp, setResp] = useState<Respuesta | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setResp(null);
    try {
      const r = await fetch("/api/ia/carga", { method: "POST", body: new FormData(e.currentTarget) });
      const j = await r.json();
      setResp(r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? "Error", detalles: j.detalles });
    } catch {
      setResp({ ok: false, error: "No se pudo contactar al servidor" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={enviar} className="space-y-5 rounded-md border border-[var(--lh-rule)] bg-[var(--lh-card)] p-6">
        <div>
          <label className={etiqueta} htmlFor="vacante_id">Vacante</label>
          <select id="vacante_id" name="vacante_id" required className={campo}>
            {vacantes.map((v) => (
              <option key={v.id} value={v.id}>{v.titulo}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiqueta} htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" required className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="telefono">Teléfono</label>
            <input id="telefono" name="telefono" className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="fuente">Fuente</label>
            <select id="fuente" name="fuente" className={campo} defaultValue="bolsa">
              <option value="bolsa">Bolsa</option>
              <option value="referido">Referido</option>
              <option value="aira">Aira</option>
              <option value="directo">Directo</option>
            </select>
          </div>
          <div>
            <label className={etiqueta} htmlFor="puesto_actual">Puesto actual</label>
            <input id="puesto_actual" name="puesto_actual" className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="empresa_actual">Empresa actual</label>
            <input id="empresa_actual" name="empresa_actual" className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="compensacion_actual">Compensación actual (MXN)</label>
            <input id="compensacion_actual" name="compensacion_actual" type="number" min={0} className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="compensacion_deseada">Compensación deseada (MXN)</label>
            <input id="compensacion_deseada" name="compensacion_deseada" type="number" min={0} className={campo} />
          </div>
        </div>
        <div>
          <label className={etiqueta} htmlFor="cv_pdf">CV (PDF)</label>
          <input id="cv_pdf" name="cv_pdf" type="file" accept="application/pdf" className="text-sm" />
          <details className="mt-2 text-xs text-[var(--lh-muted)]">
            <summary className="cursor-pointer">…o pega el texto del CV</summary>
            <textarea name="cv_texto" rows={6} className={`${campo} mt-2`} />
          </details>
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div>
            <label className={etiqueta} htmlFor="evaluacion_tipo">Evaluación</label>
            <select id="evaluacion_tipo" name="evaluacion_tipo" className={campo} defaultValue="assessfirst">
              <option value="assessfirst">AssessFirst</option>
              <option value="psicometrica">Psicométrica</option>
              <option value="otra">Otra</option>
            </select>
          </div>
          <div>
            <label className={etiqueta} htmlFor="evaluacion_resumen">Resultado / resumen</label>
            <textarea
              id="evaluacion_resumen"
              name="evaluacion_resumen"
              rows={3}
              placeholder="Potencial Global 90%. …"
              className={campo}
            />
          </div>
        </div>
        <p className="text-xs text-[var(--lh-muted)]">
          Evaluación ciega: la IA no ve nombre, género, edad, código postal ni datos de contacto.
        </p>
        <button
          disabled={enviando}
          className="w-full rounded-sm bg-[var(--lh-ink)] py-2.5 text-sm font-medium text-white hover:bg-[var(--lh-accent)] disabled:opacity-60"
        >
          {enviando ? "La IA está leyendo el CV…" : "Cargar y analizar con IA"}
        </button>
      </form>

      <section aria-live="polite">
        {!resp && (
          <div className="rounded-md border border-dashed border-[var(--lh-rule)] p-8 text-sm text-[var(--lh-muted)]">
            Aquí aparecerá la ficha extraída: fortalezas, áreas de oportunidad, semáforo de no negociables y citas de
            origen.
          </div>
        )}
        {resp && !resp.ok && (
          <div className="rounded-md border border-[var(--lh-bad)] bg-red-50 p-6 text-sm">
            <p className="font-medium text-[var(--lh-bad)]">{resp.error}</p>
            {resp.detalles && (
              <ul className="mt-2 list-disc pl-5 text-xs text-[var(--lh-ink-2)]">
                {resp.detalles.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {resp?.ok && (
          <div className="lh-rise space-y-4 rounded-md border border-[var(--lh-rule)] bg-[var(--lh-card)] p-6 text-sm">
            <div className="flex items-baseline justify-between">
              <p className="font-[family-name:var(--font-display)] text-2xl font-semibold">Ficha generada</p>
              <p className="num text-xs text-[var(--lh-muted)]">
                {resp.modelo} · {resp.intentos} intento{resp.intentos > 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className={etiqueta}>Compatibilidad</p>
                <p className="num text-3xl">{resp.resultado.fit_score}%</p>
                <p className="text-[11px] text-[var(--lh-muted)]">
                  {resp.fit_fuente === "assessfirst" ? "AssessFirst Potencial Global" : "estimado por IA"}
                </p>
              </div>
              <div>
                <p className={etiqueta}>No negociables</p>
                <p className="num text-3xl">{resp.resultado.compatibilidad_nnn}%</p>
                <p className="text-[11px] text-[var(--lh-muted)]">
                  {resp.resultado.cumple_no_negociables.map((c) => c.estado.replace("_", " ")).join(" · ")}
                </p>
              </div>
            </div>
            <p>{resp.resultado.ficha.descripcion}</p>
            <Link
              href={`/hm/candidatos`}
              className="inline-block rounded-sm border border-[var(--lh-ink)] px-4 py-2 font-medium hover:bg-[var(--lh-ink)] hover:text-white"
            >
              Ver en la lista →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
