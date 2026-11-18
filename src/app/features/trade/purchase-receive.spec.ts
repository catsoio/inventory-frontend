import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PurchaseCardApi } from '../../core/api/purchase-card-api';
import { Pricing } from '../../core/pricing';
import { Scanner } from '../../core/scan/scanner';
import { Confirm } from '../../shared/confirm';
import { DocumentReadDialog } from './document-read-dialog';
import { PurchaseReceive } from './purchase-receive';

const article = (id: string, label: string) => ({
  id,
  label,
  brand: 'Bosch',
  model: label,
  sizeLabel: null,
  category: 'other',
  sku: null,
  location: null,
});

const line = (id: string, articleId: string, quantity: number, received: number) => ({
  id,
  articleId,
  quantity,
  unitCost: 10000,
  received,
  remaining: Math.max(0, quantity - received),
  extra: Math.max(0, received - quantity),
  article: article(articleId, `Del ${articleId}`),
});

const order = (over: object = {}) => ({
  id: 'c1',
  status: 'ordered',
  units: 6,
  receivedUnits: 2,
  receipts: [],
  attachments: [],
  documentTotal: null,
  documentCode: 'INK-00007',
  lines: [line('l1', 'a1', 4, 2), line('l2', 'a2', 2, 0)],
  ...over,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(card = order(), opts: { ask?: boolean } = {}) {
  let capture: ((code: string) => void) | undefined;
  const hits: Record<string, unknown> = {};
  const received = vi.fn((_id: string, _body: object) => of(order({ status: 'ordered' })));
  const api = {
    receive: received,
    update: vi.fn(() => of({})),
    addAttachment: vi.fn(() => of({})),
    removeAttachment: vi.fn(() => of({})),
    attachment: vi.fn(() => of(new Blob())),
    readDocument: vi.fn(),
  };
  const scanner = {
    capture: vi.fn((fn: (code: string) => void) => {
      capture = fn;
      return () => {};
    }),
    openDialog: vi.fn(),
    resolve: vi.fn((code: string) => Promise.resolve(hits[code] ?? { kind: 'none', code })),
    beep: vi.fn(),
    open: vi.fn(),
  };
  const ask = vi.fn(() => of(opts.ask ?? true));
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseCardApi, useValue: api },
      { provide: Scanner, useValue: scanner },
      { provide: Confirm, useValue: { ask } },
      { provide: Pricing, useValue: { costIncl: (n: number) => Math.round(n * 1.25) } },
    ],
  });
  const f = TestBed.createComponent(PurchaseReceive);
  // SharedModule gives the component its own MatSnackBar, which a provider in the test module does not
  // replace: take the instance the component really uses and watch it.
  const snack = {
    open: vi
      .spyOn(f.debugElement.injector.get(MatSnackBar), 'open')
      .mockReturnValue(undefined as never),
  };
  f.componentRef.setInput('card', card);
  const changed = vi.fn();
  f.componentInstance.changed.subscribe(changed);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const button = (text: string) =>
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(text),
    );
  const scan = async (code: string) => {
    capture!(code);
    await settle();
    f.detectChanges();
  };
  return { f, el, button, scan, hits, api, received, scanner, ask, snack, changed };
}

