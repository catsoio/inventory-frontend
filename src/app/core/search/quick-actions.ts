export interface QuickAction {
  label: string;
  icon: string;
  /** `null` = bokningsdialogen. */
  go: string[] | null;
}

/**
 * Genvägarna för att skapa något, i grupper: samma i sökrutan och i topbaren. Grupperna är
 * avsnitten i sidomenyn (`NAV`) och topbaren lägger ett mellanrum mellan dem. Grupperna med flera
 * knappar står först (längst till vänster), de som står ensamma sist (längst till höger).
 */
export const QUICK_GROUPS: { title: string; actions: QuickAction[] }[] = [
  {
    title: 'Arbete',
    actions: [
      { label: 'Ny bokning', icon: 'event', go: null },
      { label: 'Ny arbetsorder', icon: 'assignment_add', go: ['/workorders', 'new'] },
    ],
  },
  {
    title: 'Försäljning',
    actions: [
      { label: 'Ny offert', icon: 'request_quote', go: ['/quotes', 'new'] },
      { label: 'Ny försäljning', icon: 'point_of_sale', go: ['/sales', 'new'] },
    ],
  },
  {
    title: 'Däck och lager',
    actions: [{ label: 'Ny inlämning', icon: 'warehouse', go: ['/storage', 'new'] }],
  },
  {
    title: 'Kunder',
    actions: [{ label: 'Ny kund', icon: 'person_add', go: ['/customers', 'new'] }],
  },
];

export const QUICK_ACTIONS: QuickAction[] = QUICK_GROUPS.flatMap((g) => g.actions);
