import { buildTodo, todoBadges, todoInputOf, type TodoInput } from './todo';
import type { StorageSummary, Summary, TodoSnapshot } from './models';
import type { CarTodo } from '../shared/car-stock';

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
    // Ett utkast är vanligt jobb, inget fel: grått.
    expect(b['/sales']).toMatchObject({ text: '1 utkast', dot: 'bg-gray-400' });
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

  it('godkända offerter är en grön siffra och arbetsorder som väntar på del en gul', () => {
    const b = todoBadges(buildTodo(input({ quotes: { approved: 2, waiting: 0 }, partsOrders: 1 })));
    expect(b['/quotes'].text).toBe('2 godkända');
    expect(b['/quotes'].tone).toContain('green');
    expect(b['/workorders'].text).toBe('1 väntar på del');
    expect(b['/workorders'].tone).toContain('amber');
  });

  it('bokningsförfrågningar från bokningssidan är en grå siffra på Tidsbokning', () => {
    const b = todoBadges(buildTodo(input({ requests: 3 })));
    expect(b['/bookings'].text).toBe('3 förfrågningar');
    expect(b['/bookings'].tone).toContain('gray');
    expect(todoBadges(buildTodo(input({ requests: 1 })))['/bookings'].text).toBe('1 förfrågan');
    expect(todoBadges(buildTodo(input({ requests: 0 })))).toEqual({});
  });
});

