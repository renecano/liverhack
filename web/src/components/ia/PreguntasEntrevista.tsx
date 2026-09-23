import type { Pregunta } from "@/lib/ia/schemas";

// Vista de solo lectura de las preguntas de entrevista de un candidato.
// Sin estado ni fetch: la pantalla del entrevistador puede reutilizarla tal cual.

const BANDERA: Record<NonNullable<Pregunta["bandera"]>, { texto: string; clase: string }> = {
  no_negociable_parcial: { texto: "Valida no negociable parcial", clase: "bg-amber-100 text-amber-900" },
  no_negociable_no_cumple: { texto: "Valida no negociable no cumplido", clase: "bg-red-100 text-red-900" },
  hueco_cv: { texto: "Hueco en CV", clase: "bg-stone-200 text-stone-800" },
  area_oportunidad: { texto: "Área de oportunidad", clase: "bg-[#fbeef5] text-[var(--lh-accent)]" },
};

const CAMPO: Record<string, string> = {
  descripcion: "descripción",
  fortalezas: "fortalezas",
  areas_oportunidad: "áreas de oportunidad",
  estilo_liderazgo: "estilo de liderazgo",
  vision_estrategica: "visión estratégica",
  analisis_toma_decisiones: "análisis y toma de decisiones",
  idiomas: "idiomas",
  otros_estudios: "otros estudios",
  recomendaciones: "recomendaciones",
};

export function PreguntasEntrevista({
  preguntas,
  noNegociables,
}: {
  preguntas: Pregunta[];
  noNegociables: { id: string; texto: string }[];
}) {
  const nn = new Map(noNegociables.map((n) => [n.id, n.texto]));
  return (
    <ol className="space-y-3">
      {preguntas.map((p, i) => (
        <li key={i} className="flex gap-3">
          <span className="num mt-0.5 w-5 shrink-0 text-right text-xs text-[var(--lh-muted)]">{i + 1}.</span>
          <div className="min-w-0 space-y-1 text-[13px] leading-snug">
            <p className="font-medium text-[var(--lh-ink)]">{p.pregunta}</p>
            <p className="text-[var(--lh-ink-2)]">
              <span className="text-[var(--lh-muted)]">Objetivo:</span> {p.objetivo}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-[family-name:var(--font-data)]">
                {p.competencia}
              </span>
              {p.bandera && (
                <span className={`rounded-sm px-1.5 py-0.5 font-medium ${BANDERA[p.bandera].clase}`}>
                  {BANDERA[p.bandera].texto}
                </span>
              )}
              <span className="text-[var(--lh-muted)]">
                ↳ motivo:{" "}
                {p.origen.tipo === "no_negociable"
                  ? `no negociable «${nn.get(p.origen.referencia) ?? p.origen.referencia}»`
                  : `ficha · ${CAMPO[p.origen.referencia] ?? p.origen.referencia}`}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
