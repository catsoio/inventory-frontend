import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
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
          <app-customer-vehicle-picker formControlName="link" />
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
          <mat-form-field class="sm:col-span-3" subscriptSizing="dynamic">
            <mat-label>Belopp (kr, inkl. moms)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" formControlName="price" />
            <mat-hint>{{ inclHint() }}</mat-hint>
            <mat-error>Ange belopp över 0</mat-error>
          </mat-form-field>
          <mat-form-field class="mt-4 sm:col-span-6">
            <mat-label>Utfört (står på dokumentet)</mat-label>
            <textarea matInput rows="3" formControlName="performed"></textarea>
            <mat-error>Obligatoriskt</mat-error>
          </mat-form-field>
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
  private readonly inventory = inject(InventoryApi);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    link: [null as PickerValue | null, Validators.required],
    kind: ['invoice' as InvoiceKind],
    date: ['', Validators.required],
    performed: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0.01)]],
    warranty: [''],
    terms: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    paid: [true],
    method: ['invoice' as PaymentMethod],
  });

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
    this.loadSeller();
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  inclHint() {
    const p = this.form.controls.price.value;
    return p > 0
      ? `varav moms ${(p * 0.2).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`
      : '';
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    const receipt = v.kind === 'receipt';
    this.busy.set(true);
    this.links
      .resolve(v.link!)
      .pipe(
        switchMap((link) =>
          this.api.importInvoice({
            ...link,
            date: v.date,
            performed: v.performed.trim(),
            price: Math.round(v.price * 100),
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