describe('PurchaseReceive', () => {
  it('shows ordered and received per line, and nothing to receive yet', () => {
    const { el, button } = setup();
    expect(el.textContent).toContain('2 av 6 st mottagna');
    expect(el.textContent).toContain('Beställt 4 · mottaget 2');
    expect(el.textContent).toContain('Beställt 2 · mottaget 0');
    expect(button('Ta emot 0 st')!.disabled).toBe(true);
  });

  it('counts a scanned article against its line, one more each scan', async () => {
    const t = setup();
    t.hits['7311'] = { kind: 'article', id: 'a2', label: 'Del a2', code: null };
    await t.scan('7311');
    await t.scan('7311');
    expect(t.button('Ta emot 2 st')).toBeTruthy();
    expect(t.el.textContent).toContain('Komplett');
  });

  it('says so when the article is not on the order, and counts nothing', async () => {
    const t = setup();
    t.hits['7399'] = { kind: 'article', id: 'zzz', label: 'Annan del', code: null };
    await t.scan('7399');
    expect(t.snack.open.mock.calls[0][0]).toContain('finns inte på den här ordern');
    expect(t.button('Ta emot 0 st')).toBeTruthy();
  });

  it('asks once about more than was ordered, and marks the surplus as extra', async () => {
    const t = setup();
    t.hits['7311'] = { kind: 'article', id: 'a1', label: 'Del a1', code: null };
    // 2 of 4 have come: two scans reach 4, the third goes over.
    await t.scan('7311');
    await t.scan('7311');
    expect(t.ask).not.toHaveBeenCalled();
    await t.scan('7311');
    expect(t.ask).toHaveBeenCalledTimes(1);
    await t.scan('7311');
    // Accepted once, not asked again.
    expect(t.ask).toHaveBeenCalledTimes(1);
    expect(t.el.textContent).toContain('Extra +2');
  });

  it('does not count the scan that goes over when it is refused', async () => {
    const t = setup(order(), { ask: false });
    t.hits['7311'] = { kind: 'article', id: 'a1', label: 'Del a1', code: null };
    for (let i = 0; i < 3; i++) await t.scan('7311');
    expect(t.button('Ta emot 2 st')).toBeTruthy();
  });

  it('receives everything that is left with one tap, then books it', async () => {
    const t = setup();
    t.button('Ta emot allt')!.click();
    t.f.detectChanges();
    expect(t.button('Ta emot 4 st')).toBeTruthy();
    t.button('Ta emot 4 st')!.click();
    expect(t.received).toHaveBeenCalledWith('c1', {
      lines: [
        { lineId: 'l1', quantity: 2 },
        { lineId: 'l2', quantity: 2 },
      ],
      place: null,
      close: false,
    });
    expect(t.changed).toHaveBeenCalled();
  });

  it('puts the goods on a scanned shelf in the goods warehouse, not on one in the hotel', async () => {
    const t = setup();
    t.hits['HYLLA:h'] = {
      kind: 'location',
      warehouseId: 'w2',
      locationId: 'x',
      label: 'Däckhotellet · H-1',
      warehouseKind: 'customer',
    };
    t.hits['HYLLA:b3'] = {
      kind: 'location',
      warehouseId: 'w1',
      locationId: 'l3',
      label: 'Huvudlager · Hylla B3',
      warehouseKind: 'own',
    };
    t.hits['7311'] = { kind: 'article', id: 'a2', label: 'Del a2', code: null };
    await t.scan('HYLLA:h');
    expect(t.el.textContent).not.toContain('Varorna läggs på');
    await t.scan('HYLLA:b3');
    expect(t.el.textContent).toContain('Varorna läggs på Huvudlager · Hylla B3');
    await t.scan('7311');
    t.button('Ta emot 1 st')!.click();
    expect(t.received.mock.calls[0][1]).toMatchObject({
      place: { warehouseId: 'w1', locationId: 'l3' },
    });
  });

  it('closes the order after asking, receiving what is scanned first', async () => {
    const t = setup();
    t.hits['7311'] = { kind: 'article', id: 'a2', label: 'Del a2', code: null };
    await t.scan('7311');
    t.button('Stäng beställningen')!.click();
    expect(t.ask).toHaveBeenCalled();
    expect(t.received).toHaveBeenCalledWith('c1', {
      lines: [{ lineId: 'l2', quantity: 1 }],
      place: null,
      close: true,
    });
  });

  it('checks the total on the paper against the order, with a krona of slack', () => {
    // 6 pieces at 100 kr net is 750 kr with VAT.
    const fits = setup(order({ documentTotal: 75000 }));
    expect(fits.el.textContent).toContain('Stämmer med beställningen');
    TestBed.resetTestingModule();
    const off = setup(order({ documentTotal: 70000 }));
    expect(off.el.textContent).toContain('Avviker 50 kr');
  });

  it('reads the delivery note: lines on the order are filled in, the rest is listed, the photo is kept', async () => {
    const t = setup();
    t.api.readDocument.mockReturnValue(
      of({
        demo: false,
        supplier: { name: 'Mekonomen', id: null },
        documentNo: 'F-1',
        orderNo: null,
        date: '2026-11-18',
        totalInclVat: 75000,
        linesIncludeVat: true,
        lines: [
          {
            description: 'Del a1',
            articleNo: null,
            ean: null,
            quantity: 2,
            unitCostIncl: 12500,
            match: { article: article('a1', 'Del a1'), via: 'ean' },
            candidates: [],
          },
          {
            description: 'Något annat',
            articleNo: null,
            ean: null,
            quantity: 1,
            unitCostIncl: 5000,
            match: null,
            candidates: [],
          },
        ],
      }),
    );
    const file = new File(['x'], 'foljesedel.pdf', { type: 'application/pdf' });
    const input = { files: [file], value: 'x' } as unknown as HTMLInputElement;
    await t.f.componentInstance.readPaper({ target: input } as unknown as Event);
    await settle();
    t.f.detectChanges();
    expect(t.button('Ta emot 2 st')).toBeTruthy();
    expect(t.el.textContent).toContain('Står på pappret men inte på ordern:');
    expect(t.el.textContent).toContain('Något annat');
    expect(t.api.addAttachment).toHaveBeenCalledWith('c1', file);
    // The paper's total was written on the card, since it had none.
    expect(t.api.update).toHaveBeenCalledWith('c1', { documentTotal: 75000 });
  });
});

