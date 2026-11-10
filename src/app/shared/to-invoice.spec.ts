import { invoiceStateOf, toInvoiceSummary } from './to-invoice';
import type { UnbilledCustomer } from '../core/models';

const today = new Date('2026-11-10T12:00:00');
const customer = (collective: boolean, doneAt: string[], card = false): UnbilledCustomer => ({
  customer: {
    id: collective ? 'pizza' : 'anna',
    code: 'KUN-00001',
    name: collective ? 'Pizzeria Napoli AB' : 'Anna',
    type: collective ? 'company' : 'private',
    collectiveInvoice: collective,
    paymentTermsDays: null,
  },
  orders: doneAt.map((d, i) => ({
    id: `o${i}`,
    code: `AO-0000${i}`,
    regNo: 'ABC123',
    vehicle: null,
    doneAt: d,
    yourReference: null,
    total: 10000,
    card: card ? { id: 's1', code: 'SK-00001' } : null,
  })),
  total: doneAt.length * 10000,
});

describe('när en klar arbetsorder ska faktureras', () => {
  it('en vanlig kund faktureras direkt', () => {
    expect(invoiceStateOf({ doneAt: '2026-11-09T10:00:00' }, false, today)).toBe('due');
  });

  it('samlingsfaktura: den här månadens order väntar, förra månadens ska faktureras nu', () => {
    expect(invoiceStateOf({ doneAt: '2026-11-02T10:00:00' }, true, today)).toBe('waiting');
    expect(invoiceStateOf({ doneAt: '2026-10-31T16:00:00' }, true, today)).toBe('due');
  });

  it('borde ha fakturerats när månaden efter arbetet är slut, för alla kunder', () => {
    expect(invoiceStateOf({ doneAt: '2026-09-30T10:00:00' }, true, today)).toBe('late');
    expect(invoiceStateOf({ doneAt: '2026-09-30T10:00:00' }, false, today)).toBe('late');
  });

  it('räknar inte det som väntar på samlingsfakturan eller redan ligger på ett utkast', () => {
    const s = toInvoiceSummary(
      [
        customer(true, ['2026-11-02T10:00:00', '2026-10-20T10:00:00', '2026-09-01T10:00:00']),
        customer(false, ['2026-11-08T10:00:00'], true),
      ],
      today,
    );
    expect(s).toEqual({ due: 2, late: 1, amount: 20000 });
  });
});
