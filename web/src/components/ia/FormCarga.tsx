"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Quote, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import type { ResultadoExtraccion } from "@/lib/ia/schemas";
import { ThoughtLine, type EstadoPaso, type PasoThought } from "@/components/ui/ThoughtLine";
import { Ring } from "@/components/ui/Ring";

type Respuesta =
  | { ok: true; candidato_vacante_id: string; intentos: number; modelo: string; fit_fuente: string; resultado: ResultadoExtraccion }
  | { ok: false; error: string; detalles?: string[] };

const campo =
  "w-full rounded-xl border border-stone-900/10 bg-white/90 px-3 py-2.5 text-[14px] outline-none transition-shadow placeholder:text-stone-300 focus:border-liv/50 focus:ring-4 focus:ring-liv/10";
const etiqueta = "mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-stone-500";

// Etapas visibles del extractor (agente 2). El avance es estimado mientras llega la
// respuesta; el último paso solo se marca cuando el servidor confirma que guardó.
const PASOS: { id: string; titulo: string; detalle: string }[] = [
  { id: "recibir", titulo: "Recibiendo documentos", detalle: "CV en PDF y resultado de la evaluación." },
  { id: "leer", titulo: "Leyendo el PDF", detalle: "Extracción de texto página por página." },
  { id: "ciego", titulo: "Evaluación ciega", detalle: "Se ocultan nombre, género, edad, CP y contacto antes del modelo." },
  { id: "competencias", titulo: "Extrayendo competencias", detalle: "Fortalezas, liderazgo, visión estratégica, idiomas, estudios." },
  { id: "nnn", titulo: "Semáforo de no negociables", detalle: "Cumple / parcial / no cumple, con evidencia y cita de origen." },
  { id: "validar", titulo: "Validando contra el schema", detalle: "Si la salida no valida, se reintenta; nada se guarda a medias." },
  { id: "guardar", titulo: "Ficha guardada con citas", detalle: "Lista para la comparativa lado a lado." },
];
const ESPERA = PASOS.length - 2; // se detiene en "Validando" hasta que responda el servidor

const CHIP_NN: Record<string, string> = {
  cumple: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
  parcial: "bg-amber-50 text-amber-900 ring-amber-600/20",
  no_cumple: "bg-rose-50 text-rose-800 ring-rose-600/15",
};

