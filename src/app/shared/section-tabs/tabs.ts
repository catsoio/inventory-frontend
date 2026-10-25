import type { SectionTab } from './section-tabs';

/** Arbetsorder och Kostnadsförslag är två vyer av samma avsnitt: förslaget blir en order. */
export const ORDER_TABS: SectionTab[] = [
  { path: '/workorders', label: 'Arbetsorder', exact: true },
  { path: '/quotes', label: 'Kostnadsförslag' },
];

/** Lager: listan, en översikt med diagram och lagerloggen (som förut hette Logg och rapport). */
export const STOCK_TABS: SectionTab[] = [
  { path: '/inventory', label: 'Artiklar', exact: true },
  { path: '/inventory/overview', label: 'Översikt' },
  { path: '/reports', label: 'Lagerlogg' },
];

/** Däckhotell: inlämningarna och en översikt över vad som ska hämtas och var det står. */
export const HOTEL_TABS: SectionTab[] = [
  { path: '/storage', label: 'Inlämningar', exact: true },
  { path: '/storage/overview', label: 'Översikt' },
];
