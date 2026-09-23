import { addDays, format, isWeekend, parseISO, startOfDay } from "date-fns";

// Días festivos (yyyy-MM-dd) que no cuentan como hábiles. Vacío por ahora;
// se llena con el calendario oficial cuando se defina.
export const FESTIVOS: string[] = [];

// Zona horaria del negocio: "hoy" se calcula aquí, no en la del servidor (Vercel = UTC).
export const ZONA_HORARIA = "America/Mexico_City";

export type Fecha = Date | string;

/** Normaliza a Date local a medianoche. Acepta 'yyyy-MM-dd' (columnas `date`) o Date. */
export function aFecha(f: Fecha): Date {
  return startOfDay(typeof f === "string" ? parseISO(f) : f);
}

/** Date → 'yyyy-MM-dd' (formato de las columnas `date` de Postgres). */
export function aISO(f: Fecha): string {
  return format(aFecha(f), "yyyy-MM-dd");
}

/** Fecha de hoy en la zona horaria del negocio, como 'yyyy-MM-dd'. */
export function hoyISO(zona: string = ZONA_HORARIA): string {
  // en-CA formatea como yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function esDiaHabil(f: Fecha, festivos: string[] = FESTIVOS): boolean {
  const d = aFecha(f);
  return !isWeekend(d) && !festivos.includes(aISO(d));
}

/**
 * Suma N días hábiles a `f`, saltando sábados, domingos y festivos.
 * N negativo resta. N = 0 devuelve la misma fecha.
 */
export function sumarDiasHabiles(
  f: Fecha,
  n: number,
  festivos: string[] = FESTIVOS,
): Date {
  let d = aFecha(f);
  const paso = n < 0 ? -1 : 1;
  let restantes = Math.abs(n);
  while (restantes > 0) {
    d = addDays(d, paso);
    if (esDiaHabil(d, festivos)) restantes--;
  }
  return d;
}

/**
 * Días hábiles de `a` a `b`: cuenta los días hábiles en (a, b].
 * Negativo si `b` es anterior a `a` (p. ej. un límite ya vencido).
 * diasHabilesEntre(lunes, martes) = 1; diasHabilesEntre(viernes, lunes) = 1.
 */
export function diasHabilesEntre(
  a: Fecha,
  b: Fecha,
  festivos: string[] = FESTIVOS,
): number {
  let desde = aFecha(a);
  let hasta = aFecha(b);
  let signo = 1;
  if (hasta < desde) {
    [desde, hasta] = [hasta, desde];
    signo = -1;
  }
  let dias = 0;
  let d = desde;
  while (d < hasta) {
    d = addDays(d, 1);
    if (esDiaHabil(d, festivos)) dias++;
  }
  return signo * dias;
}
