import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { StorageApi } from '../api/storage-api';
import { WorkOrderApi } from '../api/work-order-api';
import { WorkshopApi } from '../api/workshop-api';
import { Auth } from '../auth/auth';
import { Billing } from '../billing/billing';
import { Confirm } from '../../shared/confirm';
import { CarSheet } from './car-sheet';
import { UnknownCodeSheet } from './unknown-code-sheet';

const vehicle = {
  id: 'v1',
  customerId: 'c1',
  regNo: 'ABC123',
  make: 'Volvo',
  model: 'V70',
  year: 2012,
  color: 'Svart',
};
const order = (id: string, code: string, status: string) => ({ id, code, status, remarks: null });
const page = <T>(items: T[]) => of({ items, pagination: { total: items.length } });

interface Opts {
  mechanic?: boolean;
  own?: unknown[];
  free?: unknown[];
  stored?: unknown[];
}

function carSheet(o: Opts = {}) {
  const close = vi.fn();
  const claim = vi.fn(() => of({}));
  const progress = vi.fn(() => of({}));
  const list = vi.fn((q: { unassigned?: boolean }) => page((q.unassigned ? o.free : o.own) ?? []));
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: { vehicleId: 'v1', regNo: 'ABC123' } },
      {
        provide: WorkshopApi,
        useValue: {
          vehicle: () => of(vehicle),
          customer: () => of({ name: 'Anna Andersson', phone: '0701234567' }),
          serviceTypes: () => of([]),
        },
      },
      { provide: WorkOrderApi, useValue: { list, claim, progress } },
      { provide: StorageApi, useValue: { deposits: () => page(o.stored ?? []) } },
      { provide: Billing, useValue: { allows: () => true } },
      { provide: Auth, useValue: { isMechanic: () => !!o.mechanic } },
      { provide: Confirm, useValue: { ask: () => of(true) } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
    ],
  });
  const f = TestBed.createComponent(CarSheet);
  f.detectChanges();
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const buttons = () => [...el.querySelectorAll('button')] as HTMLButtonElement[];
  const button = (text: string) => buttons().find((b) => b.textContent?.includes(text));
  return { f, el, close, claim, progress, list, buttons, button };
}

describe('CarSheet', () => {
  it('shows the office the car, the customer and the next steps with the likeliest one big', () => {
    const { el, buttons, close } = carSheet();
    // Skylten ritas med ett mellanrum mellan bokstäver och siffror.
    expect(el.textContent).toContain('ABC 123');
    expect(el.textContent).toContain('Volvo V70 2012 · Svart');
    expect(el.textContent).toContain('Anna Andersson');
    expect(el.querySelector('a[href="tel:0701234567"]')).toBeTruthy();
    const tiles = buttons().filter((b) => b.hasAttribute('app-scan-tile'));
    expect(tiles.map((b) => b.querySelector('span')?.textContent?.trim())).toEqual([
      'Ny order',
      'Däckbyte',
      'Lämna in däck',
      'Offert',
      'Sälj',
      'Bilkortet',
    ]);
    expect(tiles[0].classList.contains('bg-brand')).toBe(true);
    expect(tiles[1].classList.contains('bg-brand')).toBe(false);
    tiles[0].click();
    expect(close).toHaveBeenCalledWith({ kind: 'order' });
  });

  it('puts an order that is already going first, and goes to it', () => {
    const { buttons, close } = carSheet({ own: [order('o1', 'AO-00012', 'in_progress')] });
    const first = buttons().find((b) => b.hasAttribute('app-scan-tile'))!;
    expect(first.textContent).toContain('Öppna AO-00012');
    expect(first.textContent).toContain('Pågår');
    first.click();
    expect(close).toHaveBeenCalledWith({ kind: 'go', commands: ['/workorders', 'o1'] });
  });

  it('offers the set in the hotel instead of leaving one in', () => {
    const { el } = carSheet({
      stored: [{ id: 's1', code: 'DH-0042', location: 'Hylla H-12', vehicle: { regNo: 'ABC123' } }],
    });
    expect(el.textContent).toContain('Däck i hotellet');
    expect(el.textContent).toContain('DH-0042 · Hylla H-12');
    expect(el.textContent).not.toContain('Lämna in däck');
  });

  describe('for a mechanic', () => {
    it('shows the car and own orders, never the customer or the office’s tiles', () => {
      const { el, button, progress, buttons } = carSheet({
        mechanic: true,
        own: [order('o1', 'AO-00012', 'open')],
      });
      expect(el.textContent).toContain('Volvo V70');
      expect(el.textContent).not.toContain('Anna Andersson');
      expect(el.querySelector('a[href^="tel:"]')).toBeFalsy();
      expect(buttons().some((b) => b.hasAttribute('app-scan-tile'))).toBe(false);
      button('Starta')!.click();
      expect(progress).toHaveBeenCalledWith('o1', { status: 'in_progress' });
    });

    it('goes to the order on Mina arbetsorder', () => {
      const { button, close } = carSheet({
        mechanic: true,
        own: [order('o1', 'AO-00012', 'open')],
      });
      button('Öppna')!.click();
      expect(close).toHaveBeenCalledWith({
        kind: 'go',
        commands: ['/workorders/mine'],
        queryParams: { open: 'o1' },
      });
    });

    it('takes an order nobody has, which then becomes theirs', () => {
      const { f, el, button, claim } = carSheet({
        mechanic: true,
        free: [order('o2', 'AO-00013', 'open')],
      });
      expect(el.textContent).toContain('Ej tilldelad');
      button('Ta ordern')!.click();
      f.detectChanges();
      expect(claim).toHaveBeenCalledWith('o2');
      expect(el.textContent).not.toContain('Ej tilldelad');
      expect(el.textContent).toContain('AO-00013');
      expect(button('Starta')).toBeTruthy();
    });

    it('says so when there is no order on the car', () => {
      const { el } = carSheet({ mechanic: true });
      expect(el.textContent).toContain('Ingen order på den här bilen.');
    });
  });
});

function unknown(code: string) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: { code } },
    ],
  });
  const f = TestBed.createComponent(UnknownCodeSheet);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const tile = (text: string) =>
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(text),
    );
  return { el, close, tile };
}

describe('UnknownCodeSheet', () => {
  it('lets the office link the code to an article, make a new one or scan again', () => {
    const { el, tile, close } = unknown('7311234567890');
    expect(el.textContent).toContain('7311234567890');
    expect(tile('Koppla till artikel')).toBeTruthy();
    tile('Ny artikel')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'go',
      commands: ['/inventory/new'],
      queryParams: { ean: '7311234567890' },
    });
    tile('Skanna igen')!.click();
    expect(close).toHaveBeenCalledWith({ kind: 'again' });
  });

  it('passes a supplier number on as the article number, not as an EAN', () => {
    const { tile, close } = unknown('BB-1234');
    tile('Ny artikel')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'go',
      commands: ['/inventory/new'],
      queryParams: { sku: 'BB-1234' },
    });
  });

  it('only offers a new scan for one of our own labels', () => {
    const { el, tile } = unknown('AO-99999');
    expect(el.textContent).toContain('egna etiketter');
    expect(tile('Koppla till artikel')).toBeFalsy();
    expect(tile('Ny artikel')).toBeFalsy();
    expect(tile('Skanna igen')).toBeTruthy();
  });
});
