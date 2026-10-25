import {
  Article,
  Customer,
  PAYMENT_STATUS_LABELS,
  STORAGE_CONTENTS_LABELS,
  SalesCardItem,
  StorageDeposit,
  Supplier,
  Vehicle,
  WORK_ORDER_STATUS_LABELS,
  WorkOrder,
} from '../models';
import { KrPipe } from '../../shared/kr-pipe';

export type HitKind =
  'storage' | 'vehicle' | 'customer' | 'order' | 'sale' | 'article' | 'supplier';

/** En träff i sökningen: en rad med rubrik, förklaring och vart den leder. */
export interface Hit {
  kind: HitKind;
  id: string;
  title: string;
  sub: string;
  /** Det man oftast söker efter: hyllan, lagersaldot, statusen. */
  side?: string;
  /** Tonen på `side`. */
  tone?: 'gray' | 'amber' | 'red' | 'green';
  /** Regnr som skylt. */
  plate?: string;
  /** För däckhotell: vad som ligger där (ikon). */
  item?: 'tyre' | 'rim' | 'wheel';
  link: string[];
}

export const KIND_LABELS: Record<HitKind, string> = {
  storage: 'Däckhotell',
  vehicle: 'Bilar',
  customer: 'Kunder',
  order: 'Arbetsorder',
  sale: 'Säljkort',
  article: 'Artiklar',
  supplier: 'Leverantörer',
};

export const KIND_ICONS: Record<HitKind, string> = {
  storage: 'warehouse',
  vehicle: 'directions_car',
  customer: 'person',
  order: 'handyman',
  sale: 'receipt_long',
  article: 'inventory_2',
  supplier: 'local_shipping',
};

const kr = new KrPipe();
const join = (...p: (string | number | null | undefined)[]) => p.filter((x) => x).join(' · ');

export const storageHit = (d: StorageDeposit): Hit => ({
  kind: 'storage',
  id: d.id,
  title: d.vehicle.regNo,
  plate: d.vehicle.regNo,
  item: d.contents === 'tyres' ? 'tyre' : d.contents === 'rims' ? 'rim' : 'wheel',
  sub: join(
    d.code,
    d.customer.name,
    `${d.quantity} st ${STORAGE_CONTENTS_LABELS[d.contents].toLowerCase()}`,
  ),
  side:
    d.status === 'picked_up'
      ? 'Utlämnad'
      : (d.location ?? 'Ingen plats') +
        (d.paymentStatus === 'unpaid' ? ' · ' + PAYMENT_STATUS_LABELS.unpaid.toLowerCase() : ''),
  tone:
    d.status === 'picked_up'
      ? 'gray'
      : d.overdue
        ? 'red'
        : d.paymentStatus === 'unpaid'
          ? 'amber'
          : 'gray',
  link: ['/storage', d.id],
});

export const vehicleHit = (v: Vehicle): Hit => ({
  kind: 'vehicle',
  id: v.id,
  title: v.regNo,
  plate: v.regNo,
  sub: join([v.make, v.model].filter(Boolean).join(' '), v.customer?.name),
  link: ['/vehicles', v.id],
});

export const customerHit = (c: Customer): Hit => ({
  kind: 'customer',
  id: c.id,
  title: c.name,
  sub: join(c.code, c.phone),
  link: ['/customers', c.id],
});

export const orderHit = (o: WorkOrder): Hit => ({
  kind: 'order',
  id: o.id,
  title: o.regNo,
  plate: o.regNo,
  sub: join(o.code, o.customerName, o.vehicle),
  side: WORK_ORDER_STATUS_LABELS[o.status],
  tone: o.status === 'done' ? 'green' : o.status === 'waiting_parts' ? 'amber' : 'gray',
  link: ['/workorders', o.id],
});

export const saleHit = (c: SalesCardItem): Hit => ({
  kind: 'sale',
  id: c.id,
  title: c.customerName ?? 'Kontantkund',
  sub: join(c.code, c.regNo, c.invoiceCode),
  side:
    c.status === 'draft' ? 'Utkast' : (c.paidAt ? 'Betald ' : 'Obetald ') + kr.transform(c.total),
  tone: c.status === 'draft' ? 'gray' : c.paidAt ? 'green' : 'amber',
  link: ['/sales', c.id],
});

export const articleHit = (a: Article): Hit => ({
  kind: 'article',
  id: a.id,
  title: a.sizeLabel ? [a.sizeLabel, a.brand, a.model].filter(Boolean).join(' ') : a.label,
  sub: join(a.code, a.location),
  side: a.quantity <= 0 ? 'Slut' : `${a.quantity} st i lager`,
  tone: a.quantity <= 0 ? 'red' : a.stockLevel === 'low' ? 'amber' : 'green',
  link: ['/inventory', a.id],
});

export const supplierHit = (s: Supplier): Hit => ({
  kind: 'supplier',
  id: s.id,
  title: s.name,
  sub: join(s.code, s.phone),
  link: ['/suppliers', s.id],
});

/**
 * I vilken ordning grupperna visas. Den som söker ett regnr vill se var däcken ligger först, den
 * som skriver en storlek vill se lagret, och den som skriver ett nummer vill ha kunden.
 */
export function groupOrder(q: string): HitKind[] {
  const t = q.trim();
  if (/^[a-zåäö]{3}\s?\d{2}[\dA-Za-z]$/i.test(t) || /^dh-?\d/i.test(t))
    return ['storage', 'vehicle', 'order', 'sale', 'customer', 'article', 'supplier'];
  if (/\d{3}\s*\/\s*\d{2}/.test(t) || /\br\s?\d{2}\b/i.test(t) || /^art-?\d/i.test(t))
    return ['article', 'storage', 'vehicle', 'customer', 'order', 'sale', 'supplier'];
  if (/^ao-?\d/i.test(t))
    return ['order', 'vehicle', 'customer', 'sale', 'storage', 'article', 'supplier'];
  if (/^(sk|fak)-?\d/i.test(t))
    return ['sale', 'customer', 'vehicle', 'order', 'storage', 'article', 'supplier'];
  if (/^[\d\s+()-]{5,}$/.test(t))
    return ['customer', 'vehicle', 'storage', 'order', 'sale', 'article', 'supplier'];
  return ['customer', 'vehicle', 'storage', 'order', 'sale', 'article', 'supplier'];
}

/** "ABC 123" och "abc123" är samma regnr: skicka utan blanksteg när det ser ut som ett. */
export function normalize(q: string): string {
  const t = q.trim();
  return /^[a-zåäö]{3}\s\d{2}[\dA-Za-z]$/i.test(t) ? t.replace(/\s+/g, '') : t;
}
