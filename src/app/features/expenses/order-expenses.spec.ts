import { registerLocaleData } from '@angular/common';
import localeSv from '@angular/common/locales/sv';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { Expense, ExpenseApi } from '../../core/api/expense-api';
import { Auth } from '../../core/auth/auth';
import { Billing } from '../../core/billing/billing';
import { ExpenseOpener } from './open-expense';
import { OrderExpenses } from './order-expenses';

registerLocaleData(localeSv);

const settle = () => new Promise((r) => setTimeout(r, 0));

const expense = (id: string, supplier: string, totalIncl: number): Expense => ({
  id,
  number: 1,
  code: `UTL-0000${id}`,
  supplier,
  receiptNo: null,
  date: '2026-11-18',
  totalIncl,
  vat: [],
  paidWith: 'private',
  paidBy: 'u1',
  paidByName: null,
  note: null,
  workOrder: { id: 'o1', code: 'AO-00007' },
  vehicle: null,
  attachments: [],
  createdBy: 'u1',
  createdByName: null,
  createdAt: '',
  status: 'open',
  exportedAt: null,
});

function setup(opts: { mechanic?: boolean; admin?: boolean; bookkeeping?: boolean } = {}) {
  const list = vi.fn((_f: object) =>
    of({
      items: [expense('1', 'Biltema', 12500), expense('2', 'Clas Ohlson', 3000)],
      pagination: { total: 2, limit: 100, offset: 0 },
    }),
  );
  const open = vi.fn((_d: object) => Promise.resolve(undefined as unknown));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ExpenseApi, useValue: { list } },
      { provide: ExpenseOpener, useValue: { open } },
      {
        provide: Auth,
        useValue: { isMechanic: signal(!!opts.mechanic), isAdmin: signal(opts.admin ?? true) },
      },
      { provide: Billing, useValue: { allows: () => opts.bookkeeping ?? true } },
    ],
  });
  const f = TestBed.createComponent(OrderExpenses);
  f.componentRef.setInput('workOrderId', 'o1');
  f.componentRef.setInput('workOrderCode', 'AO-00007');
  f.componentRef.setInput('vehicleId', 'v1');
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  return { f, el, list, open };
}

describe('OrderExpenses', () => {
  it('lists the order’s expenses with a total for the office, and says they are internal', async () => {
    const t = setup();
    await settle();
    t.f.detectChanges();
    expect(t.list).toHaveBeenCalledWith({ workOrderId: 'o1' });
    expect(t.el.textContent).toContain('Biltema');
    expect(t.el.textContent).toContain('Clas Ohlson');
    expect(t.el.textContent).toContain('Totalt');
    expect(t.el.textContent).toContain('Visa i Ekonomi');
    expect(t.el.textContent).toContain('syns aldrig för kunden eller på utskriften');
  });

  it('shows a mechanic their expenses without a sum and without the way into Ekonomi', async () => {
    const t = setup({ mechanic: true, admin: false });
    await settle();
    t.f.detectChanges();
    expect(t.el.textContent).toContain('Biltema');
    expect(t.el.textContent).not.toContain('Totalt');
    expect(t.el.textContent).not.toContain('Visa i Ekonomi');
  });

  it('shows nothing at all when the garage has no bookkeeping', async () => {
    const t = setup({ bookkeeping: false });
    await settle();
    t.f.detectChanges();
    expect(t.el.textContent?.trim()).toBe('');
  });

  it('opens the sheet tied to the order and car, and reloads when something was saved', async () => {
    const t = setup();
    await settle();
    t.open.mockResolvedValueOnce({ expense: expense('3', 'Ny', 100) });
    const add = [...t.el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Lägg till utlägg'),
    )!;
    add.click();
    await settle();
    expect(t.open).toHaveBeenCalledWith({
      workOrderId: 'o1',
      workOrderCode: 'AO-00007',
      vehicleId: 'v1',
    });
    expect(t.list).toHaveBeenCalledTimes(2);
  });
});
