import { GroupedReport } from '../models';
import { addDays, startOfWeek, weekKey, weekNumber } from './dates';

/** Försäljning och inköp per vecka, med luckor fyllda med noll. Belopp i öre, exkl. moms. */
export interface WeeklySeries {
  mondays: Date[];
  labels: string[];
  sold: number[];
  bought: number[];
  soldUnits: number[];
}

export function weeklySeries(report: GroupedReport | null, now: Date, weeks = 12): WeeklySeries {
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(first, i * 7));
  const by = new Map((report?.groups ?? []).map((g) => [g.key, g]));
  const at = (m: Date) => by.get(weekKey(m));
  return {
    mondays,
    labels: mondays.map((m) => `v. ${weekNumber(m)}`),
    sold: mondays.map((m) => at(m)?.soldRevenue ?? 0),
    bought: mondays.map((m) => at(m)?.purchasedCost ?? 0),
    soldUnits: mondays.map((m) => at(m)?.soldUnits ?? 0),
  };
}

/** Försäljning, inköp och vinst per kalendermånad. Belopp i öre, exkl. moms. */
export interface MonthlySeries {
  firsts: Date[];
  labels: string[];
  sold: number[];
  bought: number[];
  profit: number[];
  soldUnits: number[];
}

/**
 * Dagsrapporten (`groupBy=day`, nycklar `2026-10-26`) summerad per kalendermånad, de senaste
 * `months` månaderna fram till `now`. Månader utan rörelser blir noll.
 */
export function monthlySeries(report: GroupedReport | null, now: Date, months = 12): MonthlySeries {
  const firsts = Array.from(
    { length: months },
    (_, i) => new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1),
  );
  const idx = new Map(
    firsts.map((d, i) => [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, i]),
  );
  const out: MonthlySeries = {
    firsts,
    labels: firsts.map((d) => d.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')),
    sold: firsts.map(() => 0),
    bought: firsts.map(() => 0),
    profit: firsts.map(() => 0),
    soldUnits: firsts.map(() => 0),
  };
  for (const g of report?.groups ?? []) {
    const i = idx.get(g.key.slice(0, 7));
    if (i === undefined) continue;
    out.sold[i] += g.soldRevenue;
    out.bought[i] += g.purchasedCost;
    out.profit[i] += g.grossProfit;
    out.soldUnits[i] += g.soldUnits;
  }
  return out;
}
