import {
  addDays,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfDay,
  startOfWeek as startOfWeekOf,
} from 'date-fns';

/**
 * Datumhjälp för översikterna, byggd på date-fns. Räkna kalenderdagar och kalenderveckor med
 * hjälpfunktionerna här och i date-fns (`differenceInCalendarDays`, `differenceInCalendarWeeks`),
 * aldrig med millisekunder delat på 24 timmar: veckan när klockan ställs om är 167 eller 169 timmar.
 */
export { addDays, startOfDay };

/** Veckan börjar på måndag, som i Sverige. */
export const startOfWeek = (d: Date): Date => startOfWeekOf(d, { weekStartsOn: 1 });

/** ISO-vecka och dess år (veckan som innehåller årets första torsdag är vecka 1). */
export const isoWeek = (d: Date): { year: number; week: number } => ({
  year: getISOWeekYear(d),
  week: getISOWeek(d),
});

/** Samma nyckel som rapporten använder per vecka: `2026-W43`. */
export function weekKey(d: Date): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const weekNumber = (d: Date): number => getISOWeek(d);

/** 26 okt–1 nov */
export function weekRange(monday: Date, locale = 'sv-SE'): string {
  const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const clean = (s: string) => s.replace('.', '');
  return `${clean(f.format(monday))}–${clean(f.format(addDays(monday, 6)))}`;
}

/** 2026-10-26 (lokal dag, som rapporten tar emot den). */
export const ymd = (d: Date): string => format(d, 'yyyy-MM-dd');