describe('bilhandel', () => {
  const cars = (over: Partial<CarTodo> = {}): CarTodo => ({
    sellersMissing: 0,
    idle: 0,
    inspectionSoon: 0,
    unlisted: 0,
    ...over,
  });

  it('inköpta bilar utan uppgift om säljaren är en gul siffra på Bilar', () => {
    const b = todoBadges(buildTodo(input({ cars: cars({ sellersMissing: 2 }) })));
    expect(b['/dealership/cars'].text).toBe('2 saknar säljare');
    expect(b['/dealership/cars'].tone).toContain('amber');
    expect(todoBadges(buildTodo(input({ cars: cars() })))).toEqual({});
  });

  it('länkarna bär filtret så att siffran går att hitta i bil-listan', () => {
    const items = buildTodo(
      input({ cars: cars({ sellersMissing: 1, idle: 3, inspectionSoon: 2, unlisted: 1 }) }),
    );
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('car-sellers').params).toEqual({ flag: 'sellers' });
    expect(by('cars-idle').params).toEqual({ flag: 'idle' });
    expect(by('cars-inspection').params).toEqual({ flag: 'inspection' });
    expect(by('cars-unlisted').params).toEqual({ flag: 'unlisted' });
    expect(items.every((i) => i.product === 'hall')).toBe(true);
  });

  it('bilhandelns saker visas inte i verkstadens meny, och tvärtom', () => {
    const items = buildTodo(
      input({
        drafts: 1,
        hallDrafts: 2,
        invoices: { unpaid: 1, overdue: 0, amount: 100, more: false },
        hallInvoices: { unpaid: 3, overdue: 1, amount: 900, more: false },
      }),
    );
    const axle = todoBadges(items.filter((i) => i.product === 'axle'));
    const hall = todoBadges(items.filter((i) => i.product === 'hall'));
    expect(axle['/sales'].text).toBe('1 utkast');
    expect(axle['/finance/invoices'].text).toBe('1 obetald');
    expect(axle['/dealership/deals']).toBeUndefined();
    expect(hall['/dealership/deals'].text).toBe('2 utkast');
    expect(hall['/finance/invoices'].text).toBe('1 förfallen');
    expect(hall['/dealership/finance'].text).toBe('1 förfallen');
    expect(hall['/sales']).toBeUndefined();
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

describe('att fakturera (levererat ej fakturerat)', () => {
  it('gult "2 att fakturera" på Försäljning, och länken går till listan', () => {
    const items = buildTodo(input({ toInvoice: { due: 2, late: 0, amount: 500000 } }));
    const b = todoBadges(items);
    expect(b['/sales']).toMatchObject({ text: '2 att fakturera', dot: 'bg-amber-500' });
    expect(items.find((i) => i.key === 'to-invoice')?.link).toBe('/sales/to-invoice');
  });

  it('rött när en order borde ha fakturerats, och det väger tyngre än ett utkast', () => {
    const b = todoBadges(
      buildTodo(input({ drafts: 1, toInvoice: { due: 3, late: 1, amount: 0 } })),
    );
    expect(b['/sales']).toMatchObject({ text: '3 att fakturera', dot: 'bg-red-500' });
    expect(b['/sales'].hint).toContain('1 säljkort väntar på att bokföras');
  });

  it('inget när allt som är klart antingen är fakturerat eller väntar på månadens samlingsfaktura', () => {
    expect(todoBadges(buildTodo(input({ toInvoice: { due: 0, late: 0, amount: 0 } })))).toEqual({});
  });
});

describe('serverns svar blir listan', () => {
  const today = new Date('2026-11-15T10:00:00');
  const empty: TodoSnapshot = {
    stock: null,
    hotel: null,
    drafts: null,
    requests: null,
    partsOrders: null,
    quotes: null,
    toInvoice: null,
    cars: null,
    hallDrafts: null,
    invoices: null,
    hallInvoices: null,
  };

  it('en del som servern inte gett (modulen är av) ger inget i menyn', () => {
    expect(todoBadges(buildTodo(todoInputOf(empty, today)))).toEqual({});
  });

  it('förfallna fakturor räknas här, av förfallodatumet, inte av servern', () => {
    const input = todoInputOf(
      {
        ...empty,
        invoices: {
          total: 3,
          items: [
            { kind: 'invoice', dueAt: '2026-11-01', paidAt: null, total: 100000 },
            { kind: 'invoice', dueAt: '2026-11-30', paidAt: null, total: 50000 },
            { kind: 'invoice', dueAt: '2026-10-01', paidAt: null, total: 25000 },
          ],
        },
      },
      today,
    );
    expect(input.invoices).toEqual({ unpaid: 3, overdue: 2, amount: 175000, more: false });
    expect(todoBadges(buildTodo(input))['/finance/invoices'].text).toBe('2 förfallna');
  });

  it('"+" när fler fakturor finns än de hundra som skickas', () => {
    const items = Array.from({ length: 100 }, () => ({
      kind: 'invoice' as const,
      dueAt: '2026-12-01',
      paidAt: null,
      total: 1,
    }));
    expect(todoInputOf({ ...empty, invoices: { total: 130, items } }, today).invoices?.more).toBe(
      true,
    );
  });

  it('order att fakturera: samlingskunden väntar på månadens slut, de andra ska faktureras nu', () => {
    const input = todoInputOf(
      {
        ...empty,
        toInvoice: {
          customers: [
            {
              customer: { collectiveInvoice: true },
              orders: [{ doneAt: '2026-11-05T09:00:00', total: 100, card: null }],
            },
            {
              customer: { collectiveInvoice: false },
              orders: [
                { doneAt: '2026-11-05T09:00:00', total: 200, card: null },
                // Ligger redan på ett utkast: räknas som utkast, inte här.
                { doneAt: '2026-11-05T09:00:00', total: 400, card: { id: 'c1' } },
              ],
            },
          ],
        },
      },
      today,
    );
    expect(input.toInvoice).toEqual({ due: 1, late: 0, amount: 200 });
  });

  it('bilflaggorna räknas ur de få fält servern skickar', () => {
    const input = todoInputOf(
      {
        ...empty,
        cars: [
          {
            status: 'draft',
            createdAt: '2026-10-01T00:00:00.000Z',
            soldAt: null,
            inspectionDue: null,
            // Köpt utan moms och utan uppgift om säljaren (VMB), och inte utlagd på mer än 14 dagar.
            purchase: { vatRate: 0, date: '2026-10-01', seller: null, sellerId: null },
          },
        ],
      },
      today,
    );
    expect(input.cars).toEqual({ sellersMissing: 1, idle: 0, inspectionSoon: 0, unlisted: 1 });
  });

  it('utkast, förfrågningar och order som väntar på del kommer med', () => {
    const items = buildTodo(
      todoInputOf({ ...empty, drafts: 2, requests: 1, partsOrders: 3, hallDrafts: 1 }, today),
    );
    const keys = items.map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(['drafts', 'booking-requests', 'parts', 'hall-drafts']),
    );
  });
});
