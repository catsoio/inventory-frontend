import { differenceInCalendarDays, differenceInCalendarWeeks } from 'date-fns';
import { StorageDeposit } from '../models';
import { addDays, startOfWeek, weekNumber, weekRange } from './dates';

/** Ett steg i hämtprognosen: försenade, en vecka, eller allt senare. */
export interface PickupBucket {
  key: string;
  /** Kort etikett på axeln: "Försenade", "v. 44", "Senare". */
  label: string;
  /** Längre etikett i tooltip: "v. 44 · 26 okt–1 nov". */
  title: string;
  sets: number;
  units: number;
  overdue: boolean;
}

export interface PickupForecast {
  buckets: PickupBucket[];
  /** Inlagrade set som saknar hämtdatum (ingår inte i staplarna). */
  noDate: number;
}

const stored = (list: StorageDeposit[]) => list.filter((d) => d.status === 'stored');

/** Kort etikett för smala diagram: "Förs.", "44" och "Sen." (hela titeln står i tooltipen). */
export const shortLabel = (b: PickupBucket): string =>
  b.key === 'overdue' ? 'Förs.' : b.key === 'later' ? 'Sen.' : b.label.replace('v. ', '');

/**
 * När de inlagrade seten ska hämtas: försenade först, sedan veckorna framåt och till sist
 * "Senare". Visar var det blir tryck (vår- och höstbytet) och vad som redan borde vara hämtat.
 */
export function pickupForecast(deposits: StorageDeposit[], now: Date, weeks = 10): PickupForecast {
  const first = startOfWeek(now);
  const buckets: PickupBucket[] = [
    {
      key: 'overdue',
      label: 'Försenade',
      title: 'Passerat hämtdatum',
      sets: 0,
      units: 0,
      overdue: true,
    },
    ...Array.from({ length: weeks }, (_, i): PickupBucket => {
      const monday = addDays(first, i * 7);
      return {
        key: `w${i}`,
        label: `v. ${weekNumber(monday)}`,
        title: `v. ${weekNumber(monday)} · ${weekRange(monday)}`,
        sets: 0,
        units: 0,
        overdue: false,
      };
    }),
    {
      key: 'later',
      label: 'Senare',
      title: `Senare än ${weeks} veckor`,
      sets: 0,
      units: 0,
      overdue: false,
    },
  ];
  let noDate = 0;
  for (const d of stored(deposits)) {
    let i: number;
    if (d.overdue) i = 0;
    else if (!d.expectedPickupAt) {
      noDate++;
      continue;
    } else {
      const week = differenceInCalendarWeeks(new Date(d.expectedPickupAt), first, {
        weekStartsOn: 1,
      });
      i = week < 0 ? 0 : week >= weeks ? weeks + 1 : week + 1;
    }
    buckets[i].sets++;
    buckets[i].units += d.quantity;
  }
  return { buckets, noDate };
}

/** Vad som ligger i hotellet, i fast ordning. */
export interface MixItem {
  key: 'winter' | 'summer' | 'all_season' | 'rims';
  label: string;
  sets: number;
  units: number;
}

export function seasonMix(deposits: StorageDeposit[]): MixItem[] {
  const out: MixItem[] = [
    { key: 'winter', label: 'Vinter', sets: 0, units: 0 },
    { key: 'summer', label: 'Sommar', sets: 0, units: 0 },
    { key: 'all_season', label: 'Helår', sets: 0, units: 0 },
    { key: 'rims', label: 'Bara fälgar', sets: 0, units: 0 },
  ];
  for (const d of stored(deposits)) {
    const slot = out.find((o) => o.key === (d.tyres ? d.tyres.season : 'rims'));
    if (!slot) continue;
    slot.sets++;
    slot.units += d.quantity;
  }
  return out;
}

/** Hyllbeläggning: en cell per plats. */
export interface Shelf {
  /** Lagret ("Däckhotellet") och platsen ("Hylla H-12"). */
  warehouse: string;
  place: string;
  sets: number;
  units: number;
  /** Sökordet som listan kan filtreras på. */
  query: string;
}

