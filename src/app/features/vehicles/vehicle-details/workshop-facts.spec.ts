import type { VehicleDetails } from '../../../core/models';
import { carStatus, workshopFacts } from './workshop-facts';

const details: VehicleDetails = {
  source: 'car.info',
  sections: [
    {
      title: 'Motor & Prestanda',
      important: false,
      groups: [
        {
          title: 'Motor',
          important: true,
          rows: [
            { label: 'Motorkod', cells: ['CYVB'] },
            { label: 'Motorolja, volym', cells: ['4 l'] },
            { label: 'Bredd', cells: ['25 mm'] },
          ],
        },
      ],
    },
    {
      title: 'Utvändigt',
      important: false,
      groups: [
        {
          title: 'Däck & Fälgar',
          important: true,
          rows: [
            { label: 'Antal bultar', cells: ['5 st'] },
            { label: 'Bultcirkel', cells: ['112'] },
            { label: 'Åtdragningsmoment', cells: ['125 Nm'] },
          ],
        },
        {
          title: 'Däckdimensioner',
          important: true,
          rows: [
            { label: 'Däck', cells: ['Fälg', 'Däcktryck'], kind: 'columns' },
            { label: '195/65R15 91H', cells: ['-', '-'] },
          ],
        },
      ],
    },
  ],
};

describe('workshopFacts', () => {
  const groups = workshopFacts(details);
  const fact = (label: string) =>
    groups.flatMap((g) => g.facts).find((f) => f.label === label)?.value;

  it('plockar det en verkstad letar efter', () => {
    expect(fact('Motorkod')).toBe('CYVB');
    expect(fact('Oljemängd')).toBe('4 l');
    expect(fact('Åtdragningsmoment')).toBe('125 Nm');
  });

  it('slår ihop bultar och bultcirkel till ett bultmönster', () => {
    expect(fact('Bultmönster')).toBe('5 × 112');
  });

  it('tar däckmåttet ur tabellen, inte rubrikraden', () => {
    expect(fact('Däck')).toBe('195/65R15 91H');
  });

  it('hoppar över det bilen saknar och ger inget utan uppgifter', () => {
    expect(fact('Tändstift')).toBeUndefined();
    expect(workshopFacts(null)).toEqual([]);
  });
});

describe('carStatus', () => {
  const car: VehicleDetails = {
    source: 'car.info',
    sections: [
      {
        title: 'Översikt',
        important: true,
        groups: [
          {
            title: 'Besiktning, värde och skatt',
            important: true,
            rows: [
              { label: 'Besiktas senast', cells: ['2026-10-28'] },
              { label: 'Fordonsskatt', cells: ['492 SEK'] },
            ],
          },
        ],
      },
      {
        title: 'Historik',
        important: true,
        groups: [
          {
            title: 'Händelser',
            important: true,
            rows: [
              { label: 'Händelse', cells: ['Datum', 'Typ', 'Detaljer'], kind: 'columns' },
              {
                label: 'Kontrollbesiktning',
                cells: ['2026-09-28', 'Besiktning', 'Underkänd · 24 157 mil'],
              },
            ],
          },
        ],
      },
    ],
  };
  const fact = (today: string, label: string) =>
    carStatus(car, today)
      .flatMap((g) => g.facts)
      .find((f) => f.label === label);

  it('markerar en besiktning som gått ut och en underkänd', () => {
    expect(fact('2026-11-05', 'Besiktas senast')?.tone).toBe('bad');
    expect(fact('2026-10-01', 'Besiktas senast')?.tone).toBeUndefined();
    expect(fact('2026-11-05', 'Senaste besiktning')).toMatchObject({
      value: 'Underkänd 2026-09-28',
      tone: 'bad',
    });
  });

  it('tar med skatten och hoppar över det som saknas', () => {
    expect(fact('2026-11-05', 'Fordonsskatt')?.value).toBe('492 SEK');
    expect(fact('2026-11-05', 'Värdering')).toBeUndefined();
  });
});
