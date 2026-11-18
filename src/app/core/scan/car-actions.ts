import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from '../models';

/** Vad bladet gör när man tryckt på en ruta: gå till en sida, eller starta en order för bilen. */
export type CarSheetResult =
  | { kind: 'go'; commands: string[]; queryParams?: Record<string, string> }
  | { kind: 'order'; job?: string };

export interface CarTile {
  id: string;
  icon: string;
  label: string;
  sub?: string;
  /** Det man troligast vill: fylld ruta. Bara den första rutan är det. */
  primary: boolean;
  result: CarSheetResult;
}

/** Det bladet vet om bilen när rutorna väljs. */
export interface CarFacts {
  vehicleId: string;
  customerId: string;
  /** Orderna som är öppna, pågår eller väntar på del. */
  activeOrders: { id: string; code: string; status: WorkOrderStatus }[];
  /** Ett däckset som står i hotellet för bilen. */
  storedSet: { id: string; code: string; location: string | null } | null;
  /** Åtgärden som blir "Däckbyte" (garagets egen eller texten Däckbyte). */
  tyreJob: string;
  /** Delar garaget har påslagna (`Billing.allows`). */
  allows: (module: string) => boolean;
}

const MAX_ORDER_TILES = 3;

const go = (commands: string[], queryParams?: Record<string, string>): CarSheetResult => ({
  kind: 'go',
  commands,
  queryParams,
});

/**
 * Rutorna för en känd bil, i den ordning man troligast vill ha dem: det som redan pågår först (en
 * öppen order, setet i hotellet, så ingen dubblett skapas), sedan det man startar, sist bilkortet.
 * Bara delar garaget har får en ruta. Den första rutan är den stora.
 */
export function carTiles(f: CarFacts): CarTile[] {
  const link = { customerId: f.customerId, vehicleId: f.vehicleId };
  const orders = f.allows('arbetsorder');
  const hotel = f.allows('dackhotell');
  const tiles: Omit<CarTile, 'primary'>[] = [];

  if (orders) {
    for (const o of f.activeOrders.slice(0, MAX_ORDER_TILES)) {
      tiles.push({
        id: `order:${o.id}`,
        icon: 'assignment',
        label: `Öppna ${o.code}`,
        sub: WORK_ORDER_STATUS_LABELS[o.status],
        result: go(['/workorders', o.id]),
      });
    }
  }
  if (hotel && f.storedSet) {
    tiles.push({
      id: 'set',
      icon: 'warehouse',
      label: 'Däck i hotellet',
      sub: [f.storedSet.code, f.storedSet.location].filter(Boolean).join(' · '),
      result: go(['/storage', f.storedSet.id]),
    });
  }
  if (orders) {
    tiles.push({
      id: 'new-order',
      icon: 'build',
      label: f.activeOrders.length ? 'Ny order ändå' : 'Ny order',
      result: { kind: 'order' },
    });
    tiles.push({
      id: 'tyres',
      icon: 'tire_repair',
      label: 'Däckbyte',
      result: { kind: 'order', job: f.tyreJob },
    });
  }
  if (hotel && !f.storedSet) {
    tiles.push({
      id: 'hotel',
      icon: 'warehouse',
      label: 'Lämna in däck',
      result: go(['/storage/new'], link),
    });
  }
  if (orders) {
    tiles.push({
      id: 'quote',
      icon: 'request_quote',
      label: 'Offert',
      result: go(['/quotes/new'], link),
    });
  }
  tiles.push({
    id: 'sell',
    icon: 'point_of_sale',
    label: 'Sälj',
    result: go(['/sales/new'], link),
  });
  tiles.push({
    id: 'card',
    icon: 'directions_car',
    label: 'Bilkortet',
    result: go(['/vehicles', f.vehicleId]),
  });
  return tiles.map((t, i) => ({ ...t, primary: i === 0 }));
}