const natural = new Intl.Collator('sv', { numeric: true, sensitivity: 'base' });

export function shelves(deposits: StorageDeposit[]): Shelf[] {
  const by = new Map<string, Shelf>();
  for (const d of stored(deposits)) {
    const text = d.location?.trim() || 'Ingen plats';
    const [warehouse, ...rest] = text.split(' · ');
    const place = rest.length ? rest.join(' · ') : warehouse;
    const wh = rest.length ? warehouse : '';
    const e = by.get(text) ?? { warehouse: wh, place, sets: 0, units: 0, query: place };
    e.sets++;
    e.units += d.quantity;
    by.set(text, e);
  }
  return [...by.values()].sort(
    (a, b) => natural.compare(a.warehouse, b.warehouse) || natural.compare(a.place, b.place),
  );
}

/** Vanligaste däckstorlekarna bland de inlagrade seten. */
export interface SizeCount {
  label: string;
  sets: number;
}

export function topSizes(deposits: StorageDeposit[], n = 8): SizeCount[] {
  const by = new Map<string, number>();
  for (const d of stored(deposits)) {
    const t = d.tyres;
    const label =
      t?.sizeLabel ||
      (t?.width && t.profile && t.rimDiameter ? `${t.width}/${t.profile} R${t.rimDiameter}` : '');
    if (label) by.set(label, (by.get(label) ?? 0) + 1);
  }
  return [...by]
    .map(([label, sets]) => ({ label, sets }))
    .sort((a, b) => b.sets - a.sets || natural.compare(a.label, b.label))
    .slice(0, n);
}

/** Set som skulle ha hämtats, de som väntat längst först. */
export interface Overdue {
  deposit: StorageDeposit;
  days: number;
}

export function overdueList(deposits: StorageDeposit[], now: Date): Overdue[] {
  return stored(deposits)
    .filter((d) => d.overdue && d.expectedPickupAt)
    .map((deposit) => ({
      deposit,
      days: Math.max(0, differenceInCalendarDays(now, new Date(deposit.expectedPickupAt!))),
    }))
    .sort((a, b) => b.days - a.days);
}

/** Under det här (mm) är vinterdäck inte godkända; nära det är det dags att erbjuda nya. */
export const TREAD_MIN = 3;
export const TREAD_SOON = 4;

export interface TreadBucket {
  key: 'under3' | 'from3' | 'from4' | 'over6' | 'unknown';
  label: string;
  sets: number;
}

/** Mönsterdjupet på de inlagrade däcken, i grova steg efter hur nära bytet är. */
export function treadBuckets(deposits: StorageDeposit[]): TreadBucket[] {
  const out: TreadBucket[] = [
    { key: 'under3', label: 'Under 3 mm', sets: 0 },
    { key: 'from3', label: '3–4 mm', sets: 0 },
    { key: 'from4', label: '4–6 mm', sets: 0 },
    { key: 'over6', label: '6 mm eller mer', sets: 0 },
    { key: 'unknown', label: 'Inte mätt', sets: 0 },
  ];
  for (const d of stored(deposits)) {
    if (!d.tyres) continue;
    const mm = d.tyres.treadDepthMm;
    const i = mm == null ? 4 : mm < TREAD_MIN ? 0 : mm < TREAD_SOON ? 1 : mm < 6 ? 2 : 3;
    out[i].sets++;
  }
  return out;
}

/** Set med slitna däck, de slitnaste först: kunder att erbjuda nya däck. */
export interface Worn {
  deposit: StorageDeposit;
  mm: number;
}

export function wornSets(deposits: StorageDeposit[], below = TREAD_SOON): Worn[] {
  return stored(deposits)
    .filter((d) => d.tyres?.treadDepthMm != null && d.tyres.treadDepthMm < below)
    .map((deposit) => ({ deposit, mm: deposit.tyres!.treadDepthMm! }))
    .sort((a, b) => a.mm - b.mm);
}