describe('DocumentReadDialog', () => {
  const proposal = (over: object = {}) => ({
    demo: false,
    supplier: { name: 'Mekonomen AB', id: 'sup-1' },
    documentNo: 'F-88213',
    orderNo: null,
    date: '2026-11-18',
    totalInclVat: 125000,
    linesIncludeVat: true,
    lines: [
      {
        description: 'Bromsbelägg fram',
        articleNo: 'BB-1',
        ean: null,
        quantity: 2,
        unitCostIncl: 30000,
        match: { article: article('a1', 'Bosch Bromsbelägg'), via: 'code' },
        candidates: [],
      },
      {
        description: 'Bromsskiva ventilerad',
        articleNo: 'BS-9',
        ean: null,
        quantity: 1,
        unitCostIncl: 65000,
        match: null,
        candidates: [article('n1', 'Bromsskiva Bosch')],
      },
    ],
    ...over,
  });

  function dialog(p = proposal(), picked: unknown = null) {
    const close = vi.fn();
    const open = vi.fn(() => ({ afterClosed: () => of(picked) }));
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: { proposal: p } },
      ],
    });
    const f = TestBed.createComponent(DocumentReadDialog);
    // The component's own MatDialog (SharedModule provides one), so the chosen article comes from `picked`.
    vi.spyOn(f.debugElement.injector.get(MatDialog), 'open').mockImplementation(open as never);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const button = (text: string) =>
      ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) =>
        b.textContent?.includes(text),
      );
    return { f, el, button, close, open };
  }

  it('takes the matched line along and leaves one without an article until one is chosen', () => {
    const { el, button } = dialog();
    expect(el.textContent).toContain('Mekonomen AB');
    expect(el.textContent).toContain('Bosch Bromsbelägg');
    expect(button('Välj artikel')).toBeTruthy();
    expect(button('Lägg till 1 rad')).toBeTruthy();
    // One line of 600 kr against a paper of 1 250 kr: something is missing.
    expect(el.textContent).toContain('Raderna avviker');
  });

  it('says the lines fit once all of them are in', async () => {
    const { f, el, button } = dialog(proposal(), article('n1', 'Bromsskiva Bosch'));
    button('Välj artikel')!.click();
    // The choice goes through a lazily loaded dialog, which can take a moment under a full run.
    await vi.waitFor(
      () => {
        f.detectChanges();
        expect(button('Lägg till 2 rader')).toBeTruthy();
      },
      { timeout: 8000 },
    );
    expect(el.textContent).toContain('Raderna stämmer med summan på pappret.');
  });

  it('hands back the lines, and the paper’s own numbers for the articles that were chosen by hand', async () => {
    const { f, button, close } = dialog(proposal(), article('n1', 'Bromsskiva Bosch'));
    button('Välj artikel')!.click();
    await vi.waitFor(
      () => {
        f.detectChanges();
        expect(button('Lägg till 2 rader')).toBeTruthy();
      },
      { timeout: 8000 },
    );
    button('Lägg till 2 rader')!.click();
    expect(close).toHaveBeenCalledWith({
      rows: [
        { article: expect.objectContaining({ id: 'a1' }), quantity: 2, priceKr: 300 },
        { article: expect.objectContaining({ id: 'n1' }), quantity: 1, priceKr: 650 },
      ],
      supplierId: 'sup-1',
      documentNo: 'F-88213',
      date: '2026-11-18',
      totalInclVat: 125000,
      // The first line was matched by its number, so only the one chosen by hand is taught.
      taught: [{ articleId: 'n1', code: 'BS-9' }],
    });
  });

  it('warns that it is a sample when the reading is not switched on', () => {
    const { el } = dialog(proposal({ demo: true }));
    expect(el.textContent).toContain('ett exempel');
  });
});
