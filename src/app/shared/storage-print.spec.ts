import type { StorageDeposit } from '../core/models';
import { depositUrl, storageLabelsHtml } from './storage-print';

const deposit = (n: number): StorageDeposit =>
  ({
    id: `id-${n}`,
    code: `DH-0000${n}`,
    quantity: 4,
    contents: 'complete_wheels',
    tyres: {
      brand: 'Nokian',
      model: 'WR D4',
      sizeLabel: '205/55 R16',
      season: 'winter',
      studded: false,
    },
    rims: null,
    location: 'Däckhotellet · Hylla H-12',
    conditionGrade: 'good',
    condition: null,
    depositedAt: '2026-10-01T08:00:00.000Z',
    expectedPickupAt: null,
    vehicle: { regNo: 'ABC123' },
    customer: { name: 'Anna Andersson', phone: '070-1234567' },
  }) as unknown as StorageDeposit;

const qr = (d: StorageDeposit) => `<svg data-for="${d.id}"></svg>`;

describe('storageLabelsHtml', () => {
  it('puts three labels on each A4 sheet', () => {
    const html = storageLabelsHtml([1, 2, 3, 4].map(deposit), 'a4', qr);
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="label"/g)).toHaveLength(4);
    expect(html).toContain('size: A4 portrait');
  });

  it('gives a roll printer one label per page at the roll size', () => {
    const html = storageLabelsHtml([1, 2].map(deposit), 'roll', qr);
    expect(html).not.toContain('class="sheet"');
    expect(html.match(/class="label"/g)).toHaveLength(2);
    expect(html).toContain('size: 100mm 50mm');
  });

  it('puts the QR code of the same set on each label', () => {
    const html = storageLabelsHtml([1, 2].map(deposit), 'a4', qr);
    expect(html).toContain('data-for="id-1"');
    expect(html).toContain('data-for="id-2"');
  });

  it('leaves out the QR box when there is no code', () => {
    expect(storageLabelsHtml([deposit(1)], 'a4', () => '')).not.toContain('class="qr"');
  });
});

describe('depositUrl', () => {
  it('points at the deposit card in the app', () => {
    expect(depositUrl('https://app.example.se', { id: 'abc' })).toBe(
      'https://app.example.se/storage/abc',
    );
  });
});
