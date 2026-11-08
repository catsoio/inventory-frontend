import { appLocale } from '../../core/i18n/locale';
import { ScreenOrder } from '../../core/models';

/** Verkstaden räknar tid som svensk tid, vilken tidszon skärmens webbläsare än har. */
const TZ = 'Europe/Stockholm';

export const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });

/** ABC123 -> "ABC 123". */
export function plateOf(regNo: string) {
  const v = regNo.toUpperCase().replace(/\s+/g, '');
  return v.length === 6 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
}

export const timeOf = (iso: string | number) =>
  new Date(iso).toLocaleTimeString(appLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });

export const dateOf = (ms: number) =>
  new Date(ms).toLocaleDateString(appLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });

/** "15:30" idag, annars "fre 13 nov 15:30". */
export function dueOf(iso: string, now: number) {
  if (dayKey(new Date(iso)) === dayKey(new Date(now))) return timeOf(iso);
  const day = new Date(iso).toLocaleDateString(appLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  });
  return `${day} ${timeOf(iso)}`;
}

export type OrderStatus = ScreenOrder['status'];

/** Namn och färger per status, så att samma status ser likadan ut i varje stil. */
export const STATUSES: { status: OrderStatus; title: string; icon: string }[] = [
  { status: 'open', title: 'Ska startas', icon: 'schedule' },
  { status: 'in_progress', title: 'Pågår', icon: 'build' },
  { status: 'waiting_parts', title: 'Väntar på del', icon: 'inventory_2' },
];

export const statusTitle = (s: OrderStatus) => STATUSES.find((x) => x.status === s)!.title;

export function byStatus(orders: ScreenOrder[]): Record<OrderStatus, ScreenOrder[]> {
  const out: Record<OrderStatus, ScreenOrder[]> = { open: [], in_progress: [], waiting_parts: [] };
  for (const o of orders) out[o.status].push(o);
  return out;
}

/** Initialer till mekanikerns cirkel: "Kalle Berg" blir KB, "Kalle" blir K. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
}
