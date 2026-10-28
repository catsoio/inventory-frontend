import { buildTodo, todoBadges, type TodoInput } from './todo';
import type { StorageSummary, Summary } from './models';

const hotel = (over: Partial<StorageSummary> = {}): StorageSummary => ({
  stored: 8,
  units: 32,
  unpaid: 0,
  unpaidAmount: 0,
  overdue: 0,
  ...over,
});

const stock = (over: Partial<Summary> = {}): Summary => ({
  articles: 7,
  units: 20,
  stockValue: 0,
  retailValue: 0,
  lowStock: 0,
  outOfStock: 0,
  reorderSoldOut: 0,
  reorderLow: 0,
  ...over,
});

const none: TodoInput = {
  stock: stock(),
  hotel: hotel(),
  drafts: 0,
  invoices: null,
  partsOrders: 0,
  quotes: { approved: 0, waiting: 0 },
};
const input = (over: Partial<TodoInput>): TodoInput => ({ ...none, ...over });

describe('menyns siffror', () => {
  it('visar ingenting när inget väntar, hur mycket som än ligger i hotellet', () => {
    // 8 set inlagrade är ett läge, inte något att göra: förut stod "8" där.
    expect(todoBadges(buildTodo(none))).toEqual({});
  });

  it('Däckmaster 2026-10-28: ett försenat set är röd "1 försenad", inte en röd total', () => {
    const items = buildTodo(
      input({
        hotel: hotel({ stored: 8, overdue: 1, unpaid: 4, unpaidAmount: 300000 }),
        stock: stock({ lowStock: 4, outOfStock: 1, reorderSoldOut: 1, reorderLow: 3 }),
        drafts: 1,
      }),
    );
    const b = todoBadges(items);
    expect(b['/storage'].text).toBe('1 försenad');
    expect(b['/storage'].tone).toContain('red');
    // det andra som väntar där syns i hjälptexten
    expect(b['/storage'].hint).toContain('4 obetalda hotellavgifter');
    expect(b['/inventory'].text).toBe('1 slut');
    expect(b['/inventory'].hint).toContain('3 artiklar att beställa');
    expect(b['/sales']).toMatchObject({ text: '1 utkast', dot: 'bg-amber-500' });
  });

  it('gul tills något är sent: obetalda hotellavgifter ensamma blir "4 obetalda"', () => {
    const b = todoBadges(buildTodo(input({ hotel: hotel({ unpaid: 4, unpaidAmount: 1 }) })));
    expect(b['/storage']).toMatchObject({ text: '4 obetalda', dot: 'bg-amber-500' });
  });

  it('en slut artikel räknas inte också som "att beställa"', () => {
    const items = buildTodo(
      input({ stock: stock({ lowStock: 1, outOfStock: 1, reorderSoldOut: 1, reorderLow: 0 }) }),
    );
    expect(items.map((i) => i.key)).toEqual(['sold-out']);
  });

  it('en slut artikel utan påminnelsenivå är inget att göra', () => {
    // outOfStock räknar alla med saldo 0, men bara de med nivå har bett om en påminnelse.
    const items = buildTodo(input({ stock: stock({ outOfStock: 3 }) }));
    expect(items).toEqual([]);
  });

  describe('fakturor', () => {
    it('obetalda inom tiden är gula, och siffran är antalet obetalda', () => {
      const b = todoBadges(
        buildTodo(input({ invoices: { unpaid: 3, overdue: 0, amount: 1000, more: false } })),
      );
      expect(b['/finance/invoices']).toMatchObject({ text: '3 obetalda', dot: 'bg-amber-500' });
      // Ekonomi (hopfälld grupp och mobilens "Mer") visar samma
      expect(b['/finance']).toEqual(b['/finance/invoices']);
    });

    it('förfallna är röda och siffran är antalet förfallna, inte alla obetalda', () => {
      const b = todoBadges(
        buildTodo(input({ invoices: { unpaid: 5, overdue: 2, amount: 1000, more: false } })),
      );
      expect(b['/finance/invoices']).toMatchObject({ text: '2 förfallna', dot: 'bg-red-500' });
      expect(b['/finance/invoices'].hint).toContain('5 obetalda fakturor, varav 2 förfallna');
    });

    it('ingen siffra utan obetalda fakturor', () => {
      expect(
        todoBadges(
          buildTodo(input({ invoices: { unpaid: 0, overdue: 0, amount: 0, more: false } })),
        )['/finance'],
      ).toBeUndefined();
    });
  });

  it('det mest brådskande vinner på ett menyval, och ordet följer antalet', () => {
    const b = todoBadges(
      buildTodo(input({ hotel: hotel({ overdue: 2, unpaid: 9, unpaidAmount: 1 }) })),
    );
    expect(b['/storage'].text).toBe('2 försenade');
  });

  it('sådant som bara är bra att veta blir aldrig en siffra, men finns kvar på Hem', () => {
    const items = buildTodo(input({ quotes: { approved: 0, waiting: 2 } }));
    expect(items.map((i) => i.key)).toEqual(['quotes-waiting']);
    expect(todoBadges(items)).toEqual({});
  });

  it('godkända offerter och arbetsorder som väntar på del får var sin gula siffra', () => {
    const b = todoBadges(buildTodo(input({ quotes: { approved: 2, waiting: 0 }, partsOrders: 1 })));
    expect(b['/quotes'].text).toBe('2 godkända');
    expect(b['/workorders'].text).toBe('1 väntar på del');
  });
});

describe('Att göra på Hem', () => {
  it('är samma lista som menyn, mest brådskande först', () => {
    const items = buildTodo(
      input({
        drafts: 2,
        hotel: hotel({ overdue: 1 }),
        stock: stock({ reorderLow: 2 }),
        quotes: { approved: 0, waiting: 1 },
      }),
    );
    expect(items.map((i) => [i.key, i.urgency])).toEqual([
      ['late-sets', 'urgent'],
      ['to-order', 'wait'],
      ['drafts', 'wait'],
      ['quotes-waiting', 'info'],
    ]);
  });

  it('länken bär filtret så att siffran går att hitta igen', () => {
    const items = buildTodo(
      input({
        stock: stock({ reorderSoldOut: 1, reorderLow: 3 }),
        hotel: hotel({ overdue: 1, unpaid: 2, unpaidAmount: 1 }),
      }),
    );
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('sold-out').params).toEqual({ lowStock: true, inStock: false });
    expect(by('to-order').params).toEqual({ lowStock: true, inStock: true });
    expect(by('late-sets').params).toEqual({ status: 'stored', overdue: true });
    // Summan räknar alla obetalda avgifter, så listan får inte vara begränsad till inlagrade.
    expect(by('unpaid-sets').params).toEqual({ status: '', paymentStatus: 'unpaid' });
  });
});
