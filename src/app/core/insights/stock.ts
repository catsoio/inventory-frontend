import { differenceInCalendarMonths } from 'date-fns';
import { Article, Season } from '../models';
import { addDays } from './dates';

const natural = new Intl.Collator('sv', { numeric: true, sensitivity: 'base' });

const tyres = (list: Article[]) => list.filter((a) => a.active && a.tyre);

/** Däck i lager per storlek (bredd, profil, fälg), med hur många artiklar som är på väg att ta slut. */
export interface SizeStat {
  key: string;
  label: string;
  rim: number;
  units: number;
  articles: number;
  low: number;
  out: number;
  bySeason: Record<Season, number>;
}

export function bySize(articles: Article[]): SizeStat[] {
  const by = new Map<string, SizeStat>();
  for (const a of tyres(articles)) {
    const t = a.tyre!;
    const key = `${t.width}/${t.profile}R${t.rimDiameter}`;
    const e = by.get(key) ?? {
      key,
      label: `${t.width}/${t.profile} R${t.rimDiameter}`,
      rim: t.rimDiameter,
      units: 0,
      articles: 0,
      low: 0,
      out: 0,
      bySeason: { winter: 0, summer: 0, all_season: 0 },
    };
    e.units += a.quantity;
    e.articles++;
    if (a.stockLevel === 'low') e.low++;
    if (a.stockLevel === 'out') e.out++;
    e.bySeason[t.season] += a.quantity;
    by.set(key, e);
  }
  return [...by.values()];
}

/** Däck per fälgstorlek och säsong. Vintern innehåller dubbade (som räknas för sig). */
export interface RimStat {
  rim: number;
  winter: number;
  summer: number;
  all_season: number;
  studded: number;
}

export function byRim(articles: Article[]): RimStat[] {
  const by = new Map<number, RimStat>();
  for (const a of tyres(articles)) {
    const t = a.tyre!;
    const e = by.get(t.rimDiameter) ?? {
      rim: t.rimDiameter,
      winter: 0,
      summer: 0,
      all_season: 0,
      studded: 0,
    };
    e[t.season] += a.quantity;
    if (t.studded && t.season === 'winter') e.studded += a.quantity;
    by.set(t.rimDiameter, e);
  }
  return [...by.values()].sort((a, b) => a.rim - b.rim);
}

export interface BrandStat {
  brand: string;
  units: number;
}

/** De största märkena i antal däck; resten vikt ihop till "Övriga". */
export function byBrand(articles: Article[], top = 7): BrandStat[] {
  const by = new Map<string, number>();
  for (const a of tyres(articles)) {
    const brand = a.brand?.trim() || 'Okänt märke';
    by.set(brand, (by.get(brand) ?? 0) + a.quantity);
  }
  const all = [...by].map(([brand, units]) => ({ brand, units })).filter((b) => b.units > 0);
  all.sort((a, b) => b.units - a.units || natural.compare(a.brand, b.brand));
  if (all.length <= top + 1) return all;
  const rest = all.slice(top).reduce((t, b) => t + b.units, 0);
  return [...all.slice(0, top), { brand: 'Övriga', units: rest }];
}

export interface SeasonUnits {
  winter: number;
  summer: number;
  all_season: number;
}

export function seasonUnits(articles: Article[]): SeasonUnits {
  const out: SeasonUnits = { winter: 0, summer: 0, all_season: 0 };
  for (const a of tyres(articles)) out[a.tyre!.season] += a.quantity;
  return out;
}

/** Det som är slut eller under beställningspunkten, mest akut först (störst brist mot punkten). */
export interface Reorder {
  article: Article;
  /** Antal som saknas upp till beställningspunkten. */
  missing: number;
  /** Lager i förhållande till beställningspunkten, 0..1. */
  ratio: number;
}

export function toOrder(articles: Article[]): Reorder[] {
  return articles
    .filter((a) => a.active && (a.stockLevel === 'low' || a.stockLevel === 'out'))
    .map((article) => {
      const level = Math.max(article.reorderLevel, 1);
      return {
        article,
        missing: Math.max(article.reorderLevel - article.quantity, 0),
        ratio: Math.min(Math.max(article.quantity / level, 0), 1),
      };
    })
    .sort(
      (a, b) =>
        a.ratio - b.ratio ||
        b.missing - a.missing ||
        natural.compare(a.article.label, b.article.label),
    );
}

/**
 * Tillverkningsvecka ur DOT-koden: fyra siffror, vecka och år ("2523" = vecka 25, 2023). Ogiltiga
 * koder, och koder i framtiden, ger `null`.
 */
export function dotDate(dot: string | null | undefined, now = new Date()): Date | null {
  const m = /(\d{2})(\d{2})\s*$/.exec((dot ?? '').trim());
  if (!m) return null;
  const week = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (week < 1 || week > 53) return null;
  const made = addDays(new Date(year, 0, 1), (week - 1) * 7);
  return made.getTime() > addDays(now, 60).getTime() ? null : made;
}

export interface AgeBucket {
  key: 'y0' | 'y1' | 'y2' | 'y3' | 'y4';
  label: string;
  units: number;
}

/** Däck i lager efter ålder (tillverkningsvecka ur DOT-koden); de utan giltig kod räknas för sig. */
export function dotAges(
  articles: Article[],
  now: Date,
): { buckets: AgeBucket[]; unknownUnits: number } {
  const buckets: AgeBucket[] = [
    { key: 'y0', label: '0–1 år', units: 0 },
    { key: 'y1', label: '1–2 år', units: 0 },
    { key: 'y2', label: '2–3 år', units: 0 },
    { key: 'y3', label: '3–4 år', units: 0 },
    { key: 'y4', label: '4+ år', units: 0 },
  ];
  let unknownUnits = 0;
  for (const a of tyres(articles)) {
    const made = dotDate(a.tyre!.dot, now);
    if (!made) {
      unknownUnits += a.quantity;
      continue;
    }
    const years = Math.floor(Math.max(differenceInCalendarMonths(now, made), 0) / 12);
    buckets[Math.min(years, 4)].units += a.quantity;
  }
  return { buckets, unknownUnits };
}
