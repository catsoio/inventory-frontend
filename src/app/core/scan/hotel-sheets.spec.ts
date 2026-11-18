import { registerLocaleData } from '@angular/common';
import localeSv from '@angular/common/locales/sv';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AxleApi } from '../api/axle-api';
import { StockCountApi } from '../api/stock-count-api';
import { StorageApi } from '../api/storage-api';
import { GlobalSearch } from '../search/global-search';
import { StorageHomeMobile } from '../../features/storage/storage-home-mobile';
import { DepositSheet } from './deposit-sheet';
import { Scanner } from './scanner';
import { ShelfSheet } from './shelf-sheet';

/** Bladen laddas med `import()`, vilket kan ta längre än en sekund när hela sviten körs samtidigt. */
const until = <T>(check: () => T | Promise<T>) => vi.waitFor(check, { timeout: 8000 });

// Appen registrerar språkdata i app-module; `kr`-pipen behöver svenskan.
registerLocaleData(localeSv);

const page = <T>(items: T[]) => of({ items, pagination: { total: items.length } });

const deposit = (over: object = {}) => ({
  id: 'd1',
  code: 'DH-0042',
  status: 'stored',
  vehicle: { regNo: 'ABC123' },
  customer: { name: 'Anna Andersson', phone: '0701234567' },
  location: 'Däckhotellet · Hylla H-12',
  warehouseId: 'w1',
  locationId: 'l12',
  overdue: false,
  expectedPickupAt: null,
  pickedUpAt: null,
  paymentStatus: 'paid',
  fee: 80000,
  ...over,
});

function depositSheet(d = deposit(), shelf: unknown = null) {
  const close = vi.fn();
  const pickUp = vi.fn((id: string, body: object) => of({ ...d, status: 'picked_up', ...body }));
  const update = vi.fn((id: string, body: object) => of({ ...d, ...body }));
  const pickShelf = vi.fn(() => Promise.resolve(shelf));
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: { id: 'd1' } },
      { provide: StorageApi, useValue: { deposit: () => of(d), pickUp, update } },
      { provide: Scanner, useValue: { pickShelf, beep: vi.fn() } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
    ],
  });
  const f = TestBed.createComponent(DepositSheet);
  f.detectChanges();
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const tile = (text: string) =>
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(text),
    );
  return { f, el, close, pickUp, update, pickShelf, tile };
}

describe('DepositSheet', () => {
  it('shows who the set is and where it stands, with the next steps as tiles', () => {
    const { el, tile } = depositSheet();
    expect(el.textContent).toContain('DH-0042');
    expect(el.textContent).toContain('ABC 123');
    expect(el.textContent).toContain('Anna Andersson');
    expect(el.textContent).toContain('Hylla H-12');
    expect(el.querySelector('a[href="tel:0701234567"]')).toBeTruthy();
    expect(tile('Lämna ut')).toBeTruthy();
    expect(tile('Flytta hylla')).toBeTruthy();
    expect(tile('Öppna kortet')).toBeTruthy();
  });

  it('hands a paid set out after one confirmation', () => {
    const { f, tile, pickUp } = depositSheet();
    tile('Lämna ut')!.click();
    f.detectChanges();
    tile('Lämna ut DH-0042')!.click();
    expect(pickUp).toHaveBeenCalledTimes(1);
    expect(pickUp.mock.calls[0][0]).toBe('d1');
    expect(pickUp.mock.calls[0][1]).toMatchObject({ paymentMethod: undefined });
  });

  it('warns about an unpaid fee and an overdue set, and offers to take payment', () => {
    const { f, el, tile } = depositSheet(
      deposit({ paymentStatus: 'unpaid', overdue: true, expectedPickupAt: '2026-10-01T12:00:00Z' }),
    );
    expect(el.textContent).toContain('är inte betald');
    expect(el.textContent).toContain('Skulle ha hämtats 2026-10-01');
    tile('Lämna ut')!.click();
    f.detectChanges();
    expect(el.textContent).toContain('Ta betalt nu');
  });

  it('moves the set to the shelf that is scanned, but not to a shelf in the other warehouse', async () => {
    const own = depositSheet(deposit(), {
      kind: 'location',
      warehouseId: 'w1',
      locationId: 'l13',
      label: 'Däckhotellet · Hylla H-13',
      warehouseKind: 'customer',
    });
    own.tile('Flytta hylla')!.click();
    await until(() => expect(own.update).toHaveBeenCalledTimes(1));
    expect(own.update).toHaveBeenCalledWith('d1', { warehouseId: 'w1', locationId: 'l13' });
  });

  it('refuses a shelf in the goods warehouse', async () => {
    TestBed.resetTestingModule();
    const other = depositSheet(deposit(), {
      kind: 'location',
      warehouseId: 'w2',
      locationId: 'x',
      label: 'Huvudlager · Hylla B3',
      warehouseKind: 'own',
    });
    other.tile('Flytta hylla')!.click();
    await until(() => expect(other.pickShelf).toHaveBeenCalled());
    expect(other.update).not.toHaveBeenCalled();
  });

  it('only opens the card for a set that has been handed out', () => {
    const { el, tile } = depositSheet(
      deposit({ status: 'picked_up', pickedUpAt: '2026-11-01T12:00:00Z' }),
    );
    expect(el.textContent).toContain('Utlämnad 2026-11-01');
    expect(tile('Lämna ut')).toBeFalsy();
    expect(tile('Öppna kortet')).toBeTruthy();
  });
});

