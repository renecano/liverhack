import Link from "next/link";
import { exigirRol } from "@/lib/auth/sesion";
import { MUESTRA_MINIMA, UMBRAL_IMPACTO_ADVERSO, reporteEquidad, type Grupo, type Tasas } from "@/lib/ia/equidad";

export const dynamic = "force-dynamic";

// Agente 9 (fairness_report). Solo agregados por grupo: nunca candidatos individuales.
export default async function EquidadPage({ searchParams }: PageProps<"/hrbp/equidad">) {
  await exigirRol(["hrbp", "admin"]);
  const { vacante } = await searchParams;
  const vacanteId = typeof vacante === "string" && vacante ? vacante : undefined;
  const r = await reporteEquidad({ vacanteId });

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#c8105a]">Reporte de equidad</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">¿El proceso trata igual a todos los grupos?</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Compara qué porcentaje de postulaciones avanza, queda finalista o se descarta según escolaridad, fuente y compensación deseada. Solo muestra
          agregados por grupo: ningún nombre ni candidato individual.
        </p>
      </section>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Con datos de prueba las cifras son ilustrativas; con el histórico real de Liverpool el reporte detecta sesgos por factor.
      </p>

      {!r.ok ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{r.error}</p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Alcance</span>
              <select name="vacante" defaultValue={vacanteId ?? ""} className="min-w-64 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
                <option value="">Todas las vacantes</option>
                {r.vacantes.map((v) => (
                  <option key={v.id} value={v.id}>{v.titulo}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-[#c8105a] px-3 py-2 text-sm font-semibold text-white">Ver</button>
            {vacanteId && <Link href="/hrbp/equidad" className="py-2 text-sm font-medium text-[#c8105a]">Quitar filtro</Link>}
          </form>

          <Resumen total={r.reporte.total} />

          {r.reporte.total.postulaciones === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-slate-500">No hay postulaciones en este alcance.</p>
          ) : (
            r.reporte.dimensiones.map((d) => (
              <section key={d.dimension} className="rounded-xl border border-stone-200 bg-white shadow-sm">
                <header className="border-b border-stone-100 px-5 py-4">
                  <h2 className="font-semibold">{d.titulo}</h2>
                  <p className="text-sm text-slate-500">{d.descripcion}</p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-160 text-left text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                      <tr>
                        <th className="p-3 font-medium">Grupo</th>
                        <th className="p-3 text-right font-medium">Postulaciones</th>
                        <th className="p-3 text-right font-medium">Avanzó</th>
                        <th className="p-3 text-right font-medium">Finalista</th>
                        <th className="p-3 text-right font-medium">Descartado</th>
                        <th className="p-3 text-right font-medium">En proceso</th>
                        <th className="p-3 font-medium">Lectura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.grupos.map((g) => (
                        <FilaGrupo key={g.grupo} g={g} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}

          <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <h2 className="font-semibold text-slate-900">Cómo leer el reporte</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Avanzó:</strong> el HM la eligió finalista o para oferta, o hoy es finalista o contratada. Porcentajes sobre todas las postulaciones del grupo.</li>
              <li><strong>Finalista / Descartado / En proceso:</strong> estatus actual de la postulación (en proceso incluye pool).</li>
              <li>
                <strong>Selección:</strong> de las postulaciones que ya tienen resultado (avanzó o descartado), qué porcentaje avanzó. Las que siguen en proceso no
                cuentan, para no confundir &quot;aún no decidido&quot; con &quot;no avanzó&quot;.
              </li>
              <li>
                <strong>Posible sesgo:</strong> regla de las 4/5: la selección de un grupo es menor al {Math.round(UMBRAL_IMPACTO_ADVERSO * 100)} % de la del grupo que más
                avanza en esa dimensión. Solo se comparan grupos con al menos {MUESTRA_MINIMA} resultados. Es una señal para revisar, no una conclusión.
              </li>
              <li>
                <strong>Muestra pequeña:</strong> grupos con menos de {MUESTRA_MINIMA} postulaciones. No se muestran porcentajes (con tan pocas personas no significan nada y
                podrían identificar a alguien) y no entran en la comparación.
              </li>
              <li>Una misma persona puede contar en varias postulaciones (una por vacante).</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Resumen({ total }: { total: Tasas }) {
  // Con muy pocas postulaciones (p. ej. una vacante con 1-2) el porcentaje sería el
  // resultado de una persona: no se muestra.
  const v = (x: number) => (total.postulaciones < MUESTRA_MINIMA ? "—" : `${x} %`);
  const datos = [
    ["Postulaciones", String(total.postulaciones)],
    ["Candidatos", String(total.candidatos)],
    ["Avanzó", v(total.pct.avanzo)],
    ["Finalista", v(total.pct.finalista)],
    ["Descartado", v(total.pct.descartado)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {datos.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-1 text-2xl font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FilaGrupo({ g }: { g: Grupo }) {
  const celda = (n: number, p: number) =>
    g.muestra_pequena ? <span className="text-slate-400">—</span> : <><span className="font-semibold">{p} %</span> <span className="text-xs text-slate-400">({n})</span></>;
  return (
    <tr className={`border-t border-stone-100 ${g.posible_sesgo ? "bg-rose-50/60" : ""}`}>
      <td className="p-3 font-medium">{g.grupo}</td>
      <td className="p-3 text-right">{g.postulaciones}</td>
      <td className="p-3 text-right">{celda(g.avanzo, g.pct.avanzo)}</td>
      <td className="p-3 text-right">{celda(g.finalista, g.pct.finalista)}</td>
      <td className="p-3 text-right">{celda(g.descartado, g.pct.descartado)}</td>
      <td className="p-3 text-right">{celda(g.en_proceso, g.pct.en_proceso)}</td>
      <td className="p-3">
        {g.muestra_pequena ? (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Muestra pequeña</span>
        ) : g.resueltas < MUESTRA_MINIMA ? (
          <span className="text-xs text-slate-500">Pocos resultados aún ({g.resueltas} de {g.postulaciones} con resultado)</span>
        ) : g.posible_sesgo ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
            Posible sesgo · selección {g.tasa_seleccion} % ({Math.round((g.razon_impacto ?? 0) * 100)} % del mayor)
          </span>
        ) : g.razon_impacto !== null ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Sin diferencia notable · selección {g.tasa_seleccion} %</span>
        ) : (
          <span className="text-xs text-slate-500">Selección {g.tasa_seleccion} % · sin otro grupo para comparar</span>
        )}
      </td>
    </tr>
  );
}
