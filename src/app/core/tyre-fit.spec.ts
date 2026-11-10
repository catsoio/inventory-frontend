import { fittingSizes, parseTyreSize } from './tyre-fit';

describe('parseTyreSize', () => {
  it('reads the usual spellings', () => {
    const want = { width: 205, profile: 55, diameter: 16 };
    expect(parseTyreSize('205/55 R16')).toEqual(want);
    expect(parseTyreSize('205/55R16')).toEqual(want);
    expect(parseTyreSize('205/55 R16 91V')).toEqual(want);
    expect(parseTyreSize('205/55 ZR16')).toEqual(want);
    expect(parseTyreSize('205/55-16')).toEqual(want);
    expect(parseTyreSize('225/45 R18 95Y XL')).toEqual({ width: 225, profile: 45, diameter: 18 });
  });

  it('rejects text that is not a tyre size', () => {
    expect(parseTyreSize(null)).toBeNull();
    expect(parseTyreSize('')).toBeNull();
    expect(parseTyreSize('Volvo V70')).toBeNull();
    expect(parseTyreSize('2055/55 R16')).toBeNull();
    expect(parseTyreSize('50/10 R5')).toBeNull();
  });
});

describe('fittingSizes', () => {
  const tyre = (width: number, profile: number, diameter: number) => ({
    tyre: {
      raw: `${width}/${profile} R${diameter}`,
      width,
      profile,
      diameter,
      loadIndex: null,
      speedIndex: null,
    },
    rim: null,
    maxLoadKg: null,
    trackMm: null,
  });

  it('gives one size and four tyres when every axle is the same', () => {
    const r = fittingSizes({
      tech: { axles: [tyre(205, 55, 16), tyre(205, 55, 16)] } as never,
      tyreSize: null,
      tyreSizeRear: null,
    });
    expect(r).toEqual([
      { width: 205, profile: 55, diameter: 16, label: '205/55 R16', where: 'all', quantity: 4 },
    ]);
  });

  it('gives front then rear with two tyres each when the axles differ', () => {
    const r = fittingSizes({
      tech: { axles: [tyre(225, 40, 18), tyre(255, 35, 18)] } as never,
      tyreSize: null,
      tyreSizeRear: null,
    });
    expect(r.map((s) => [s.label, s.where, s.quantity])).toEqual([
      ['225/40 R18', 'front', 2],
      ['255/35 R18', 'rear', 2],
    ]);
  });

  it('falls back to the sizes saved on the car', () => {
    expect(
      fittingSizes({ tech: undefined, tyreSize: '195/65 R15', tyreSizeRear: null })[0],
    ).toMatchObject({
      label: '195/65 R15',
      quantity: 4,
    });
    const both = fittingSizes({ tech: null, tyreSize: '215/45 R17', tyreSizeRear: '245/40 R17' });
    expect(both.map((s) => s.where)).toEqual(['front', 'rear']);
  });

  it('gives nothing without a car or a readable size', () => {
    expect(fittingSizes(null)).toEqual([]);
    expect(fittingSizes({ tech: null, tyreSize: 'okänt', tyreSizeRear: null })).toEqual([]);
  });
});