function shelfSheet(kind: 'customer' | 'own') {
  const close = vi.fn();
  const start = vi.fn(() => of({ id: 'c9' }));
  const here = { locationId: 'l12' };
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialogRef, useValue: { close } },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          kind: 'location',
          warehouseId: 'w1',
          locationId: 'l12',
          label: kind === 'customer' ? 'Däckhotellet · Hylla H-12' : 'Huvudlager · Hylla B3',
          warehouseKind: kind,
        },
      },
      {
        provide: StorageApi,
        useValue: { deposits: () => page([here, here, { locationId: 'other' }]) },
      },
      { provide: AxleApi, useValue: { articles: () => page([here, { locationId: 'other' }]) } },
      { provide: StockCountApi, useValue: { start } },
    ],
  });
  const f = TestBed.createComponent(ShelfSheet);
  f.detectChanges();
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const tile = (text: string) =>
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(text),
    );
  return { el, close, start, tile };
}

describe('ShelfSheet', () => {
  it('counts the sets on a hotel shelf and checks a set in there', () => {
    const { el, tile, close } = shelfSheet('customer');
    expect(el.textContent).toContain('Hylla H-12');
    expect(el.textContent).toContain('2 set på hyllan');
    tile('Lägg in här')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'go',
      commands: ['/storage/new'],
      queryParams: { scan: '1', warehouseId: 'w1', locationId: 'l12' },
    });
  });

  it('counts the articles on a shelf in the goods warehouse and receives there', () => {
    const { el, tile, close } = shelfSheet('own');
    expect(el.textContent).toContain('1 artikel på hyllan');
    tile('Ta emot här')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'go',
      commands: ['/inventory/receive'],
      queryParams: { warehouseId: 'w1', locationId: 'l12' },
    });
  });

  it('starts a count for just this shelf and opens it', () => {
    const { tile, close, start } = shelfSheet('customer');
    tile('Räkna hyllan')!.click();
    expect(start).toHaveBeenCalledWith({ kind: 'hotel', warehouseId: 'w1', locationId: 'l12' });
    expect(close).toHaveBeenCalledWith({ kind: 'go', commands: ['/inventory/counts', 'c9'] });
  });
});

describe('StorageHomeMobile', () => {
  const stored = (id: string, location: string, over: object = {}) => ({
    id,
    code: `DH-${id}`,
    status: 'stored',
    vehicle: { regNo: 'ABC123' },
    customer: { name: 'Anna', phone: '0701234567' },
    location,
    warehouseId: 'w1',
    locationId: `l-${location}`,
    overdue: false,
    expectedPickupAt: null,
    quantity: 4,
    ...over,
  });

  function home(deposits: object[]) {
    const openDialog = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Scanner, useValue: { openDialog } },
        { provide: GlobalSearch, useValue: { open } },
      ],
    });
    const f = TestBed.createComponent(StorageHomeMobile);
    f.componentRef.setInput('deposits', deposits);
    f.componentRef.setInput('summary', {
      stored: deposits.length,
      units: 0,
      unpaid: 0,
      unpaidAmount: 0,
      overdue: 1,
    });
    f.componentRef.setInput('loading', false);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const button = (text: string) =>
      ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
        b.textContent?.includes(text),
      );
    return { f, el, button, openDialog, open, router: TestBed.inject(Router) };
  }

  it('has the three big buttons: check in, hand out by scanning, and find by searching', () => {
    const { button, openDialog, open, router } = home([]);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    button('Lämna in')!.click();
    expect(navigate).toHaveBeenCalledWith(['/storage/new'], { queryParams: { scan: 1 } });
    button('Lämna ut')!.click();
    expect(openDialog).toHaveBeenCalled();
    button('Hitta')!.click();
    expect(open).toHaveBeenCalled();
  });

  it('lists who should have collected their set, with a call button', () => {
    const { el } = home([
      stored('1', 'Hylla H-1', {
        overdue: true,
        expectedPickupAt: '2026-10-01T12:00:00Z',
      }),
    ]);
    expect(el.textContent).toContain('Skulle ha hämtats');
    expect(el.querySelector('a[href="tel:0701234567"]')).toBeTruthy();
  });

  it('lists the shelves with their sets, six first, and checks in on a shelf with a tap', () => {
    const shelves = Array.from({ length: 8 }, (_, i) => stored(String(i), `Hylla H-${i + 1}`));
    const { f, el, button, router } = home(shelves);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    expect(el.textContent).toContain('Hylla H-1');
    expect(el.textContent).not.toContain('Hylla H-8');
    button('Visa alla 8 hyllor')!.click();
    f.detectChanges();
    expect(button('Visa färre')).toBeTruthy();
    const plus = el.querySelector('button[aria-label="Lägg in på Hylla H-1"]') as HTMLButtonElement;
    plus.click();
    expect(navigate).toHaveBeenCalledWith(['/storage/new'], {
      queryParams: { scan: 1, warehouseId: 'w1', locationId: 'l-Hylla H-1' },
    });
  });
});
