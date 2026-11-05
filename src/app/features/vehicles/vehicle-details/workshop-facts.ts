import type { VehicleDetails } from '../../../core/models';

export interface Fact {
  label: string;
  value: string;
  /** `bad` = något som kräver åtgärd (underkänd besiktning, utgången besiktning). */
  tone?: 'bad';
}

export interface FactGroup {
  title: string;
  facts: Fact[];
}

/** En rad ur uppgifterna: etikett (och gärna dess grupp) → värde. Första träffen vinner. */
type Pick = { label: string; from: string; group?: string; as?: string };

const GROUPS: { title: string; picks: Pick[] }[] = [
  {
    title: 'Motor och olja',
    picks: [
      { label: 'Motorkod', from: 'Motorkod' },
      { label: 'Motor', from: 'Motor', group: 'Fordonsuppgifter' },
      { label: 'Effekt', from: 'Hästkrafter' },
      { label: 'Motorvolym', from: 'Motorvolym' },
      { label: 'Bränsle', from: 'Bränsle' },
      { label: 'Motorolja', from: 'Helsyntetisk motorolja (viskositet)' },
      { label: 'Oljemängd', from: 'Motorolja, volym' },
      { label: 'Oljebyte och filter', from: 'Oljebyte & oljefilter' },
      { label: 'Kamrem/kedja', from: 'Synkronisering' },
      {
        label: 'Kamrem, intervall',
        from: 'Kamrem, Inget fast intervall',
        as: 'Inget fast intervall',
      },
    ],
  },
  {
    title: 'Service och vätskor',
    picks: [
      { label: 'Luftfilter', from: 'Luftfilter' },
      { label: 'Kupéfilter', from: 'Kupéfilter' },
      { label: 'Tändstift', from: 'Tändstift' },
      { label: 'Bromsvätska', from: 'Bromsvätska' },
      { label: 'Kylarvätska', from: 'Kylarvätska' },
      { label: 'Köldmedium', from: 'Köldmedium' },
      { label: 'Köldmedium, mängd', from: 'Köldmedium, kapacitet' },
      { label: 'Batteri', from: 'Batterikapacitet' },
      { label: 'Köldstartström', from: 'Köldstartström' },
      { label: 'Tankvolym', from: 'Tankvolym' },
    ],
  },
  {
    title: 'Hjul och däck',
    picks: [
      { label: 'Däck', from: 'Däckdimension' },
      { label: 'Bultmönster', from: 'Bultmönster' },
      { label: 'Gängmått', from: 'Gängmått' },
      { label: 'Åtdragningsmoment', from: 'Åtdragningsmoment' },
      { label: 'Navhål (CB)', from: 'Navhål (CB), fram' },
      { label: 'Fälgmaterial', from: 'Fälgmaterial' },
      { label: 'Låsmuttrar', from: 'Låsmuttrar/bultar' },
      { label: 'Däcktrycksmätare', from: 'Däcktrycksmätare' },
    ],
  },
  {
    title: 'Vikt och drag',
    picks: [
      { label: 'Tjänstevikt', from: 'Tjänstevikt' },
      { label: 'Totalvikt', from: 'Totalvikt' },
      { label: 'Max släp, bromsat', from: 'Max släpvagnsvikt, bromsad 12%' },
      { label: 'Max släp, obromsat', from: 'Max släpvagnsvikt, obromsad' },
      { label: 'Max kultryck', from: 'Max kultryck' },
      { label: 'Växellåda', from: 'Växellåda' },
      { label: 'Drivlina', from: 'Drivlina' },
    ],
  },
];

/**
 * Det en verkstad behöver ha framme: motorkod, olja, intervaller, bultmönster, åtdragning. Plockas
 * ur samma tabeller som visas längre ned; det som saknas för en bil hoppas över.
 */
