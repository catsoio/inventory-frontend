import { DefaultUrlSerializer, UrlSerializer, UrlTree } from '@angular/router';

/**
 * Catso Garage har fyra produkter: Axle (verkstaden), Däck (däckhotellet), Hall (bilhandeln) och
 * Bärgning. Axle och Hall har ett prefix i adressen, de andra två inget. Adressen säger vilken:
 * `/axle/workorders`, `/hall/cars`. Varje produkt har sin egen startsida och sin egen
 * ekonomiöversikt (`/axle/finance`, `/hall/finance`). Det som hör till båda ligger utan prefix, så
 * att man stannar i den produkt man kom från: kunder, fordon, leverantörer och dokumenten
 * (säljkort, fakturor, kvitton, moms och bokföring). Koden internt använder fortfarande de korta
 * rutterna (`/workorders`, `/dealership`); `ProductUrlSerializer` lägger till och tar bort
 * prefixet i webbläsarens adress, så ingen länk i koden behöver veta om det.
 */
export type Product = 'axle' | 'hall' | 'dack' | 'towing';

/**
 * En lista över bolagets dokument kan visa en produkt eller båda. Bärgning har inga egna
 * dokumentlistor än: dess sidor delar Axles.
 */
export type ProductScope = 'all' | 'axle' | 'hall';

export const inScope = (scope: ProductScope, product: Product) =>
  scope === 'all' || scope === product;

/** Dokumentlistornas val när man kommer från en produkt: Däck och Bärgning har ingen egen och ser allt. */
export const scopeOf = (product: Product): ProductScope =>
  product === 'axle' || product === 'hall' ? product : 'all';

/**
 * Första ledet i de interna adresser som hör till Axle. `dashboard` är Axles startsida (`/axle`).
 * Varorna (Försäljning, Artiklar, Inköp, Lagerlogg) och Ekonomi ligger inte här: de delas av Axle
 * och Däck, så man stannar i den produkt man kom från (Halls ekonomi är `/hall/finance`).
 */
const AXLE_ROUTES = new Set([
  'dashboard',
  'bookings',
  'workorders',
  'quotes',
  'service-types',
  'resources',
]);

/** Däckhotellet är en egen produkt (`/storage`); adressen har inget prefix. */
const DACK_ROUTES = new Set(['storage']);

/**
 * Sidor under ett Axle-avsnitt som delas av båda produkterna: ett säljkort är lika mycket en
 * bilaffär som en verkstadsaffär, och fakturor, kvitton, moms och bokföring gäller hela bolaget.
 * De byter inte produkt när man öppnar dem. Listan `/sales` och översikten `/finance` är Axles.
 */
const SHARED_PREFIXES = ['/sales/', '/finance/', '/bookkeeping'];

const isShared = (path: string) => SHARED_PREFIXES.some((p) => path.startsWith(p));

/** Halls interna rutt är `dealership`; i adressen heter den `hall`. */
const HALL_ROUTE = 'dealership';

/** Bärgning är en egen produkt (`/towing`); adressen har inget prefix, rutten är redan produktens. */
const TOWING_ROUTE = 'towing';

const split = (url: string): [path: string, rest: string] => {
  const i = url.search(/[?#]/);
  return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i)];
};

/** Vilken produkt en intern adress hör till, eller null för det gemensamma. */
export function productOf(internal: string): Product | null {
  const path = split(internal)[0];
  if (isShared(path)) return null;
  const first = path.split('/')[1] ?? '';
  if (AXLE_ROUTES.has(first)) return 'axle';
  if (first === HALL_ROUTE) return 'hall';
  if (DACK_ROUTES.has(first)) return 'dack';
  return first === TOWING_ROUTE ? 'towing' : null;
}

/** Den interna adressen som den står i webbläsaren: `/workorders/3` blir `/axle/workorders/3`. */
export function toExternal(internal: string): string {
  const [path, rest] = split(internal);
  const first = path.split('/')[1] ?? '';
  let out = path;
  if (isShared(path)) out = path;
  else if (first === 'dashboard' && path.replace(/\/$/, '') === '/dashboard') out = '/axle';
  else if (AXLE_ROUTES.has(first)) out = '/axle' + path;
  else if (first === HALL_ROUTE) out = '/hall' + path.slice(`/${HALL_ROUTE}`.length);
  return out + rest;
}

/** Tillbaka: `/axle/workorders/3` blir `/workorders/3`, `/axle` blir `/dashboard`, `/hall/sales` blir `/dealership/sales`. */
export function toInternal(external: string): string {
  const [path, rest] = split(external);
  const first = path.split('/')[1] ?? '';
  let out = path;
  if (first === 'axle') {
    const tail = path.slice('/axle'.length);
    out = tail === '' || tail === '/' ? '/dashboard' : tail;
  } else if (first === 'hall') {
    out = '/' + HALL_ROUTE + path.slice('/hall'.length);
  }
  return out + rest;
}

/** Routern läser och skriver adresser med produktens prefix; rutterna själva är oförändrade. */
export class ProductUrlSerializer extends DefaultUrlSerializer implements UrlSerializer {
  override parse(url: string): UrlTree {
    return super.parse(toInternal(url));
  }

  override serialize(tree: UrlTree): string {
    return toExternal(super.serialize(tree));
  }
}
