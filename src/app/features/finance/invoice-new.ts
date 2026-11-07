import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AxleApi } from '../../core/api/axle-api';
import { WorkOrderApi } from '../../core/api/work-order-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import { InvoiceKind, PaymentMethod, paymentOptions, SellerDetails } from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';
import { ensureValid } from '../../shared/form-guard';
import { Gap, invoiceGap, sellerGap } from '../../shared/invoice-gap';
import { openSettings } from '../settings/settings';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import type { PickerValue } from '../../shared/customer-vehicle-picker/customer-vehicle-picker';

/**
 * Kortet för att lägga till en gammal faktura eller ett gammalt kvitto (arbete som gjordes innan
 * systemet användes). Man väljer om det var en faktura eller ett kvitto. Vid Spara skapas en klar
 * arbetsorder som bokförs direkt med det datum man anger och nästa löpnummer, så den syns på
 * kundens och bilens historik och i Ekonomi. En ny faktura skrivs som ett säljkort.
 */
@Component({
  selector: 'app-invoice-new',
  standalone: false,
  template: `
    <app-card-page
      listLink="/finance/invoices"
      listLabel="Fakturor"
      newTitle="Lägg till gammal faktura"
    >
      <div actions class="flex items-center gap-2">
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="save()"
          [disabled]="busy() || !!gap()"
        >
          Spara
        </button>
      </div>
      <form [formGroup]="form" class="flex flex-col gap-4">
        <p class="rounded-lg bg-white p-4 text-sm text-gray-600 shadow-sm">
          För arbete som gjordes innan ni började använda systemet. När du sparar bokförs dokumentet
          direkt med datumet nedan och får nästa nummer, och går sedan inte att ändra. Ska du skriva
          en ny faktura till en kund, gör du det som ett
          <a class="text-brand" routerLink="/sales/new" [queryParams]="{ kind: 'invoice' }"
            >säljkort</a
          >.
        </p>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <app-customer-vehicle-picker formControlName="link" [vehicleOptional]="true" />
          @if (gap(); as g) {
            <app-callout class="mt-3" [fixes]="g.fixes">{{ g.text }}</app-callout>
          }
        </section>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Vad var det?</h2>
          <mat-radio-group
            formControlName="kind"
            class="grid gap-3 sm:grid-cols-2"
            aria-label="Faktura eller kvitto"
          >
            <label class="choice" [class.is-on]="kind() === 'invoice'">
              <mat-radio-button value="invoice" class="font-medium">Faktura</mat-radio-button>
              <span class="choice-text">Kunden fick betala i efterhand, med förfallodatum.</span>
            </label>
            <label class="choice" [class.is-on]="kind() === 'receipt'">
              <mat-radio-button value="receipt" class="font-medium">Kvitto</mat-radio-button>
              <span class="choice-text">Kunden betalade på stället.</span>
            </label>
          </mat-radio-group>
        </section>
        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
          <h2 class="mb-2 text-base font-semibold sm:col-span-6">
            {{ kind() === 'invoice' ? 'Faktura' : 'Kvitto' }}
          </h2>
          <app-date-field
            class="sm:col-span-3"
            [label]="kind() === 'invoice' ? 'Fakturadatum' : 'Datum'"
            icon="event"
            error="Ange datum"
            formControlName="date"
          />
          <div class="mt-2 sm:col-span-6">
            <h3 class="mb-2 text-sm font-medium">Rader</h3>
            <div class="mb-1 hidden grid-cols-[1fr_5rem_8rem_7rem_2.5rem] gap-2 text-xs text-gray-500 sm:grid">
              <span>Text</span><span>Antal</span><span>À-pris inkl. moms</span>
              <span class="text-right">Summa</span><span></span>
            </div>
            @for (r of rows.controls; track r; let i = $index) {
              <div
                [formGroup]="r"
                class="mb-2 grid grid-cols-[1fr_4.5rem_6.5rem] items-start gap-2 sm:grid-cols-[1fr_5rem_8rem_7rem_2.5rem]"
              >
                <mat-form-field class="col-span-3 sm:col-span-1" subscriptSizing="dynamic">
                  <mat-label class="sm:hidden">Text</mat-label>
                  <input matInput formControlName="description" placeholder="Vad såldes eller gjordes" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label class="sm:hidden">Antal</mat-label>
                  <input matInput type="number" inputmode="decimal" min="0" formControlName="quantity" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label class="sm:hidden">À-pris</mat-label>
                  <input matInput type="number" inputmode="decimal" min="0" formControlName="unitPrice" />
                </mat-form-field>
                <div class="flex h-11 items-center justify-end text-sm font-medium">
                  {{ rowTotal(r) | kr }}
                </div>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Ta bort raden"
                  [disabled]="rows.length < 2"
                  (click)="removeRow(i)"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>
            }
            <button mat-button type="button" (click)="addRow()">
              <mat-icon>add</mat-icon> Lägg till rad
            </button>
            <div class="mt-2 flex flex-col items-end border-t border-gray-100 pt-3">
              <div class="text-base font-semibold">Att betala {{ total() | kr }}</div>
              <div class="text-xs text-gray-500">{{ inclHint() }}</div>
            </div>
          </div>
          <mat-form-field class="sm:col-span-3">
            <mat-label>Garanti (valfritt)</mat-label>
            <input matInput formControlName="warranty" />
          </mat-form-field>
          @if (kind() === 'invoice') {
            <mat-form-field class="sm:col-span-3">
              <mat-label>Betalningsvillkor (dagar)</mat-label>
              <input matInput type="number" min="0" max="365" formControlName="terms" />
              <mat-hint>Förfallodatum räknas från fakturadatumet</mat-hint>
              <mat-error>0 till 365 dagar</mat-error>
            </mat-form-field>
          }
        </section>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Betalning</h2>
          <div class="flex flex-col items-start gap-3">
            @if (kind() === 'invoice') {
              <mat-checkbox formControlName="paid">Redan betald</mat-checkbox>
            } @else {
              <p class="text-sm text-gray-600">Ett kvitto är betalt, så säg hur.</p>
            }
            @if (kind() === 'receipt' || paid()) {
              <mat-form-field class="w-60">
                <mat-label>Betalsätt</mat-label>
                <mat-select formControlName="method">
                  @for (m of methods(); track m[0]) {
                    <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <p class="text-xs text-gray-500">Räknas som betald samma dag som dokumentet.</p>
            }
          </div>
        </section>
      </form>
    </app-card-page>
  `,
})
export class InvoiceNew implements HasUnsaved {
  private readonly api = inject(WorkOrderApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(AxleApi);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    link: [null as PickerValue | null, Validators.required],
    kind: ['invoice' as InvoiceKind],
    date: ['', Validators.required],
    warranty: [''],
    terms: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    paid: [true],
    method: ['invoice' as PaymentMethod],
  });

  /** Raderna: text, antal och à-pris i kronor inklusive moms. */
  readonly rows = new FormArray<FormGroup>([]);
  private readonly rowsChanged = toSignal(this.rows.valueChanges, { initialValue: [] });
  readonly total = computed(() => {
    this.rowsChanged();
    return this.rows.controls.reduce((sum, r) => sum + this.rowTotal(r), 0);
  });

  private newRow() {
    return this.fb.group({
      description: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
    });
  }

  addRow() {
    this.rows.push(this.newRow());
    this.form.markAsDirty();
  }

  removeRow(i: number) {
    if (this.rows.length > 1) this.rows.removeAt(i);
    this.form.markAsDirty();
  }

  /** Öre. */
  rowTotal(r: FormGroup) {
    const v = r.getRawValue() as { quantity: number; unitPrice: number };
    return Math.round((Number(v.quantity) || 0) * (Number(v.unitPrice) || 0) * 100);
  }

  readonly kind = toSignal(this.form.controls.kind.valueChanges, { initialValue: 'invoice' });
  readonly paid = toSignal(this.form.controls.paid.valueChanges, { initialValue: true });
  private readonly link = toSignal(this.form.controls.link.valueChanges, { initialValue: null });
  readonly methods = computed(() => paymentOptions(this.kind()));

  /** Kunden som valts ur registret, för att se att en faktura har någon att skickas till. */
  private readonly customer = toSignal(
    this.form.controls.link.valueChanges.pipe(
      startWith(null),
      map((v) => v?.customerId || v?.pending?.customerId || ''),
      switchMap((id) =>
        id ? this.workshop.customer(id).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** Verkstadens egna uppgifter: varje faktura och kvitto bär dem (Inställningar → Företaget). */
  private readonly seller = signal<SellerDetails | null>(null);
  private readonly receiptFix = {
    label: 'Välj kvitto',
    icon: 'receipt',
    click: () => this.form.controls.kind.setValue('receipt'),
  };

  /** Det som hindrar sparandet just nu, med en knapp dit det rättas. */
  readonly gap = computed<Gap | null>(() => {
    // Sidan är bara för ägaren, som är den som kan fylla i verkstadens uppgifter.
    const own = sellerGap(this.seller(), true, () => this.openCompanySettings());
    if (own) return own;
    if (this.kind() !== 'invoice') return null;
    const l = this.link();
    if (l?.pending?.customerName && !l.customerId && !l.pending.customerId) {
      return {
        text: 'En ny kund har ingen adress än. Lägg först till kunden med adress under Kunder och välj den här, eller välj kvitto.',
        fixes: [
          { label: 'Lägg till kund', icon: 'person_add', link: ['/customers', 'new'] },
          this.receiptFix,
        ],
      };
    }
    const gap = invoiceGap(this.customer());
    return gap && { ...gap, fixes: [...gap.fixes, this.receiptFix] };
  });

  private openCompanySettings() {
    void openSettings(this.dialog, 'foretag').then((ref) =>
      ref.afterClosed().subscribe(() => this.loadSeller()),
    );
  }

  private loadSeller() {
    this.inventory
      .seller()
      .pipe(catchError(() => of(null)))
      .subscribe((s) => {
        if (!s) return;
        this.seller.set(s);
        this.form.controls.terms.setValue(s.paymentTermsDays);
      });
  }

  constructor() {
    // Rätt betalsätt för typen: en faktura betalas in på banken, ett kvitto på stället.
    this.form.controls.kind.valueChanges.pipe(takeUntilDestroyed()).subscribe((k) => {
      this.form.controls.method.setValue(k === 'receipt' ? 'card' : 'invoice');
    });
    this.addRow();
    this.loadSeller();
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  inclHint() {
    const p = this.total() / 100;
    return p > 0
      ? `varav moms ${(p * 0.2).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`
      : 'Alla priser är inkl. moms';
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    if (!ensureValid(this.rows, this.snack)) return;
    if (this.total() <= 0) {
      this.snack.open('Skriv ett pris på minst en rad', undefined, { duration: 3000 });
      return;
    }
    const v = this.form.getRawValue();
    const receipt = v.kind === 'receipt';
    this.busy.set(true);
    this.links
      .resolve(v.link!)
      .pipe(
        switchMap((link) =>
          this.api.importInvoice({
            customerId: link.customerId,
            vehicleId: link.vehicleId || undefined,
            date: v.date,
            rows: this.rows.controls.map((r) => {
              const x = r.getRawValue() as { description: string; quantity: number; unitPrice: number };
              return {
                description: x.description.trim(),
                quantity: Number(x.quantity),
                unitPrice: Math.round(Number(x.unitPrice) * 100),
              };
            }),
            warranty: v.warranty.trim() || undefined,
            kind: v.kind,
            paymentTermsDays: receipt ? undefined : v.terms,
            // Ett kvitto är alltid betalt; en faktura bara om den redan betalats.
            paid: receipt || v.paid,
            method: receipt || v.paid ? v.method : undefined,
          }),
        ),
      )
      .subscribe({
        next: (o) => {
          this.busy.set(false);
          this.snack.open(receipt ? 'Kvittot är tillagt' : 'Fakturan är tillagd', undefined, {
            duration: 2500,
          });
          this.form.markAsPristine();
          this.router.navigate(['/finance/invoices', o.id]);
        },
        error: () => this.busy.set(false),
      });
  }
}
