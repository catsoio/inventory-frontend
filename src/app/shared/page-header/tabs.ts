import type { SectionTab } from './page-header';

/** Lager: listan, en översikt med diagram och lagerloggen (som förut hette Logg och rapport). */
export const STOCK_TABS: SectionTab[] = [
  { path: '/inventory', label: 'Artiklar', exact: true },
  { path: '/inventory/overview', label: 'Översikt' },
  { path: '/reports', label: 'Lagerlogg' },
  { path: '/inventory/receive', label: 'Ta emot' },
  { path: '/inventory/counts', label: 'Inventering' },
];

/** Däckhotell: inlämningarna och en översikt över vad som ska hämtas och var det står. */
export const HOTEL_TABS: SectionTab[] = [
  { path: '/storage', label: 'Inlämningar', exact: true },
  { path: '/inventory/counts', label: 'Inventering' },
];

/** Försäljning (Axle): säljkorten och det som är klart men inte fakturerat (levererat ej fakturerat). */
export const SALES_TABS: SectionTab[] = [
  { path: '/sales', label: 'Säljkort', exact: true },
  { path: '/sales/to-invoice', label: 'Att fakturera' },
];

/**
 * Åtgärder: registret och, för ägaren när garaget har onlinebokning, hur åtgärderna visas på
 * kundens bokningssida (vad som visas, i vilken ordning, och sidans egna inställningar).
 */
export function serviceTabs(online: boolean): SectionTab[] {
  return online
    ? [
        { path: '/service-types', label: 'Åtgärder', exact: true },
        { path: '/service-types/online', label: 'Onlinebokning' },
      ]
    : [];
}
