import { registerLocaleData } from '@angular/common';
import localeSv from '@angular/common/locales/sv';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Expense, ExpenseApi, ExpenseProposal } from '../../core/api/expense-api';
import { Auth } from '../../core/auth/auth';
import { Confirm } from '../../shared/confirm';
import { ExpenseDialog, ExpenseDialogData } from './expense-dialog';

registerLocaleData(localeSv);

const settle = () => new Promise((r) => setTimeout(r, 0));

const receipt = new File(['%PDF-1.7'], 'kvitto.pdf', { type: 'application/pdf' });

const proposal = (over: Partial<ExpenseProposal> = {}): ExpenseProposal => ({
  demo: false,
  supplier: 'Biltema',
  receiptNo: '4711',
  date: '2026-11-18',
  totalInclVat: 24900,
  vat: [
    { rate: 25, gross: 18000, vat: 3600 },
    { rate: 12, gross: 6900, vat: 739 },
  ],
  vatMismatch: false,
  payment: 'card',
  ...over,
});

const saved = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  number: 7,
  code: 'UTL-00007',
  supplier: 'Biltema',
  receiptNo: null,
  date: '2026-11-18',
  totalIncl: 24900,
  vat: [{ rate: 25, gross: 24900, vat: 4980 }],
  paidWith: 'company_card',
  paidBy: 'u1',
  paidByName: 'Ägaren',
  note: null,
  workOrder: null,
  vehicle: null,
  attachments: [],
  createdBy: 'u1',
  createdByName: 'Ägaren',
  createdAt: '2026-11-18T10:00:00Z',
  status: 'open',
  exportedAt: null,
  ...over,
});

function setup(data: ExpenseDialogData = {}, opts: { read?: () => unknown; admin?: boolean } = {}) {
  const api = {
    read: vi.fn(opts.read ?? (() => of(proposal()))),
    create: vi.fn((_b: object) => of(saved())),
    update: vi.fn((_id: string, _b: object, _force?: boolean) => of(saved())),
    addAttachment: vi.fn((_id: string, _f: File, _force?: boolean) =>
      of(
        saved({
          attachments: [
            { name: 'a.pdf', label: 'kvitto.pdf', type: 'application/pdf', size: 8, addedAt: '' },
          ],
        }),
      ),
    ),
    remove: vi.fn(() => of({})),
    attachment: vi.fn(() => of(new Blob())),
    removeAttachment: vi.fn(() => of(saved())),
  };
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: ExpenseApi, useValue: api },
      {
        provide: Auth,
        useValue: { isAdmin: signal(opts.admin ?? true), isSuperAdmin: signal(false) },
      },
      { provide: Confirm, useValue: { ask: () => of(true) } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  });
  const f = TestBed.createComponent(ExpenseDialog);
  // The component has its own MatSnackBar through SharedModule: watch that instance.
  vi.spyOn(f.debugElement.injector.get(MatSnackBar), 'open').mockReturnValue(undefined as never);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const button = (text: string) =>
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(text),
    );
  const field = (label: string) =>
    [...el.querySelectorAll('mat-form-field')]
      .find((m) => m.querySelector('mat-label')?.textContent?.includes(label))
      ?.querySelector('input,textarea') as HTMLInputElement;
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    await settle();
    f.detectChanges();
  };
  const read = async () => {
    await vi.waitFor(() => expect(api.read).toHaveBeenCalled(), { timeout: 8000 });
    await settle();
    f.detectChanges();
  };
  return { f, el, api, close, button, field, type, read };
}

