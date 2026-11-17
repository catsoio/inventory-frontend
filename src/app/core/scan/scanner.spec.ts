import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ScanHit, StockCountApi } from '../api/stock-count-api';
import { Auth } from '../auth/auth';
import { Scanner } from './scanner';

const key = (k: string, target: Partial<HTMLElement> = { tagName: 'BODY' }) =>
  ({ key: k, target, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

function setup(hit: ScanHit, mechanic = false) {
  const navigate = vi.fn();
  const scan = vi.fn(() => of(hit));
  TestBed.configureTestingModule({
    providers: [
      { provide: StockCountApi, useValue: { scan } },
      { provide: Router, useValue: { navigate } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn(), openDialogs: [] } },
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
  return { navigate, scan, type, scanner: TestBed.inject(Scanner) };
}

describe('Scanner', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens what a fast burst of keys names', async () => {
    const { navigate, type } = setup({
      kind: 'deposit',
      id: 'd1',
      code: 'DH-0042',
      label: 'ABC123 · Anna',
    });
    type('DH-0042', 10);
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/storage', 'd1'], { queryParams: undefined }),
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
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  describe('as a mechanic', () => {
    const part: ScanHit = { kind: 'article', id: 'a1', code: 'ART-00001', label: 'x' };

    it('does nothing with a scan when no page is waiting for it', async () => {
      const { navigate, scan, type, scanner } = setup(part, true);
      type('7350001', 10);
      await scanner.handle('7350001');
      await scanner.openCode('7350001');
      await Promise.resolve();
      expect(scan).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
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