export function workshopFacts(details: VehicleDetails | null | undefined): FactGroup[] {
  if (!details) return [];
  const rows = new Map<string, string>();
  for (const s of details.sections) {
    for (const g of s.groups) {
      for (const r of g.rows) {
        if (r.kind) continue;
        // Raden "Däck" i tabellen Däckdimensioner är själva måttet; bultarna slås ihop nedan.
        const key = g.title === 'Däckdimensioner' ? 'Däckdimension' : r.label;
        const value = g.title === 'Däckdimensioner' ? r.label : r.cells[0];
        if (value && !rows.has(key)) rows.set(key, value);
        const scoped = `${g.title}/${r.label}`;
        if (r.cells[0] && !rows.has(scoped)) rows.set(scoped, r.cells[0]);
      }
    }
  }
  // Däckdimensioner har rubrikrad först; "Däck" som etikett är inte ett mått.
  const dim = details.sections
    .flatMap((s) => s.groups)
    .find((g) => g.title === 'Däckdimensioner')
    ?.rows.find((r) => !r.kind);
  if (dim)
    rows.set(
      'Däckdimension',
      dim.label + (dim.cells[0] && dim.cells[0] !== '-' ? ` · ${dim.cells[0]}` : ''),
    );
  const bolts = rows.get('Antal bultar');
  const circle = rows.get('Bultcirkel');
  if (bolts && circle) rows.set('Bultmönster', `${bolts.replace(/\s*st$/, '')} × ${circle}`);

  return GROUPS.map((g) => ({
    title: g.title,
    facts: g.picks
      .map((p) => {
        const value = p.group ? rows.get(`${p.group}/${p.from}`) : rows.get(p.from);
        return value ? { label: p.label, value: p.as && value === 'Ja' ? p.as : value } : null;
      })
      .filter((f): f is Fact => f !== null),
  })).filter((g) => g.facts.length);
}

/** Alla rader med första värdet per etikett, och senaste besiktningen ur historiken. */
function flat(details: VehicleDetails) {
  const rows = new Map<string, string>();
  for (const s of details.sections) {
    for (const g of s.groups) {
      for (const r of g.rows) {
        if (!r.kind && r.cells[0] && !rows.has(r.label)) rows.set(r.label, r.cells[0]);
      }
    }
  }
  const last = details.sections
    .flatMap((s) => s.groups)
    .find((g) => g.title === 'Händelser')
    ?.rows.find((r) => !r.kind && r.cells[1] === 'Besiktning');
  return { rows, last };
}

/**
 * Bilens läge just nu: besiktning, mätarställning, skatt, värde. Det man vill se direkt när
 * bilen står på plats. `today` är dagens datum (YYYY-MM-DD) för att se om besiktningen gått ut.
 */
export function carStatus(details: VehicleDetails | null | undefined, today: string): FactGroup[] {
  if (!details) return [];
  const { rows, last } = flat(details);
  const due = rows.get('Besiktas senast');
  const result = last?.cells[2]?.split(' · ')[0];
  const failed = result === 'Underkänd';
  const groups: FactGroup[] = [
    {
      title: 'Besiktning',
      facts: [
        due && { label: 'Besiktas senast', value: due, tone: due < today ? 'bad' : undefined },
        last && {
          label: 'Senaste besiktning',
          value: `${result && /^[A-ZÅÄÖ]/.test(result) && !/\d/.test(result) ? `${result} ` : ''}${last.cells[0]}`,
          tone: failed ? 'bad' : undefined,
        },
      ].filter(Boolean) as Fact[],
    },
    {
      title: 'Mätarställning',
      facts: pick(rows, [
        ['Idag (uppskattad)', 'Mätarställning idag'],
        ['Senast rapporterad', 'Mätarställning'],
        ['Per år', 'Årlig körsträcka'],
      ]),
    },
    {
      title: 'Skatt och värde',
      facts: pick(rows, [
        ['Fordonsskatt', 'Fordonsskatt'],
        ['Skattemånad', 'Skattemånad'],
        ['Värdering', 'Indikativ värdering'],
      ]),
    },
    {
      title: 'Bilen',
      facts: pick(rows, [
        ['Antal ägare', 'Antal ägare'],
        ['I trafik', 'I trafik'],
        ['Första registrering', '1:a registreringsdatum'],
        ['Klassificering', 'Klassificering'],
      ]),
    },
  ];
  return groups.filter((g) => g.facts.length);
}

const pick = (rows: Map<string, string>, wanted: [string, string][]): Fact[] =>
  wanted.flatMap(([label, from]) => {
    const value = rows.get(from);
    return value ? [{ label, value }] : [];
  });
