/** Genvägarna för att skapa något: samma i sökrutan och i topbaren. `go: null` = bokningsdialogen. */
export const QUICK_ACTIONS: { label: string; icon: string; go: string[] | null }[] = [
  { label: 'Ny inlämning', icon: 'warehouse', go: ['/storage', 'new'] },
  { label: 'Ny bokning', icon: 'event', go: null },
  { label: 'Ny försäljning', icon: 'point_of_sale', go: ['/sales', 'new'] },
  { label: 'Ny kund', icon: 'person_add', go: ['/customers', 'new'] },
];
