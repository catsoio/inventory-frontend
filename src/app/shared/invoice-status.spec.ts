import { dueNote, invoiceStatus, daysPastDue, type Billable } from './invoice-status';
import { invoiceFigures, type InvoiceItem } from '../features/finance/invoices';

// Tisdag 27 oktober 2026, mitt på dagen.
const today = new Date(2026, 9, 27, 12, 0);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0).toISOString();

const invoice = (over: Partial<Billable> = {}): Billable => ({
  kind: 'invoice',
  dueAt: at(2026, 11, 26),
  paidAt: null,
  ...over,
});

describe('invoiceStatus', () => {
  it('an invoice before its due date is open, after it overdue, and paid when paid', () => {
    expect(invoiceStatus(invoice(), today)).toBe('open');
    expect(invoiceStatus(invoice({ dueAt: at(2026, 10, 27) }), today)).toBe('open');
    expect(invoiceStatus(invoice({ dueAt: at(2026, 10, 26) }), today)).toBe('overdue');
    expect(
      invoiceStatus(invoice({ dueAt: at(2026, 10, 1), paidAt: at(2026, 10, 20) }), today),
    ).toBe('paid');
  });

  it('a receipt is never overdue', () => {
    expect(invoiceStatus({ kind: 'receipt', dueAt: null, paidAt: null }, today)).toBe('open');
    expect(invoiceStatus({ kind: 'receipt', dueAt: at(2026, 1, 1), paidAt: null }, today)).toBe(
      'open',
    );
  });
});

describe('dueNote', () => {
  it('counts calendar days: today, days left, days late', () => {
    expect(dueNote(invoice({ dueAt: at(2026, 10, 27) }), today)).toBe('idag');
    expect(dueNote(invoice({ dueAt: at(2026, 10, 28) }), today)).toBe('om 1 dag');
    expect(dueNote(invoice(), today)).toBe('om 30 dagar');
    expect(dueNote(invoice({ dueAt: at(2026, 10, 26) }), today)).toBe('1 dag sen');
    expect(dueNote(invoice({ dueAt: at(2026, 10, 12) }), today)).toBe('15 dagar sen');
  });

  it('says nothing about what is paid, and nothing about a receipt', () => {
    expect(dueNote(invoice({ paidAt: at(2026, 10, 20) }), today)).toBe('');
    expect(dueNote({ kind: 'receipt', dueAt: null, paidAt: null }, today)).toBe('');
  });

  it('is right across the clock change at the end of October', () => {
    // Klockan ställs tillbaka söndag 25 oktober 2026: kalenderdagar, inte 24-timmarsperioder.
    expect(daysPastDue({ dueAt: at(2026, 10, 24) }, new Date(2026, 9, 26, 0, 30))).toBe(2);
  });
});

describe('invoiceFigures', () => {
  const item = (over: Partial<InvoiceItem>): InvoiceItem => ({
    id: 'x',
    source: 'card',
    kind: 'invoice',
    code: 'FAK-1',
    invoicedAt: at(2026, 10, 1),
    dueAt: at(2026, 11, 1),
    paidAt: null,
    paymentMethod: null,
    customerName: 'Taxi AB',
    regNo: 'ABC123',
    ref: 'SK-1',
    total: 100_000,
    ...over,
  });

  it('adds up what is unpaid, what is late and what came in lately', () => {
    const f = invoiceFigures(
      [
        item({ total: 100_000 }),
        item({ total: 250_000, dueAt: at(2026, 10, 20) }),
        item({ total: 40_000, dueAt: at(2026, 10, 10) }),
        item({ total: 70_000, paidAt: at(2026, 10, 15) }),
        item({ total: 90_000, paidAt: at(2026, 8, 1) }),
        item({ kind: 'receipt', dueAt: null, total: 30_000, paidAt: at(2026, 10, 27) }),
      ],
      today,
    );
    expect(f.unpaid).toEqual({ count: 3, sum: 390_000 });
    expect(f.overdue).toEqual({ count: 2, sum: 290_000, oldestDays: 17 });
    // Betalt senaste 30 dagarna: fakturan 15 okt och kvittot i dag, inte den från 1 aug.
    expect(f.paidRecently).toEqual({ count: 2, sum: 100_000 });
  });

  it('is empty when there is nothing', () => {
    expect(invoiceFigures([], today)).toEqual({
      unpaid: { count: 0, sum: 0 },
      overdue: { count: 0, sum: 0, oldestDays: 0 },
      paidRecently: { count: 0, sum: 0 },
    });
  });
});
