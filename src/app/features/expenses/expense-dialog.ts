import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { format } from 'date-fns';
import { Auth } from '../../core/auth/auth';
import {
  EXPENSE_VAT_RATES,
  Expense,
  ExpenseApi,
  ExpensePaidWith,
  ExpenseProposal,
  ExpenseVat,
  ExpenseVatRate,
  vatOfGross,
} from '../../core/api/expense-api';
import { shrinkImage } from '../../core/image-resize';
import { Confirm } from '../../shared/confirm';
import { SharedModule } from '../../shared/shared-module';

export interface ExpenseDialogData {
  /** Ett kvitto som redan är valt (genvägen på Hem): det läses direkt när bladet öppnas. */
  file?: File;
  /** Utlägget bundet till en arbetsorder, bara internt (efterkalkyl). */
  workOrderId?: string | null;
  workOrderCode?: string | null;
  vehicleId?: string | null;
  /** Ett befintligt utlägg att ändra. */
  expense?: Expense;
}

/** `deleted` när utlägget togs bort här; annars det sparade utlägget. */
export interface ExpenseDialogResult {
  expense?: Expense;
  deleted?: boolean;
}

interface Row {
  rate: ExpenseVatRate;
  /** Kronor med moms; null medan fältet är tomt. */
  kr: number | null;
}

const ore = (kr: number | null | undefined) => Math.round((kr ?? 0) * 100);
const today = () => format(new Date(), 'yyyy-MM-dd');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Så mycket får momsraderna avvika från totalen (öresavrundning) innan det varnas; samma som servern. */
const TOLERANCE_ORE = 100;

/**
 * Lägg till eller ändra ett utlägg: ett kvitto för något som köpts vid sidan av, sparat för
 * bokföringen och revisorn. Gjort för mobilen och för en hand: "Fota kvittot" läser leverantör, datum,
 * summa och moms per sats, och allt går att ändra innan det sparas. Fungerar lika bra utan läsning
 * (avstängd, kvoten slut eller en suddig bild): då skriver man in det. Bara internt, kunden ser aldrig
 * ett utlägg.
 */
