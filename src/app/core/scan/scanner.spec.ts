import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { vi } from 'vitest';
import { ScanHit, StockCountApi } from '../api/stock-count-api';
import { Auth } from '../auth/auth';
import { Scanner } from './scanner';

/** Bladen laddas med `import()`, vilket kan ta längre än en sekund när hela sviten körs samtidigt. */
const until = <T>(check: () => T | Promise<T>) => vi.waitFor(check, { timeout: 8000 });

const key = (k: string, target: Partial<HTMLElement> = { tagName: 'BODY' }) =>
  ({ key: k, target, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

/**
 * `closed` är det varje öppnat blad eller dialog svarar med, i tur och ordning (ett tomt svar när
 * listan är slut). `NEVER` är ett blad som aldrig stängs.
 */
function setup(hit: ScanHit, mechanic = false, closed: unknown[] = []) {
  const navigate = vi.fn();
  const scan = vi.fn(() => of(hit));
  const snack = { open: vi.fn() };
  // Varje öppnat blad svarar med nästa i kön; ett tomt svar när den är slut.
  const answers = [...closed];
  const open = vi.fn((..._args: unknown[]) => {
    const next = answers.shift();
    return { afterClosed: () => (next === NEVER ? NEVER : of(next)) };
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: StockCountApi, useValue: { scan } },
      { provide: Router, useValue: { navigate } },
      { provide: MatSnackBar, useValue: snack },
      { provide: MatDialog, useValue: { open, openDialogs: [] } },
      { provide: Auth, useValue: { isMechanic: () => mechanic } },
    ],
  });
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const type = (text: string, gap: number, target?: Partial<HTMLElement>) => {
    const s = TestBed.inject(Scanner);
    for (const ch of text) {
      t += gap;
      s.onKey(key(ch, target));
    }
    t += gap;
    s.onKey(key('Enter', target));
  };
  return { navigate, scan, snack, open, type, scanner: TestBed.inject(Scanner) };
}

const car: ScanHit = { kind: 'vehicle', id: 'v1', code: 'ABC123', label: 'ABC123' };
const part: ScanHit = { kind: 'article', id: 'a1', code: 'ART-00001', label: 'x' };
const nothing: ScanHit = { kind: 'none', code: '7311234567890' };

