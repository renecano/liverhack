"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PreguntaGuardada, TipoEntrevista } from "@/lib/ia/schemas";
import { PreguntasEntrevista } from "./PreguntasEntrevista";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "vacio" }
  | { tipo: "generando"; previo: Estado | null }
  | { tipo: "ok"; preguntas: PreguntaGuardada[]; ts: string; generadoPor: "ia" | "manual"; intentos?: number }
  | { tipo: "error"; mensaje: string; detalles?: string[] };

const fecha = (ts: string) =>
  new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Preguntas de entrevista desde la lista: al abrir carga el set guardado del tipo
// elegido (sin regenerar); "Generar"/"Regenerar" llama al modelo y reemplaza el set.
export function PanelPreguntas({
  candidatoVacanteId,
  noNegociables,
  tieneFicha = true,
  tieneCv = true,
}: {
  candidatoVacanteId: string;
  noNegociables: { id: string; texto: string }[];
  /** Sin ficha, "Generar" primero analiza el CV guardado (lo hace el servidor). */
  tieneFicha?: boolean;
  tieneCv?: boolean;
}) {
  const router = useRouter();
  const [fichaLista, setFichaLista] = useState(tieneFicha);
  const [fase, setFase] = useState<"analizando" | "generando">("generando");
  const sinCv = !fichaLista && !tieneCv;
  const [tipo, setTipo] = useState<TipoEntrevista>("competencias");
  const [porTipo, setPorTipo] = useState<Partial<Record<TipoEntrevista, Estado>>>({});
  const estado: Estado = porTipo[tipo] ?? { tipo: "cargando" };
  const fijar = (t: TipoEntrevista, e: Estado) => setPorTipo((s) => ({ ...s, [t]: e }));

  // Carga lo guardado la primera vez que se muestra cada tipo.
  const yaCargado = porTipo[tipo] !== undefined;
  useEffect(() => {
    if (yaCargado) return;
    const t = tipo;
    let vivo = true;
    fetch(`/api/ia/preguntas?candidato_vacante_id=${candidatoVacanteId}&tipo=${t}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) return fijar(t, { tipo: "error", mensaje: j.error ?? "Error" });
        fijar(
          t,
          j.set
            ? { tipo: "ok", preguntas: j.set.preguntas, ts: j.set.ts, generadoPor: j.set.generado_por }
            : { tipo: "vacio" },
        );
      })
      .catch(() => vivo && fijar(t, { tipo: "error", mensaje: "No se pudo contactar al servidor" }));
    return () => {
      vivo = false;
    };
  }, [candidatoVacanteId, tipo, yaCargado]);

  async function generar() {
    const t = tipo;
    fijar(t, { tipo: "generando", previo: estado });
    // Si falta la ficha, el servidor analiza el CV primero (≈15-25 s) y luego genera.
    let reloj: ReturnType<typeof setTimeout> | undefined;
    if (!fichaLista) {
      setFase("analizando");
      reloj = setTimeout(() => setFase("generando"), 20_000);
    } else setFase("generando");
    try {
      const r = await fetch("/api/ia/preguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_vacante_id: candidatoVacanteId, tipo: t }),
      });
      const j = await r.json();
      if (r.ok && j.ficha_generada) {
        // La fila (semáforo, compatibilidad) se refresca con la ficha recién creada.
        setFichaLista(true);
        router.refresh();
      }
      fijar(
        t,
        r.ok
          ? { tipo: "ok", preguntas: j.preguntas, ts: j.ts, generadoPor: "ia", intentos: j.intentos }
          : { tipo: "error", mensaje: j.error ?? "Error", detalles: j.detalles },
      );
    } catch {
      fijar(t, { tipo: "error", mensaje: "No se pudo contactar al servidor" });
    } finally {
      clearTimeout(reloj);
    }
  }

  // Mientras regenera, se sigue mostrando el set anterior.
  const visible = estado.tipo === "generando" ? estado.previo : estado;
  const hayPreguntas = visible?.tipo === "ok";
  const esManual = visible?.tipo === "ok" && visible.generadoPor === "manual";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--lh-muted)]">Preguntas de entrevista</p>
        <div
          className="flex overflow-hidden rounded-sm border border-[var(--lh-rule)] text-xs"
          role="group"
          aria-label="Tipo de entrevista"
        >
          {(["competencias", "panel"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
              className={`px-3 py-1 capitalize ${tipo === t ? "bg-[var(--lh-ink)] text-white" : "bg-white hover:bg-stone-100"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {!esManual && (
          <button
            onClick={generar}
            disabled={estado.tipo === "generando" || estado.tipo === "cargando" || sinCv}
            title={sinCv ? "Este candidato no tiene CV cargado" : undefined}
            className="whitespace-nowrap rounded-sm bg-[var(--lh-accent)] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {estado.tipo === "generando" ? "Generando…" : hayPreguntas ? "Regenerar" : "Generar preguntas"}
          </button>
        )}
        {visible?.tipo === "ok" && (
          <span className="text-[11px] text-[var(--lh-muted)]">
            {visible.preguntas.length} preguntas · {visible.generadoPor === "manual" ? "escritas a mano" : "IA"} · guardadas{" "}
            {fecha(visible.ts)}
            {visible.intentos ? ` · ${visible.intentos} intento${visible.intentos > 1 ? "s" : ""}` : ""}
          </span>
        )}
      </div>

      {estado.tipo === "cargando" && <p className="text-xs text-[var(--lh-muted)]">Cargando preguntas guardadas…</p>}
      {estado.tipo === "generando" && (
        <p role="status" className="flex items-center gap-2 text-xs text-[var(--lh-ink-2)]">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--lh-accent)] border-t-transparent" />
          {fase === "analizando" ? "Analizando el CV del candidato…" : "Generando preguntas personalizadas…"}
        </p>
      )}
      {sinCv && estado.tipo !== "ok" && (
        <p className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Este candidato no tiene CV cargado; súbelo para generar preguntas.
        </p>
      )}
      {visible?.tipo === "vacio" && !sinCv && (
        <p className="text-xs text-[var(--lh-muted)]">
          Aún no hay preguntas de tipo {tipo}. La IA propone 6-10 desde la ficha anonimizada: confirma los no negociables
          que ya se cumplen, valida a fondo los parciales y explora las áreas de oportunidad.
        </p>
      )}
      {estado.tipo === "error" && (
        <div className="rounded-sm border border-[var(--lh-bad)] bg-red-50 p-3 text-xs">
          <p className="font-medium text-[var(--lh-bad)]">{estado.mensaje}</p>
          {estado.detalles && (
            <ul className="mt-1 list-disc pl-4 text-[var(--lh-ink-2)]">
              {estado.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {visible?.tipo === "ok" && <PreguntasEntrevista preguntas={visible.preguntas} noNegociables={noNegociables} />}
    </div>
  );
}
