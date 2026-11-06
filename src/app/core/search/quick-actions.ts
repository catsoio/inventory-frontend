export interface QuickAction {
  label: string;
  icon: string;
  /** `null` = bokningsdialogen. */
  go: string[] | null;
  /** Delen av appen som måste vara påslagen för garaget. */
  module?: string;
}

/**
 * Genvägarna för att skapa något, i grupper: samma i sökrutan och i topbaren. Grupperna är
 * avsnitten i sidomenyn (`NAV_AXLE`, `NAV_HALL`) och topbaren lägger ett mellanrum mellan dem. Grupperna med flera
 * knappar står först (längst till vänster), de som står ensamma sist (längst till höger).
 */
export type QuickGroup = { title: string; actions: QuickAction[] };

export const QUICK_GROUPS_AXLE: QuickGroup[] = [
  {
    title: 'Arbete',
    actions: [
      { label: 'Ny bokning', icon: 'event', go: null, module: 'tidsbokning' },
      {
        label: 'Ny arbetsorder',
        icon: 'assignment_add',
        go: ['/workorders', 'new'],
        module: 'arbetsorder',
      },
    ],
  },
  {
    title: 'Försäljning',
    actions: [
      { label: 'Ny offert', icon: 'request_quote', go: ['/quotes', 'new'], module: 'arbetsorder' },
      { label: 'Ny försäljning', icon: 'point_of_sale', go: ['/sales', 'new'] },
    ],
  },
  {
    title: 'Däck och lager',
    actions: [
      { label: 'Ny inlämning', icon: 'warehouse', go: ['/storage', 'new'], module: 'dackhotell' },
    ],
  },
  {
    title: 'Kunder',
    actions: [{ label: 'Ny kund', icon: 'person_add', go: ['/customers', 'new'] }],
  },
];

/**
 * Hall: det en bilhandlare gör flera gånger om dagen. En ny bil börjar med ett regnummer; "Sälj bil"
 * öppnar en ny affär, som börjar med att man väljer bilen.
 */
export const QUICK_GROUPS_HALL: QuickGroup[] = [
  {
    title: 'Bilar',
    actions: [
      {
        label: 'Ny bil',
        icon: 'directions_car',
        go: ['/dealership', 'cars', 'new'],
        module: 'bilhandel',
      },
      {
        label: 'Sälj bil',
        icon: 'handshake',
        go: ['/sales', 'new'],
        module: 'bilhandel',
      },
    ],
  },
  {
    title: 'Kunder',
    actions: [{ label: 'Ny kund', icon: 'person_add', go: ['/customers', 'new'] }],
  },
];

/** Genvägarna för produkten man är i. */
export const quickGroupsOf = (product: 'axle' | 'hall'): QuickGroup[] =>
  product === 'hall' ? QUICK_GROUPS_HALL : QUICK_GROUPS_AXLE;

export const quickActionsOf = (product: 'axle' | 'hall'): QuickAction[] =>
  quickGroupsOf(product).flatMap((g) => g.actions);
