import { DefaultUrlSerializer, UrlSerializer, UrlTree } from '@angular/router';

/**
 * Catso Garage har två produkter: Axle (verkstaden) och Hall (bilhandeln). Adressen säger vilken:
 * `/axle/workorders`, `/hall/cars`. Varje produkt har sin egen startsida och sin egen
 * ekonomiöversikt (`/axle/finance`, `/hall/finance`). Det som hör till båda ligger utan prefix, så
 * att man stannar i den produkt man kom från: kunder, fordon, leverantörer och dokumenten
 * (säljkort, fakturor, kvitton, moms och bokföring). Koden internt använder fortfarande de korta
 * rutterna (`/workorders`, `/dealership`); `ProductUrlSerializer` lägger till och tar bort
 * prefixet i webbläsarens adress, så ingen länk i koden behöver veta om det.
 */
export type Product = 'axle' | 'hall';

/** En lista över bolagets dokument kan visa en produkt eller båda. */
export type ProductScope = 'all' | Product;

export const inScope = (scope: ProductScope, product: Product) =>
  scope === 'all' || scope === product;

/** Första ledet i de interna adresser som hör till Axle. `dashboard` är Axles startsida (`/axle`). */
const AXLE_ROUTES = new Set([
  'dashboard',
  'inventory',
  'storage',
  'bookings',
  'workorders',
  'quotes',
  'sales',
  'purchases',
  'service-types',
  'resources',
  'online-booking',
  'reports',
  'article-types',
  'warehouses',
  // Ekonomiöversikten är en per produkt: Axles ligger här, Halls under `/hall/finance`.
  'finance',
]);

/**
 * Sidor under ett Axle-avsnitt som delas av båda produkterna: ett säljkort är lika mycket en
 * bilaffär som en verkstadsaffär, och fakturor, kvitton, moms och bokföring gäller hela bolaget.
 * De byter inte produkt när man öppnar dem. Listan `/sales` och översikten `/finance` är Axles.
 */
const SHARED_PREFIXES = ['/sales/', '/finance/', '/bookkeeping'];

const isShared = (path: string) => SHARED_PREFIXES.some((p) => path.startsWith(p));

/** Halls interna rutt är `dealership`; i adressen heter den `hall`. */
const HALL_ROUTE = 'dealership';

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
  return first === HALL_ROUTE ? 'hall' : null;
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