@Component({
  selector: 'app-expense-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>
      {{ editing() ? expense()!.code : 'Nytt utlägg' }}
    </h2>
    <mat-dialog-content class="!flex flex-col gap-3 !pt-2">
      <p class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        Internt för bokföringen. Syns aldrig för kunden och inte på utskrifter.
      </p>

      @if (locked()) {
        <app-callout tone="warn">
          <b>Överlämnat till revisorn.</b>
          @if (canForce()) {
            Ändrar du det ändå måste revisorn få veta.
          } @else {
            Bara ägaren kan ändra det nu.
          }
        </app-callout>
      }

      @if (demo()) {
        <app-callout tone="warn">
          Läsningen är inte påslagen här: uppgifterna nedan är ett exempel, inte vad kvittot säger.
        </app-callout>
      }

      <!-- Kvittot: fotot är det viktiga, resten kan skrivas in. -->
      <div class="flex flex-col gap-2 rounded-xl border border-gray-200 p-3">
        @if (preview() || file()) {
          <div class="flex items-center gap-3">
            @if (preview(); as src) {
              <img
                [src]="src"
                alt="Kvittot"
                class="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
              />
            } @else {
              <mat-icon class="!h-12 !w-12 shrink-0 !text-5xl text-gray-400"
                >picture_as_pdf</mat-icon
              >
            }
            <div class="min-w-0 flex-1 text-sm">
              <div class="truncate font-medium">{{ file()?.name }}</div>
              <div class="text-gray-600">
                @if (reading()) {
                  Läser kvittot…
                } @else if (readDone()) {
                  Kontrollera det som lästes in.
                } @else {
                  Sparas med utlägget.
                }
              </div>
            </div>
          </div>
          @if (reading()) {
            <mat-progress-bar mode="indeterminate" />
          }
        }
        @for (a of expense()?.attachments ?? []; track a.name) {
          <div class="flex items-center gap-2 text-sm">
            <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-500">{{
              a.type === 'application/pdf' ? 'picture_as_pdf' : 'image'
            }}</mat-icon>
            <button
              type="button"
              class="min-h-11 min-w-0 flex-1 truncate text-left font-medium text-brand"
              (click)="openAttachment(a.name)"
            >
              {{ a.label }}
            </button>
            <button
              type="button"
              mat-icon-button
              [disabled]="locked() && !forced()"
              aria-label="Ta bort kvittot"
              title="Ta bort kvittot"
              (click)="removeAttachment(a.name)"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          </div>
        }
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="!min-h-12 w-full !text-base"
          [disabled]="reading() || busy() || (locked() && !forced())"
          (click)="picker.click()"
        >
          <mat-icon>photo_camera</mat-icon>
          {{ file() || expense()?.attachments?.length ? 'Byt kvitto' : 'Fota kvittot' }}
        </button>
        <input
          #picker
          type="file"
          hidden
          accept="image/*,application/pdf"
          (change)="picked($event)"
        />
        @if (!file() && !editing()) {
          <p class="text-xs text-gray-500">
            Fota kvittot så fylls leverantör, datum, summa och moms i. Du kontrollerar innan det
            sparas, och du kan också skriva in allt själv.
          </p>
        }
      </div>

      <form [formGroup]="form" class="flex flex-col">
        <mat-form-field>
          <mat-label>Köpt av</mat-label>
          <input
            matInput
            formControlName="supplier"
            autocomplete="off"
            placeholder="t.ex. Biltema"
          />
          <mat-error>Ange vem du köpte av</mat-error>
        </mat-form-field>
        <div class="grid gap-x-3 sm:grid-cols-2">
          <app-date-field label="Datum" formControlName="date" [max]="maxDay" error="Ange datum" />
          <mat-form-field>
            <mat-label>Kvittonummer (valfritt)</mat-label>
            <input matInput formControlName="receiptNo" autocomplete="off" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Totalt (kr, inkl. moms)</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            [value]="total() ?? ''"
            (input)="setTotal($any($event.target).valueAsNumber)"
            (focus)="$any($event.target).select()"
          />
          <span matTextSuffix>kr</span>
        </mat-form-field>

        <!-- Moms per sats: ett kvitto kan blanda 6, 12 och 25 %. -->
        <div class="mb-1 flex items-center justify-between">
          <span class="sec">Moms</span>
          @if (rows().length < 4) {
            <button mat-button type="button" class="!min-h-10" (click)="addRow()">
              <mat-icon>add</mat-icon> Lägg till momssats
            </button>
          }
        </div>
        @for (r of rows(); track $index; let i = $index) {
          <div class="mb-2 flex items-start gap-2">
            <mat-form-field class="!w-28 shrink-0" subscriptSizing="dynamic">
              <mat-label>Sats</mat-label>
              <mat-select [value]="r.rate" (selectionChange)="setRate(i, $event.value)">
                @for (rate of rates; track rate) {
                  <mat-option [value]="rate">{{ rate }} %</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="min-w-0 flex-1">
              @if (rows().length > 1) {
                <mat-form-field class="w-full" subscriptSizing="dynamic">
                  <mat-label>Belopp inkl. moms</mat-label>
                  <input
                    matInput
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    [value]="r.kr ?? ''"
                    (input)="setRowKr(i, $any($event.target).valueAsNumber)"
                    (focus)="$any($event.target).select()"
                  />
                  <span matTextSuffix>kr</span>
                </mat-form-field>
              } @else {
                <div class="flex h-11 items-center text-sm text-gray-600">Hela beloppet</div>
              }
              <div class="px-1 pt-1 text-xs text-gray-500 tabular-nums">
                varav moms {{ rowVat(r) | kr }}
              </div>
            </div>
            @if (rows().length > 1) {
              <button
                type="button"
                mat-icon-button
                class="!mt-1 shrink-0"
                aria-label="Ta bort momssatsen"
                title="Ta bort momssatsen"
                (click)="removeRow(i)"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>
        }
        @if (vatNote(); as n) {
          <app-callout class="mb-2" tone="warn" [fixes]="vatFixes()">{{ n }}</app-callout>
        }

        <div class="sec mt-2 mb-1">Betalat med</div>
        <app-segmented
          class="mb-1"
          [fill]="true"
          label="Betalat med"
          [options]="[
            { value: 'company_card', label: 'Företagskort' },
            { value: 'private', label: 'Privat, ska ersättas' },
          ]"
          [value]="paidWith()"
          (valueChange)="paidWith.set($any($event))"
        />
        @if (paidHint(); as h) {
          <p class="mb-1 text-xs text-gray-500">{{ h }}</p>
        }

        <mat-form-field class="mt-2">
          <mat-label>Anteckning (valfritt)</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="note"
            placeholder="Vad köptes, och till vad?"
          ></textarea>
        </mat-form-field>

        @if (orderCode(); as c) {
          <div class="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
            <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-500">link</mat-icon>
            <span class="min-w-0 flex-1"
              >Hör till <b>{{ c }}</b> (internt, för efterkalkylen)</span
            >
            @if (!locked() || forced()) {
              <button type="button" mat-button (click)="unlinkOrder()">Koppla loss</button>
            }
          </div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions class="!flex-wrap">
      @if (editing() && (!locked() || forced())) {
        <button
          mat-button
          type="button"
          class="!text-red-700"
          [disabled]="busy()"
          (click)="remove()"
        >
          Ta bort
        </button>
      }
      <span class="flex-1"></span>
      @if (locked() && canForce() && !forced()) {
        <button mat-stroked-button type="button" (click)="forced.set(true)">Ändra ändå</button>
      }
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canSave()"
        (click)="save()"
      >
        {{ busy() ? 'Sparar…' : 'Spara' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ExpenseDialog implements OnInit {
  private readonly api = inject(ExpenseApi);
  private readonly auth = inject(Auth);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject<MatDialogRef<ExpenseDialog, ExpenseDialogResult>>(MatDialogRef);
  private readonly data = inject<ExpenseDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  readonly rates = EXPENSE_VAT_RATES;
  readonly maxDay = today();
  readonly expense = signal<Expense | null>(this.data?.expense ?? null);
  readonly editing = computed(() => !!this.expense());
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly reading = signal(false);
  readonly readDone = signal(false);
  readonly demo = signal(false);
  readonly busy = signal(false);
  /** Kvittot sa hur det betalades (kort, kontant, Swish). */
  private readonly payment = signal<ExpenseProposal['payment']>(null);
  private readonly mismatch = signal(false);

  readonly total = signal<number | null>(null);
  readonly rows = signal<Row[]>([{ rate: 25, kr: null }]);
  readonly paidWith = signal<ExpensePaidWith>('company_card');
  private readonly workOrder = signal<{ id: string; code: string | null } | null>(
    this.data?.workOrderId
      ? { id: this.data.workOrderId, code: this.data.workOrderCode ?? null }
      : null,
  );
  private readonly vehicleId = signal<string | null>(this.data?.vehicleId ?? null);
  readonly orderCode = computed(() => {
    const o = this.workOrder();
    return o ? (o.code ?? 'en arbetsorder') : null;
  });

  /** Ett utlägg som redan lämnats till revisorn: låst, utom för ägaren som uttryckligen väljer att ändra. */
  readonly locked = computed(() => this.expense()?.status === 'exported');
  readonly canForce = computed(() => this.auth.isAdmin() || this.auth.isSuperAdmin());
  readonly forced = signal(false);

  readonly form = new FormGroup({
    supplier: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    receiptNo: new FormControl('', { nonNullable: true }),
    date: new FormControl(today(), { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true }),
  });
  private readonly typed = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  private readonly totalOre = computed(() => ore(this.total()));
  private readonly rowSum = computed(() => this.rows().reduce((n, r) => n + ore(r.kr), 0));
  /** Det som saknas (+) eller är för mycket (−) när raderna jämförs med totalen, öre. */
  readonly diff = computed(() => this.totalOre() - this.rowSum());
  private readonly vatBad = computed(
    () => this.totalOre() > 0 && Math.abs(this.diff()) > TOLERANCE_ORE,
  );

  /** Varför momsen inte går att lita på, med knappen som rättar det. */
  readonly vatNote = computed(() => {
    if (this.vatBad()) {
      const text = `Momsraderna summerar till ${this.fmt(this.rowSum())} men kvittot är på ${this.fmt(this.totalOre())}`;
      return this.diff() > 0
        ? `${text}. Det saknar ${this.fmt(this.diff())}.`
        : `${text}. Det är ${this.fmt(-this.diff())} för mycket.`;
    }
    if (this.mismatch() && this.readDone()) {
      return 'Momsen på kvittot stämde inte riktigt med totalen. Titta på raderna så att de är rätt.';
    }
    return null;
  });
  readonly vatFixes = computed(() =>
    this.vatBad() && this.rows().length > 1
      ? [{ label: 'Fyll i det som saknas', click: () => this.fillRest() }]
      : [],
  );

  readonly paidHint = computed(() => {
    const p = this.payment();
    if (p === 'cash') return 'Kvittot säger att det betalades kontant.';
    if (p === 'swish') return 'Kvittot säger att det betalades med Swish.';
    if (p === 'card') return 'Kvittot säger att det betalades med kort.';
    return null;
  });

  readonly canSave = computed(() => {
    const v = this.typed();
    return (
      !this.busy() &&
      !this.reading() &&
      (!this.locked() || this.forced()) &&
      !!v.supplier?.trim() &&
      DAY.test(v.date ?? '') &&
      this.totalOre() > 0 &&
      this.rows().length > 0 &&
      !this.vatBad()
    );
  });

  constructor() {
    const e = this.data?.expense;
    if (e) {
      this.form.setValue({
        supplier: e.supplier,
        receiptNo: e.receiptNo ?? '',
        date: e.date,
        note: e.note ?? '',
      });
      this.total.set(e.totalIncl / 100);
      this.rows.set(e.vat.map((v) => ({ rate: v.rate, kr: v.gross / 100 })));
      this.paidWith.set(e.paidWith);
      this.workOrder.set(e.workOrder);
      this.vehicleId.set(e.vehicle?.id ?? null);
    }
    inject(DestroyRef).onDestroy(() => this.dropPreview());
  }

  ngOnInit() {
    if (this.data?.file) void this.take(this.data.file);
  }

  fmt(o: number) {
    return `${(o / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
  }

  /** Momsen i raden, öre: samma uträkning som servern kontrollerar. */
  rowVat(r: Row): number {
    return vatOfGross(ore(r.kr), r.rate);
  }

  // --- kvittot ---

  async picked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (f) await this.take(f);
  }

  /** Krymper fotot, visar det och försöker läsa det. Går läsningen inte skriver man in uppgifterna. */
  private async take(original: File) {
    // Ett kvitto har liten text: större och skarpare än en annonsbild.
    const small = await shrinkImage(original, 2400, 0.9);
    this.dropPreview();
    this.file.set(small);
    this.preview.set(small.type.startsWith('image/') ? URL.createObjectURL(small) : null);
    this.readDone.set(false);
    this.reading.set(true);
    this.api.read(small).subscribe({
      next: (p) => {
        this.reading.set(false);
        this.apply(p);
      },
      error: () => {
        this.reading.set(false);
        this.snack.open('Kvittot gick inte att läsa. Fyll i uppgifterna själv.', 'OK', {
          duration: 5000,
        });
      },
    });
  }

  private apply(p: ExpenseProposal) {
    this.demo.set(p.demo);
    this.readDone.set(true);
    this.mismatch.set(p.vatMismatch);
    this.payment.set(p.payment);
    // Bara det kvittot sa skrivs över; resten lämnas som det är.
    this.form.patchValue({
      supplier: p.supplier ?? this.form.controls.supplier.value,
      receiptNo: p.receiptNo ?? this.form.controls.receiptNo.value,
      date: p.date && p.date <= this.maxDay ? p.date : this.form.controls.date.value,
    });
    if (p.totalInclVat != null) this.total.set(p.totalInclVat / 100);
    if (p.vat.length) {
      this.rows.set(p.vat.map((v: ExpenseVat) => ({ rate: v.rate, kr: v.gross / 100 })));
    } else if (p.totalInclVat != null) {
      this.rows.set([{ rate: 25, kr: p.totalInclVat / 100 }]);
    }
  }

  private dropPreview() {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }

  openAttachment(name: string) {
    const e = this.expense();
    if (!e) return;
    this.api.attachment(e.id, name).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  removeAttachment(name: string) {
    const e = this.expense();
    if (!e) return;
    this.confirm
      .ask({
        title: 'Ta bort kvittot?',
        message: 'Bilden tas bort från utlägget. Du kan lägga till den igen.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api
          .removeAttachment(e.id, name, this.forced())
          .subscribe((next) => this.expense.set(next));
      });
  }

  // --- belopp och moms ---

  setTotal(v: number) {
    const kr = Number.isFinite(v) ? v : null;
    this.total.set(kr);
    // Med en enda momssats är hela beloppet den satsen.
    if (this.rows().length === 1) this.rows.update((rs) => [{ ...rs[0], kr }]);
  }

  setRate(i: number, rate: ExpenseVatRate) {
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, rate } : r)));
  }

  setRowKr(i: number, v: number) {
    const kr = Number.isFinite(v) ? v : null;
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, kr } : r)));
  }

  addRow() {
    const used = new Set(this.rows().map((r) => r.rate));
    const rate = this.rates.find((r) => !used.has(r)) ?? 25;
    this.rows.update((rs) => [...rs, { rate, kr: null }]);
  }

  removeRow(i: number) {
    this.rows.update((rs) => rs.filter((_, j) => j !== i));
    if (this.rows().length === 1) this.rows.update((rs) => [{ ...rs[0], kr: this.total() }]);
  }

  private fillRest() {
    const d = this.diff() / 100;
    this.rows.update((rs) =>
      rs.map((r, j) =>
        j === rs.length - 1
          ? { ...r, kr: Math.max(0, Math.round(((r.kr ?? 0) + d) * 100) / 100) }
          : r,
      ),
    );
  }

  unlinkOrder() {
    this.workOrder.set(null);
  }

  // --- spara och ta bort ---

  save() {
    if (!this.canSave()) return;
    const v = this.form.getRawValue();
    const vat: ExpenseVat[] = this.rows()
      .filter((r) => ore(r.kr) > 0)
      .map((r) => ({ rate: r.rate, gross: ore(r.kr), vat: vatOfGross(ore(r.kr), r.rate) }));
    const body = {
      supplier: v.supplier.trim(),
      receiptNo: v.receiptNo.trim() || null,
      date: v.date,
      totalIncl: this.totalOre(),
      vat,
      paidWith: this.paidWith(),
      note: v.note.trim() || null,
      workOrderId: this.workOrder()?.id ?? null,
      vehicleId: this.vehicleId(),
    };
    this.busy.set(true);
    const e = this.expense();
    const saved$ = e ? this.api.update(e.id, body, this.forced()) : this.api.create(body);
    saved$.subscribe({
      next: (saved) => this.keepReceipt(saved),
      error: () => this.busy.set(false),
    });
  }

  /** Fotot följer med utlägget. Går bara bilden fel är utlägget ändå sparat. */
  private keepReceipt(saved: Expense) {
    const f = this.file();
    if (!f) return this.done(saved);
    this.api.addAttachment(saved.id, f, this.forced()).subscribe({
      next: (withFile) => this.done(withFile),
      error: () => {
        this.snack.open(
          'Utlägget är sparat, men kvittot gick inte att spara. Öppna utlägget och lägg till det igen.',
          'OK',
          { duration: 7000 },
        );
        this.done(saved);
      },
    });
  }

  private done(saved: Expense) {
    this.busy.set(false);
    this.snack.open('Utlägget är sparat.', undefined, { duration: 2500 });
    this.ref.close({ expense: saved });
  }

  remove() {
    const e = this.expense();
    if (!e) return;
    this.confirm
      .ask({
        title: 'Ta bort utlägget?',
        message: `${e.code} och kvittot tas bort. Det går inte att ångra.`,
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.remove(e.id, this.forced()).subscribe({
          next: () => {
            this.busy.set(false);
            this.ref.close({ deleted: true });
          },
          error: () => this.busy.set(false),
        });
      });
  }
}