describe('Scanner', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens what a fast burst of keys names: a set gets its sheet', async () => {
    const { open, navigate, type } = setup({
      kind: 'deposit',
      id: 'd1',
      code: 'DH-0042',
      label: 'ABC123 · Anna',
    });
    type('DH-0042', 10);
    await until(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][1]).toMatchObject({ data: { id: 'd1' } });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens a shelf’s sheet and goes where a tile of it points', async () => {
    const shelf = {
      kind: 'location' as const,
      warehouseId: 'w1',
      locationId: 'l1',
      label: 'Däckhotellet · Hylla H-1',
      warehouseKind: 'customer' as const,
    };
    const { open, navigate, scanner } = setup(shelf, false, [
      { kind: 'go', commands: ['/storage/new'], queryParams: { scan: '1' } },
    ]);
    await scanner.handle('HYLLA:l1');
    await until(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][1]).toMatchObject({ data: shelf });
    await until(() =>
      expect(navigate).toHaveBeenCalledWith(['/storage/new'], { queryParams: { scan: '1' } }),
    );
  });

  it('ignores slow typing, and typing inside a field', async () => {
    const { navigate, type } = setup({ kind: 'deposit', id: 'd1', code: 'DH-0042', label: 'x' });
    type('DH-0042', 400);
    type('DH-0042', 10, { tagName: 'INPUT' });
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hands raw codes to a page that captures them, until it lets go', async () => {
    const { navigate, type, scanner } = setup({
      kind: 'article',
      id: 'a1',
      code: 'ART-00001',
      label: 'x',
    });
    const got: string[] = [];
    const release = scanner.capture((c) => got.push(c));
    type('7350001', 10);
    await Promise.resolve();
    expect(got).toEqual(['7350001']);
    expect(navigate).not.toHaveBeenCalled();
    release();
    type('7350001', 10);
    await until(() => expect(navigate).toHaveBeenCalled());
  });

  describe('a car', () => {
    it('opens the car sheet instead of the car card', async () => {
      const { navigate, open, scanner } = setup(car);
      await scanner.handle('ABC123');
      await until(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0][1]).toMatchObject({ data: { vehicleId: 'v1', regNo: 'ABC123' } });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('goes where a tile of the sheet points', async () => {
      const { navigate, scanner } = setup(car, false, [
        { kind: 'go', commands: ['/workorders', 'o1'] },
      ]);
      await scanner.handle('ABC123');
      await until(() =>
        expect(navigate).toHaveBeenCalledWith(['/workorders', 'o1'], { queryParams: undefined }),
      );
    });

    it('starts a new order without asking about a duplicate again when the sheet said so', async () => {
      const { open, scanner } = setup(car, false, [{ kind: 'order', job: 'Däckbyte' }]);
      await scanner.handle('ABC123');
      await until(() => expect(open).toHaveBeenCalledTimes(2));
      expect(open.mock.calls[1][1]).toMatchObject({
        data: { regNo: 'ABC123', job: 'Däckbyte', forceNew: true },
      });
    });

    it('does not stack a second sheet on one that is open', async () => {
      const { open, scanner } = setup(car, false, [NEVER]);
      void scanner.handle('ABC123');
      await until(() => expect(open).toHaveBeenCalledTimes(1));
      await scanner.handle('ABC123');
      await Promise.resolve();
      expect(open).toHaveBeenCalledTimes(1);
    });
  });

  describe('a code nobody knows', () => {
    it('opens the sheet that lets the office say what it is', async () => {
      const { open, snack, scanner } = setup(nothing);
      await scanner.handle('7311234567890');
      await until(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0][1]).toMatchObject({ data: { code: '7311234567890' } });
      expect(snack.open).not.toHaveBeenCalled();
    });

    it('goes to a new article when the sheet says so', async () => {
      const { navigate, scanner } = setup(nothing, false, [
        { kind: 'go', commands: ['/inventory/new'], queryParams: { ean: '7311234567890' } },
      ]);
      await scanner.handle('7311234567890');
      await until(() =>
        expect(navigate).toHaveBeenCalledWith(['/inventory/new'], {
          queryParams: { ean: '7311234567890' },
        }),
      );
    });

    it('opens the article the code was linked to', async () => {
      const { navigate, snack, scanner } = setup(nothing, false, [
        { kind: 'linked', article: { id: 'a9', label: 'Bosch Bromsbelägg' } },
      ]);
      await scanner.handle('7311234567890');
      await until(() =>
        expect(navigate).toHaveBeenCalledWith(['/inventory', 'a9'], { queryParams: undefined }),
      );
      expect(snack.open.mock.calls[0][0]).toContain('Bosch Bromsbelägg');
    });
  });

  describe('as a mechanic', () => {
    it('gets the car sheet for a plate, even when no page is waiting for a scan', async () => {
      const { open, navigate, type, scanner } = setup(car, true);
      type('ABC123', 10);
      await until(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0][1]).toMatchObject({ data: { vehicleId: 'v1' } });
      expect(navigate).not.toHaveBeenCalled();
      expect(scanner).toBeTruthy();
    });

    it('is told to open an order for a part, since there is no article page for the role', async () => {
      const { navigate, open, snack, scanner } = setup(part, true);
      await scanner.handle('7350001');
      expect(snack.open.mock.calls[0][0]).toContain('order');
      expect(navigate).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });

    it('is told when a code is unknown, without a sheet to create articles with', async () => {
      const { open, snack, scanner } = setup(nothing, true);
      await scanner.handle('7311234567890');
      expect(snack.open.mock.calls[0][0]).toContain('7311234567890');
      expect(open).not.toHaveBeenCalled();
    });

    it('cannot add a car that is not in the register: the office does that', async () => {
      const { open, snack, scanner } = setup(nothing, true);
      await scanner.startForNewCar('XYZ789');
      expect(snack.open.mock.calls[0][0]).toContain('XYZ789');
      expect(open).not.toHaveBeenCalled();
    });

    it('hands the code to the page that waits for it (the order they work on)', async () => {
      const { navigate, type, scanner } = setup(part, true);
      const got: string[] = [];
      scanner.capture((c) => got.push(c));
      type('7350001', 10);
      await Promise.resolve();
      expect(got).toEqual(['7350001']);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
