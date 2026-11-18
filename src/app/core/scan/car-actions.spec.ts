import { CarFacts, carTiles } from './car-actions';
import { isEan, isOwnLabel, tyreJobName } from './code';
import type { ServiceType } from '../models';

const facts = (over: Partial<CarFacts> = {}): CarFacts => ({
  vehicleId: 'v1',
  customerId: 'c1',
  activeOrders: [],
  storedSet: null,
  tyreJob: 'Däckbyte',
  allows: () => true,
  ...over,
});
const ids = (f: CarFacts) => carTiles(f).map((t) => t.id);

describe('carTiles', () => {
  it('starts with a new order for a car nothing is going on for, and makes only that one big', () => {
    const tiles = carTiles(facts());
    expect(tiles.map((t) => t.id)).toEqual([
      'new-order',
      'tyres',
      'hotel',
      'quote',
      'sell',
      'card',
    ]);
    expect(tiles.filter((t) => t.primary).map((t) => t.id)).toEqual(['new-order']);
  });

  it('puts an order that is already going first, so no duplicate is made', () => {
    const tiles = carTiles(
      facts({ activeOrders: [{ id: 'o1', code: 'AO-00012', status: 'in_progress' }] }),
    );
    expect(tiles[0]).toMatchObject({
      id: 'order:o1',
      label: 'Öppna AO-00012',
      sub: 'Pågår',
      primary: true,
      result: { kind: 'go', commands: ['/workorders', 'o1'] },
    });
    expect(tiles.find((t) => t.id === 'new-order')?.label).toBe('Ny order ändå');
    expect(tiles.filter((t) => t.primary)).toHaveLength(1);
  });

  it('shows at most three open orders', () => {
    const many = ['a', 'b', 'c', 'd'].map((x) => ({
      id: x,
      code: `AO-${x}`,
      status: 'open' as const,
    }));
    expect(ids(facts({ activeOrders: many })).filter((i) => i.startsWith('order:'))).toHaveLength(
      3,
    );
  });

  it('offers the set in the hotel instead of leaving one in', () => {
    const f = facts({ storedSet: { id: 's1', code: 'DH-0042', location: 'Hylla H-12' } });
    const tiles = carTiles(f);
    expect(tiles[0]).toMatchObject({
      id: 'set',
      sub: 'DH-0042 · Hylla H-12',
      result: { kind: 'go', commands: ['/storage', 's1'] },
    });
    expect(ids(f)).not.toContain('hotel');
  });

  it('carries the customer and the car to the forms it opens', () => {
    const tiles = carTiles(facts());
    const link = { customerId: 'c1', vehicleId: 'v1' };
    expect(tiles.find((t) => t.id === 'quote')?.result).toEqual({
      kind: 'go',
      commands: ['/quotes/new'],
      queryParams: link,
    });
    expect(tiles.find((t) => t.id === 'hotel')?.result).toMatchObject({ queryParams: link });
    expect(tiles.find((t) => t.id === 'sell')?.result).toMatchObject({ queryParams: link });
    expect(tiles.find((t) => t.id === 'tyres')?.result).toEqual({ kind: 'order', job: 'Däckbyte' });
  });

  it('leaves out what the garage has not switched on', () => {
    const only = (...on: string[]) => ids(facts({ allows: (m) => on.includes(m) }));
    expect(only()).toEqual(['sell', 'card']);
    expect(only('arbetsorder')).toEqual(['new-order', 'tyres', 'quote', 'sell', 'card']);
    expect(only('dackhotell')).toEqual(['hotel', 'sell', 'card']);
  });
});

describe('codes', () => {
  it('knows our own labels, which can never be given to an article', () => {
    for (const c of [
      'AO-00012',
      'ao12',
      'DH-0042',
      'SK-3',
      'KF-9',
      'ART-00042',
      'HYLLA:abc',
      'https://x.se',
    ]) {
      expect(isOwnLabel(c)).toBe(true);
    }
    for (const c of ['7311234567890', 'BB-1', 'ABC123']) expect(isOwnLabel(c)).toBe(false);
  });

  it('tells an EAN from a supplier number', () => {
    expect(isEan('7311234567890')).toBe(true);
    expect(isEan('12345')).toBe(false);
    expect(isEan('BB-1')).toBe(false);
  });

  it('finds the garage’s own tyre job, or falls back to the text', () => {
    const svc = (name: string, active = true) => ({ name, active }) as ServiceType;
    expect(tyreJobName([svc('Bromsservice'), svc('Hjulbyte, 4 hjul')])).toBe('Hjulbyte, 4 hjul');
    expect(tyreJobName([svc('Däckbyte vinter', false)])).toBe('Däckbyte');
    expect(tyreJobName([])).toBe('Däckbyte');
  });
});