describe('ExpenseDialog', () => {
  it('fills the form from a receipt with two VAT rates, ready to save', async () => {
    const t = setup({ file: receipt });
    await t.read();
    expect(t.field('Köpt av').value).toBe('Biltema');
    expect(t.field('Kvittonummer').value).toBe('4711');
    expect(t.field('Totalt').value).toBe('249');
    expect(t.el.textContent).toContain('Moms');
    expect(t.el.textContent).toContain('Kontrollera det som lästes in.');
    expect(t.el.textContent).toContain('Kvittot säger att det betalades med kort.');
    expect(t.el.textContent).not.toContain('summerar till');
    expect(t.button('Spara')!.disabled).toBe(false);
  });

  it('saves the receipt’s VAT per rate in öre, then keeps the photo on the expense', async () => {
    const t = setup({
      file: receipt,
      workOrderId: 'o1',
      workOrderCode: 'AO-00007',
      vehicleId: 'v1',
    });
    await t.read();
    t.button('Spara')!.click();
    await settle();
    expect(t.api.create).toHaveBeenCalledWith({
      supplier: 'Biltema',
      receiptNo: '4711',
      date: '2026-11-18',
      totalIncl: 24900,
      vat: [
        { rate: 25, gross: 18000, vat: 3600 },
        { rate: 12, gross: 6900, vat: 739 },
      ],
      paidWith: 'company_card',
      note: null,
      // The link to the order is internal, for the after-calculation only.
      workOrderId: 'o1',
      vehicleId: 'v1',
    });
    expect(t.api.addAttachment).toHaveBeenCalledWith('e1', expect.any(File), false);
    expect(t.close).toHaveBeenCalledWith({ expense: expect.objectContaining({ id: 'e1' }) });
  });

  it('warns when the reading’s VAT does not make the total, and will not save until it does', async () => {
    const t = setup(
      { file: receipt },
      {
        read: () =>
          of(proposal({ vatMismatch: true, vat: [{ rate: 25, gross: 18000, vat: 3600 }] })),
      },
    );
    await t.read();
    expect(t.el.textContent).toContain('Momsraderna summerar till');
    expect(t.el.textContent).toContain('Det saknar');
    // A single rate follows the total, so a mismatch with several rows is what shows here.
    expect(t.button('Spara')!.disabled).toBe(true);
  });

  it('lets the missing amount be put on the last row', async () => {
    const t = setup(
      { file: receipt },
      {
        read: () =>
          of(
            proposal({
              vatMismatch: true,
              vat: [
                { rate: 25, gross: 18000, vat: 3600 },
                { rate: 12, gross: 5000, vat: 536 },
              ],
            }),
          ),
      },
    );
    await t.read();
    expect(t.button('Spara')!.disabled).toBe(true);
    t.button('Fyll i det som saknas')!.click();
    t.f.detectChanges();
    expect(t.button('Spara')!.disabled).toBe(false);
    expect(t.el.textContent).not.toContain('summerar till');
  });

  it('works without any reading: type it in, and one VAT rate follows the total', async () => {
    const t = setup({});
    expect(t.button('Spara')!.disabled).toBe(true);
    await t.type(t.field('Köpt av'), 'Clas Ohlson');
    await t.type(t.field('Totalt'), '125');
    expect(t.button('Spara')!.disabled).toBe(false);
    t.button('Spara')!.click();
    await settle();
    expect(t.api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier: 'Clas Ohlson',
        totalIncl: 12500,
        vat: [{ rate: 25, gross: 12500, vat: 2500 }],
      }),
    );
    expect(t.api.addAttachment).not.toHaveBeenCalled();
  });

  it('falls back to typing when the reading fails', async () => {
    const t = setup({ file: receipt }, { read: () => throwError(() => new Error('502')) });
    await t.read();
    expect(t.el.textContent).not.toContain('Kontrollera det som lästes in.');
    await t.type(t.field('Köpt av'), 'Biltema');
    await t.type(t.field('Totalt'), '99');
    expect(t.button('Spara')!.disabled).toBe(false);
  });

  it('says clearly when the reading is the stand-in', async () => {
    const t = setup({ file: receipt }, { read: () => of(proposal({ demo: true })) });
    await t.read();
    expect(t.el.textContent).toContain('ett exempel, inte vad kvittot säger');
  });

  it('shows what it belongs to and lets it be unlinked', async () => {
    const t = setup({ workOrderId: 'o1', workOrderCode: 'AO-00007' });
    expect(t.el.textContent).toContain('AO-00007');
    t.button('Koppla loss')!.click();
    t.f.detectChanges();
    expect(t.el.textContent).not.toContain('AO-00007');
  });

  it('locks an expense handed to the auditor, and the owner may change it anyway, explicitly', async () => {
    const e = saved({ status: 'exported', exportedAt: '2026-12-01T00:00:00Z' });
    const t = setup({ expense: e });
    expect(t.el.textContent).toContain('Överlämnat till revisorn.');
    expect(t.button('Spara')!.disabled).toBe(true);
    t.button('Ändra ändå')!.click();
    t.f.detectChanges();
    expect(t.button('Spara')!.disabled).toBe(false);
    t.button('Spara')!.click();
    await settle();
    expect(t.api.update).toHaveBeenCalledWith('e1', expect.any(Object), true);
  });

  it('gives staff no way past the lock', () => {
    const t = setup({ expense: saved({ status: 'exported' }) }, { admin: false });
    expect(t.el.textContent).toContain('Bara ägaren kan ändra det nu.');
    expect(t.button('Ändra ändå')).toBeUndefined();
    expect(t.button('Spara')!.disabled).toBe(true);
  });
});
