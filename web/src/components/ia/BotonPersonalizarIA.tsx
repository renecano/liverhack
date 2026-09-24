"use client";

import { useState } from "react";
import css from "./BotonPersonalizarIA.module.css";

/**
 * Botón "Personalizar con IA" para la pantalla de aprobación de notificaciones.
 * Reescribe con IA el texto de los borradores indicados (POST
 * /api/ia/notificaciones/personalizar, un id a la vez para mostrar progreso) y
 * al terminar llama a `onDone` para que la pantalla refresque la lista.
 *
 * Autocontenido: estilos propios (CSS Module), sin dependencias del layout.
 * Solo toca filas que sigan en 'borrador'; las ya aprobadas/enviadas se reportan
 * como "Ya no es borrador" y no se modifican.
 */
export interface BotonPersonalizarIAProps {
  /** Id de la notificación o lista de ids (solo borradores a candidatos). */
  ids: string | string[];
  /** Llamado al terminar todas las filas, con el resumen. Úsalo para refrescar (p. ej. router.refresh()). */
  onDone?: (resumen: ResumenPersonalizacion) => void;
  /** Texto visible por fila; por defecto, el final del id. P. ej. { [id]: "Carlos Mendoza" }. */
  etiquetas?: Record<string, string>;
  /** true = genera y valida sin guardar (pruebas). Por defecto false. */
  dryRun?: boolean;
  /** Deshabilita el botón (p. ej. mientras la pantalla aprueba el lote). */
  deshabilitado?: boolean;
  /** Texto del botón. Por defecto "Personalizar con IA". */
  texto?: string;
  /** Llamadas en paralelo (1-4). Por defecto 2, para no saturar la cuota de OpenAI. */
  concurrencia?: number;
}

export type EstadoFila = "pendiente" | "procesando" | "personalizada" | "ya_no_borrador" | "error";

export interface ResultadoFila {
  id: string;
  estado: EstadoFila;
  /** Mensaje de error legible, si aplica. */
  error?: string;
  /** Código del API ("no_es_borrador", "timeout", "salida_invalida", "interno"…). */
  codigo?: string;
  /** Texto generado (solo útil en dryRun; si no, ya quedó guardado en la fila). */
  mensaje?: string;
}

export interface ResumenPersonalizacion {
  total: number;
  personalizadas: number;
  yaNoBorrador: number;
  errores: number;
  resultados: ResultadoFila[];
}

const TEXTO_ESTADO: Record<EstadoFila, string> = {
  pendiente: "En cola",
  procesando: "Redactando…",
  personalizada: "Personalizada",
  ya_no_borrador: "Ya no es borrador",
  error: "Error",
};
const CLASE_ESTADO: Record<EstadoFila, string> = {
  pendiente: css.pendiente,
  procesando: css.pendiente,
  personalizada: css.ok,
  ya_no_borrador: css.aviso,
  error: css.error,
};

async function personalizarUno(id: string, dryRun: boolean): Promise<ResultadoFila> {
  try {
    const r = await fetch("/api/ia/notificaciones/personalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dry_run: dryRun }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return { id, estado: "personalizada", mensaje: j.mensaje };
    if (j.codigo === "no_es_borrador" || r.status === 409) return { id, estado: "ya_no_borrador", codigo: "no_es_borrador" };
    return { id, estado: "error", codigo: j.codigo, error: j.error ?? `HTTP ${r.status}` };
  } catch {
    return { id, estado: "error", codigo: "red", error: "No se pudo contactar al servidor" };
  }
}

export function BotonPersonalizarIA({
  ids,
  onDone,
  etiquetas,
  dryRun = false,
  deshabilitado = false,
  texto = "Personalizar con IA",
  concurrencia = 2,
}: BotonPersonalizarIAProps) {
  const lista = [...new Set(Array.isArray(ids) ? ids : [ids])].filter(Boolean);
  const [filas, setFilas] = useState<ResultadoFila[] | null>(null);
  const [corriendo, setCorriendo] = useState(false);

  async function iniciar() {
    if (corriendo || lista.length === 0) return;
    setCorriendo(true);
    const resultados: ResultadoFila[] = lista.map((id) => ({ id, estado: "pendiente" }));
    setFilas([...resultados]);
    const fijar = (i: number, f: ResultadoFila) => {
      resultados[i] = f;
      setFilas([...resultados]);
    };

    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < lista.length) {
        const i = siguiente++;
        fijar(i, { id: lista[i], estado: "procesando" });
        fijar(i, await personalizarUno(lista[i], dryRun));
      }
    };
    const n = Math.max(1, Math.min(4, concurrencia, lista.length));
    await Promise.all(Array.from({ length: n }, trabajador));

    setCorriendo(false);
    onDone?.({
      total: resultados.length,
      personalizadas: resultados.filter((r) => r.estado === "personalizada").length,
      yaNoBorrador: resultados.filter((r) => r.estado === "ya_no_borrador").length,
      errores: resultados.filter((r) => r.estado === "error").length,
      resultados,
    });
  }

  const hechas = filas?.filter((f) => f.estado !== "pendiente" && f.estado !== "procesando").length ?? 0;
  const total = filas?.length ?? lista.length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  const cuenta = (e: EstadoFila) => filas?.filter((f) => f.estado === e).length ?? 0;

  return (
    <div className={css.raiz}>
      <button
        type="button"
        className={css.boton}
        onClick={iniciar}
        disabled={deshabilitado || corriendo || lista.length === 0}
        aria-busy={corriendo}
      >
        <span className={css.chispa} aria-hidden>
          ✦
        </span>
        {corriendo ? `Personalizando ${hechas}/${total}…` : lista.length > 1 ? `${texto} (${lista.length})` : texto}
      </button>

      {filas && (
        <>
          <div className={css.progreso} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} aria-label="Progreso de personalización">
            <div className={css.barra} style={{ width: `${pct}%` }} />
          </div>
          <p className={css.resumen} aria-live="polite">
            {corriendo
              ? `${hechas} de ${total} procesadas`
              : `${cuenta("personalizada")} personalizada(s) · ${cuenta("ya_no_borrador")} ya no eran borrador · ${cuenta("error")} con error${dryRun ? " · prueba sin guardar" : ""}`}
          </p>
          <ul className={css.lista}>
            {filas.map((f) => (
              <li key={f.id} className={css.fila}>
                <span className={css.etiqueta} title={f.id}>
                  {etiquetas?.[f.id] ?? `…${f.id.slice(-6)}`}
                </span>
                <span className={`${css.estado} ${CLASE_ESTADO[f.estado]}`} title={f.error}>
                  {f.estado === "error" && f.error ? `${TEXTO_ESTADO.error}: ${f.error}` : TEXTO_ESTADO[f.estado]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