export function FormCarga({ vacantes, hrefLista }: { vacantes: { id: string; titulo: string }[]; hrefLista: string }) {
  const [enviando, setEnviando] = useState(false);
  const [resp, setResp] = useState<Respuesta | null>(null);
  const [paso, setPaso] = useState(-1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Avance estimado de la Thought Line mientras la IA trabaja.
  useEffect(() => {
    if (!enviando) return;
    const t = setInterval(() => setPaso((p) => (p < ESPERA ? p + 1 : p)), 1300);
    return () => clearInterval(t);
  }, [enviando]);

  function fijarArchivo(f: File | null) {
    if (f && f.type !== "application/pdf") return;
    setArchivo(f);
    if (input.current) {
      const dt = new DataTransfer();
      if (f) dt.items.add(f);
      input.current.files = dt.files;
    }
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setEnviando(true);
    setResp(null);
    setPaso(0);
    try {
      const r = await fetch("/api/ia/carga", { method: "POST", body: datos });
      const j = await r.json();
      const final: Respuesta = r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? "Error", detalles: j.detalles };
      if (final.ok) setPaso(PASOS.length);
      setResp(final);
    } catch {
      setResp({ ok: false, error: "No se pudo contactar al servidor" });
    } finally {
      setEnviando(false);
    }
  }

  const fallo = resp && !resp.ok;
  const pasos: PasoThought[] = PASOS.map((p, i) => {
    let estado: EstadoPaso = "pendiente";
    if (i < paso) estado = "hecho";
    else if (i === paso) estado = fallo ? "error" : enviando ? "activo" : "pendiente";
    return { ...p, estado, detalle: fallo && i === paso ? resp.error : p.detalle };
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <form onSubmit={enviar} className="surface space-y-5 rounded-3xl p-6 sm:p-7">
        {/* Zona de carga mágica */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            fijarArchivo(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => input.current?.click()}
          className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-7 text-center transition-all duration-500 ease-spring ${
            arrastrando ? "scale-[1.02] border-liv bg-liv-50" : archivo ? "border-liv/40 bg-liv-50/50" : "border-stone-900/10 bg-stone-50/60 hover:border-liv/40 hover:bg-liv-50/40"
          }`}
        >
          <input
            ref={input}
            id="cv_pdf"
            name="cv_pdf"
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => fijarArchivo(e.target.files?.[0] ?? null)}
          />
          <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-liv/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
          {archivo ? (
            <div className="animate-pop relative flex items-center justify-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-liv text-white shadow-lg">
                <FileText className="h-6 w-6" />
              </span>
              <span className="text-left">
                <span className="block max-w-[240px] truncate text-[14px] font-semibold">{archivo.name}</span>
                <span className="block text-[12px] text-stone-500">{(archivo.size / 1024).toFixed(0)} KB · PDF listo</span>
              </span>
              <button
                type="button"
                aria-label="Quitar archivo"
                onClick={(e) => {
                  e.stopPropagation();
                  fijarArchivo(null);
                }}
                className="press grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-white hover:text-stone-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-liv shadow-sm ring-1 ring-liv/15 transition-transform duration-500 ease-spring group-hover:-translate-y-1 group-hover:rotate-[-4deg]">
                <Upload className="h-6 w-6" />
              </span>
              <p className="mt-3 text-[15px] font-semibold">Suelta el CV aquí</p>
              <p className="mt-0.5 text-[12.5px] text-stone-500">o haz clic para elegir un PDF</p>
            </div>
          )}
        </div>
        <details className="-mt-2 text-[12.5px] text-stone-500">
          <summary className="cursor-pointer select-none hover:text-stone-800">…o pega el texto del CV</summary>
          <textarea name="cv_texto" rows={5} className={`${campo} mt-2`} />
        </details>

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
            <label className={etiqueta} htmlFor="compensacion_actual">Comp. actual (MXN)</label>
            <input id="compensacion_actual" name="compensacion_actual" type="number" min={0} className={campo} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="compensacion_deseada">Comp. deseada (MXN)</label>
            <input id="compensacion_deseada" name="compensacion_deseada" type="number" min={0} className={campo} />
          </div>
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
            <textarea id="evaluacion_resumen" name="evaluacion_resumen" rows={3} placeholder="Potencial Global 90%. …" className={campo} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50/70 p-3 text-[12.5px] text-emerald-900 ring-1 ring-emerald-600/10">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Evaluación ciega: la IA no ve nombre, género, edad, código postal ni datos de contacto.
        </p>
        <button
          disabled={enviando}
          className="press btn-liv focus-ring group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14.5px] font-semibold disabled:opacity-60"
        >
          <Sparkles className={`h-4 w-4 ${enviando ? "animate-spin" : ""}`} />
          {enviando ? "La IA está leyendo el CV…" : "Cargar y analizar con IA"}
        </button>
      </form>

      <section aria-live="polite" className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="surface rounded-3xl p-6 sm:p-7">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-liv">Thought Line</p>
              <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em]">Qué está haciendo la IA</h2>
            </div>
            {enviando && <span className="text-[11.5px] text-stone-400">progreso estimado</span>}
          </div>
          <ThoughtLine pasos={pasos} />
          {fallo && resp.detalles && (
            <ul className="mt-4 list-disc space-y-0.5 rounded-xl bg-rose-50 p-3 pl-7 text-[12px] text-rose-800">
              {resp.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>

        {resp?.ok && (
          <div className="animate-drawer surface relative overflow-hidden rounded-3xl p-6 sm:p-7">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-liv/15 blur-3xl" />
            <div className="relative flex items-baseline justify-between gap-3">
              <p className="text-[20px] font-semibold tracking-[-0.02em]">Ficha generada</p>
              <p className="tabular font-mono text-[11px] text-stone-400">
                {resp.modelo} · {resp.intentos} intento{resp.intentos > 1 ? "s" : ""}
              </p>
            </div>
            <div className="relative mt-5 flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <Ring valor={resp.resultado.fit_score} size={68} stroke={6} destacado />
                <div className="text-[12px] leading-tight text-stone-500">
                  <p className="text-[13px] font-semibold text-stone-900">Compatibilidad</p>
                  {resp.fit_fuente === "assessfirst" ? "AssessFirst Potencial Global" : "estimado por IA"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Ring valor={resp.resultado.compatibilidad_nnn} size={68} stroke={6} />
                <div className="text-[12px] leading-tight text-stone-500">
                  <p className="text-[13px] font-semibold text-stone-900">No negociables</p>
                  cumplimiento ponderado
                </div>
              </div>
            </div>
            <ul className="relative mt-5 space-y-2">
              {resp.resultado.cumple_no_negociables.map((c, i) => (
                <li key={c.no_negociable_id} className={`animate-rise rounded-2xl p-3 text-[12.5px] ring-1 ring-inset ${CHIP_NN[c.estado] ?? ""}`} style={{ animationDelay: `${i * 80}ms` }}>
                  <p className="font-semibold capitalize">{c.estado.replace("_", " ")}</p>
                  <p className="mt-0.5 text-stone-700">{c.evidencia}</p>
                  {c.cita && (
                    <p className="mt-1 flex gap-1 font-mono text-[10.5px] text-stone-500">
                      <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                      {c.cita}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="relative mt-4 text-[13.5px] leading-relaxed text-stone-700">{resp.resultado.ficha.descripcion}</p>
            <Link href={hrefLista} className="press group relative mt-5 inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-liv">
              Ver en la lista <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
