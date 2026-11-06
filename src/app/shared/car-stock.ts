import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { CarListing, ListingInquiry } from '../core/models';

/** Över så här många dagar i lager vill bilhandlaren göra något åt bilen (sänka priset, annonsera om). */
export const IDLE_DAYS = 90;
/** Från så här många dagar börjar en bil att bli gammal i lager. */
export const WATCH_DAYS = 60;
/** En inköpt bil som inte lagts ut till salu efter så här många dagar har fastnat. */
export const UNLISTED_DAYS = 14;
/** Besiktningen går ut inom så här många dagar. */
export const INSPECTION_SOON_DAYS = 30;

export type AgeBand = 'fresh' | 'normal' | 'old' | 'stale';

/** Lagrets ålder i fyra steg; ordningen är den man läser dem i. */
export const AGE_BANDS: { key: AgeBand; label: string; from: number }[] = [
  { key: 'fresh', label: 'Under 30 dagar', from: 0 },
  { key: 'normal', label: '30–59 dagar', from: 30 },
  { key: 'old', label: '60–89 dagar', from: WATCH_DAYS },
  { key: 'stale', label: '90 dagar eller mer', from: IDLE_DAYS },
];

export const ageBand = (days: number): AgeBand =>
  days >= IDLE_DAYS ? 'stale' : days >= WATCH_DAYS ? 'old' : days >= 30 ? 'normal' : 'fresh';

/** Bilen finns kvar hos handlaren (inköpt, till salu eller reserverad). */
export const inStock = (c: Pick<CarListing, 'status'>) => c.status !== 'sold';

/**
 * Dagar i lager (standtid): från dagen bilen köptes in (annars dagen den lades in) till idag, eller
 * till dagen den såldes. Kalenderdagar, aldrig millisekunder delat på 24 timmar.
 */
export function daysInStock(
  c: Pick<CarListing, 'status' | 'purchase' | 'createdAt' | 'soldAt'>,
  today = new Date(),
): number {
  const from = parseISO(c.purchase?.date ?? c.createdAt);
  const to = c.status === 'sold' && c.soldAt ? parseISO(c.soldAt) : today;
  return Math.max(0, differenceInCalendarDays(to, from));
}

/** Pengar som ligger i bilen: inköp och det som lagts på den, exkl. avdragsgill moms (öre). */
export const carCapital = (c: Pick<CarListing, 'economy'>) => c.economy.totalCost ?? 0;

export interface StockFigures {
  /** Bilar som finns kvar: inköpta + till salu + reserverade. */
  count: number;
  bought: number;
  forSale: number;
  reserved: number;
  /** Öre som ligger bundna i bilarna som finns kvar. */
  capital: number;
  /** Snitt av dagar i lager för bilarna som finns kvar; null utan bilar. */
  avgDays: number | null;
  bands: Record<AgeBand, number>;
}

export function stockFigures(cars: CarListing[], today = new Date()): StockFigures {
  const stock = cars.filter(inStock);
  const bands: Record<AgeBand, number> = { fresh: 0, normal: 0, old: 0, stale: 0 };
  let days = 0;
  for (const c of stock) {
    const d = daysInStock(c, today);
    days += d;
    bands[ageBand(d)]++;
  }
  return {
    count: stock.length,
    bought: stock.filter((c) => c.status === 'draft').length,
    forSale: stock.filter((c) => c.status === 'active').length,
    reserved: stock.filter((c) => c.status === 'reserved').length,
    capital: stock.reduce((s, c) => s + carCapital(c), 0),
    avgDays: stock.length ? Math.round(days / stock.length) : null,
    bands,
  };
}

/** De bilar som stått längst i lager, äldst först. */
export const longestInStock = (cars: CarListing[], today = new Date(), limit = 5) =>
  cars
    .filter(inStock)
    .map((c) => ({ car: c, days: daysInStock(c, today) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);

/** Frågor från intresserade de senaste `days` dagarna, nyast först, med bilen de gäller. */
export function recentInquiries(
  cars: CarListing[],
  today = new Date(),
  days = 7,
): { car: CarListing; inquiry: ListingInquiry }[] {
  return cars
    .flatMap((car) => car.inquiries.map((inquiry) => ({ car, inquiry })))
    .filter((x) => differenceInCalendarDays(today, parseISO(x.inquiry.at)) < days)
    .sort((a, b) => b.inquiry.at.localeCompare(a.inquiry.at));
}

/**
 * Vad som väntar på någon i bilarnas böcker. Varje flagga har en enda definition, här: menyns
 * siffror, Hems "Att göra" och filtret i bil-listan (`?flag=`) räknar alla likadant.
 */
export type CarFlag = 'sellers' | 'idle' | 'inspection' | 'unlisted';

export const CAR_FLAGS: Record<CarFlag, string> = {
  sellers: 'saknar uppgift om vem ni köpte av',
  idle: `har stått ${IDLE_DAYS} dagar eller mer`,
  inspection: `behöver besiktas inom ${INSPECTION_SOON_DAYS} dagar`,
  unlisted: `är inköpta men inte utlagda till salu på ${UNLISTED_DAYS} dagar`,
};

export function matchesFlag(flag: CarFlag, c: CarListing, today = new Date()): boolean {
  switch (flag) {
    // Köpt utan moms (VMB): namn och nummer på säljaren måste finnas.
    case 'sellers':
      return c.purchase?.vatRate === 0 && !(c.purchase.seller && c.purchase.sellerId);
    case 'idle':
      return inStock(c) && daysInStock(c, today) >= IDLE_DAYS;
    case 'inspection':
      return (
        inStock(c) &&
        !!c.inspectionDue &&
        differenceInCalendarDays(parseISO(c.inspectionDue), today) <= INSPECTION_SOON_DAYS
      );
    case 'unlisted':
      return c.status === 'draft' && daysInStock(c, today) >= UNLISTED_DAYS;
  }
}

export const isCarFlag = (v: unknown): v is CarFlag => typeof v === 'string' && v in CAR_FLAGS;

/** Antal bilar per flagga. */
export type CarTodo = {
  sellersMissing: number;
  idle: number;
  inspectionSoon: number;
  unlisted: number;
};

export function carTodo(cars: CarListing[], today = new Date()): CarTodo {
  const n = (flag: CarFlag) => cars.filter((c) => matchesFlag(flag, c, today)).length;
  return {
    sellersMissing: n('sellers'),
    idle: n('idle'),
    inspectionSoon: n('inspection'),
    unlisted: n('unlisted'),
  };
}

/** Sålda bilar med `soldAt` från och med `from` till och med `to` (YYYY-MM-DD), senast sålda först. */
export const soldBetween = (cars: CarListing[], from: string, to: string) =>
  cars
    .filter((c) => c.status === 'sold' && !!c.soldAt && c.soldAt >= from && c.soldAt <= to)
    .sort((a, b) => (b.soldAt ?? '').localeCompare(a.soldAt ?? ''));
