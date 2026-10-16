import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { ensureValid } from '../../../shared/form-guard';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkOrderApi } from '../../../core/api/work-order-api';
import { InventoryApi } from '../../../core/api/inventory-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import {
  Article,
  CustomerType,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Resource,
  ServiceType,
  WORK_ORDER_LINE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { LinkResolver } from '../../../shared/customer-vehicle-picker/link-resolver';
import { Subject, debounceTime, switchMap } from 'rxjs';
import type { PickerValue } from '../../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { dateInput, dateIso } from '../../storage/storage-format';
import { Auth } from '../../../core/auth/auth';
import { STANDARD_VAT, VAT_OPTIONS, rowNet, totalsOf, withVat } from '../../../shared/vat';

const ore = (kr: number | null) => (kr == null ? null : Math.round(kr * 100));
const kr = (o: number | null | undefined) => (o == null ? null : o / 100);

/** Arbetsordern: huvudet med kund, bil, datum och pris, och raderna som mekanikern arbetar igenom. */
@Component({
  selector: 'app-work-order-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/workorders"
      listLabel="Arbetsorder"
      newTitle="Ny arbetsorder"
      [title]="card() ? card()!.regNo + ' · ' + card()!.customerName : ''"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (admin && !c.invoice) {
            <button mat-button class="!text-red-700" (click)="remove()">Ta bort</button>
          }
          <a
            mat-stroked-button
            [routerLink]="['/workorders', c.id, 'print']"
            [disabled]="form.dirty"
            [matTooltip]="form.dirty ? 'Spara först' : ''"
          >
            <mat-icon>print</mat-icon> Skriv ut
          </a>
        }
        @if (!card()?.invoice) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (card()?.invoice; as inv) {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b>{{ inv.kind === 'invoice' ? 'Fakturerad' : 'Kvitterad' }} som {{ inv.code }}.</b>
          Ordern är låst: rader, priser och kund kan inte ändras (en utfärdad faktura får inte
          ändras i efterhand).
        </p>
      }

      <form [formGroup]="form" class="flex flex-col gap-4">
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <app-customer-vehicle-picker formControlName="link" />
        </section>

        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-6">
          <h2 class="mb-2 text-base font-semibold sm:col-span-6">Inlämning</h2>
          <app-date-field
            class="sm:col-span-2"
            label="Inlämningsdatum"
            icon="event"
            error="Ange datum"
            formControlName="receivedAt"
          />
          <app-date-field
            class="sm:col-span-2"
            label="Hämtningsdatum"
            icon="event_available"
            [error]="form.errors?.['pickup'] ? 'Före inlämningsdatumet' : ''"
            formControlName="pickupAt"
          />
          <mat-form-field class="sm:col-span-2">
            <mat-label>Mekaniker / plats</mat-label>
            <mat-select formControlName="resourceId">
              <mat-option value="">Ingen vald</mat-option>
              @for (r of resources(); track r.id) {
                <mat-option [value]="r.id">{{ r.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field class="sm:col-span-2">
            <mat-label>Pris överenskommet från (kr, exkl. moms)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" formControlName="priceFrom" />
            <mat-hint>{{ inclHint(form.controls.priceFrom.value) }}</mat-hint>
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Pris överenskommet till (kr, exkl. moms)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" formControlName="priceTo" />
            <mat-hint>{{ inclHint(form.controls.priceTo.value) }}</mat-hint>
            @if (form.errors?.['price']) {
              <mat-error>Lägre än "från"</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Prisförslag (kr, exkl. moms)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" formControlName="quote" />
            <mat-hint>{{ inclHint(form.controls.quote.value) }}</mat-hint>
          </mat-form-field>

          <div class="mb-4 sm:col-span-6">
            <mat-button-toggle-group formControlName="status" hideSingleSelectionIndicator>
              @for (s of statuses; track s[0]) {
                <mat-button-toggle [value]="s[0]">{{ s[1] }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          <mat-form-field class="sm:col-span-6">
            <mat-label>Anmärkning för det här besöket</mat-label>
            <textarea
              matInput
              rows="2"
              formControlName="remarks"
              placeholder="t.ex. Taxibolaget, kommer ofta. Kunden hör ett ljud från höger fram."
            ></textarea>
          </mat-form-field>
          <mat-form-field class="sm:col-span-6">
            <mat-label>Intern anteckning (skrivs inte ut)</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <h2 class="flex-1 text-base font-semibold">Vad ska göras</h2>
            @for (t of lineTypes; track t[0]) {
              <button mat-stroked-button type="button" (click)="addLine(t[0])">
                <mat-icon>add</mat-icon> {{ t[1] }}
              </button>
            }
          </div>

          @if (card()?.stockMissing; as n) {
            <p class="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {{ n }} {{ n === 1 ? 'del' : 'delar' }} kunde inte tas ur lagret (saknas eller är
              arkiverad). Justera lagret och spara om ordern.
            </p>
          }
          <div formArrayName="lines" class="flex flex-col">
            @for (row of lines.controls; track row; let i = $index) {
              <div
                [formGroupName]="i"
                class="grid items-start gap-x-3 border-t border-gray-100 pt-3 sm:grid-cols-[7rem_1fr_5.5rem_7.5rem_5.5rem_5.5rem_7rem_2.5rem_2.5rem]"
              >
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Typ</mat-label>
                  <mat-select formControlName="type">
                    @for (t of lineTypes; track t[0]) {
                      <mat-option [value]="t[0]">{{ t[1] }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{
                    row.value.type === 'part'
                      ? 'Artikel (sök i lagret eller skriv fritt)'
                      : row.value.type === 'labour'
                        ? 'Åtgärd (välj eller skriv fritt)'
                        : row.value.type === 'environment_fee'
                          ? 'Miljöavgift (t.ex. däck, olja, batteri)'
                          : 'Beskrivning'
                  }}</mat-label>
                  <input
                    matInput
                    formControlName="description"
                    [matAutocomplete]="auto"
                    (input)="edited(row)"
                    (focus)="typed(row)"
                    autocomplete="off"
                  />
                  <mat-autocomplete
                    #auto="matAutocomplete"
                    (optionSelected)="picked(row, $event.option.value)"
                  >
                    @for (o of suggestions(row); track o.key) {
                      <mat-option [value]="o.key">
                        {{ o.label }}
                        <span class="ml-2 text-xs text-gray-500">{{ o.hint }}</span>
                      </mat-option>
                    }
                  </mat-autocomplete>
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ row.value.type === 'labour' ? 'Timmar' : 'Antal' }}</mat-label>
                  <input matInput type="number" min="0" step="0.25" formControlName="quantity" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>À-pris (kr, exkl. moms)</mat-label>
                  <input matInput type="number" min="0" formControlName="unitPrice" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Rabatt %</mat-label>
                  <input matInput type="number" min="0" max="100" formControlName="discountPercent" />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Moms %</mat-label>
                  <mat-select formControlName="vatRate">
                    @for (v of vatOptions; track v) {
                      <mat-option [value]="v">{{ v }} %</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <div class="self-center text-right tabular-nums">{{ rowTotal(row) | kr }}</div>
                <mat-checkbox formControlName="done" matTooltip="Klar" class="self-center" />
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeLine(i)"
                  aria-label="Ta bort raden"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
                @if (row.value.type === 'part') {
                  <div class="flex flex-wrap items-center gap-x-4 pb-2 text-sm sm:col-span-9">
                    <mat-checkbox formControlName="toOrder">Behöver beställas</mat-checkbox>
                    @if (row.value.articleId) {
                      <span class="text-gray-500">
                        {{ row.value.stockBooked ? 'Uttagen ur lagret' : 'Lagerartikel: tas ur lagret när ordern är klar' }}
                      </span>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="text-sm text-gray-500">
                Inga rader än. Lägg till vad som ska göras med knapparna ovan.
              </p>
            }
          </div>

          @if (totals(); as t) {
            <div class="mt-3 ml-auto flex max-w-sm flex-col gap-1 border-t border-gray-200 pt-3">
              @if (t.discount > 0) {
                <div class="flex justify-between text-sm text-gray-600">
                  <span>Före rabatt</span><span class="tabular-nums">{{ t.gross | kr }}</span>
                </div>
                <div class="flex justify-between text-sm text-gray-600">
                  <span>Rabatt</span><span class="tabular-nums">−{{ t.discount | kr }}</span>
                </div>
              }
              <div class="flex justify-between">
                <span class="text-gray-600">Summa exkl. moms</span>
                <b class="tabular-nums">{{ t.net | kr }}</b>
              </div>
              @for (b of t.byRate; track b.rate) {
                <div class="flex justify-between text-sm text-gray-600">
                  <span>Moms {{ b.rate }} % på {{ b.base | kr }}</span>
                  <span class="tabular-nums">{{ b.vat | kr }}</span>
                </div>
              }
              <div class="flex justify-between border-t border-gray-300 pt-1 text-lg">
                <span class="font-semibold">Att betala inkl. moms</span>
                <b class="tabular-nums">{{ t.total | kr }}</b>
              </div>
              <p class="text-xs text-gray-500">
                Moms räknas per momssats på summan av raderna och avrundas till hela ören.
              </p>
            </div>
          }
          @if (unpriced() > 0) {
            <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {{ unpriced() }} {{ unpriced() === 1 ? 'rad saknar' : 'rader saknar' }} pris (0 kr).
              Prissätt dem före fakturering.
            </p>
          }
        </section>

        @if (card(); as c) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">
              {{ customerType() === 'company' ? 'Faktura' : 'Kvitto' }}
            </h2>
            @if (c.invoice; as inv) {
              <div class="flex flex-wrap items-center gap-3">
                <span>
                  <b>{{ inv.code }}</b> · {{ inv.kind === 'invoice' ? 'faktura' : 'kvitto' }}
                  utfärdat {{ inv.issuedAt | date: 'yyyy-MM-dd' }}
                  @if (inv.dueAt) {
                    · förfaller {{ inv.dueAt | date: 'yyyy-MM-dd' }}
                  }
                  · <b>{{ inv.totals.total | kr }}</b> inkl. moms
                </span>
                <a mat-stroked-button [routerLink]="['/workorders', c.id, 'invoice']">
                  <mat-icon>receipt_long</mat-icon> Visa / skriv ut
                </a>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                @if (inv.paidAt) {
                  <app-pill tone="green"
                    >Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                    @if (inv.paymentMethod) {
                      · {{ payLabels[inv.paymentMethod] }}
                    }
                  </app-pill>
                  <button mat-button type="button" (click)="setPaid(false)">Ångra betalning</button>
                } @else {
                  <mat-form-field subscriptSizing="dynamic" class="w-48">
                    <mat-label>Betalsätt</mat-label>
                    <mat-select [value]="payMethod()" (selectionChange)="payMethod.set($event.value)">
                      @for (m of payMethods; track m[0]) {
                        <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <button mat-flat-button color="primary" type="button" (click)="setPaid(true)">
                    Markera betald
                  </button>
                }
              </div>
              @if (inv.kind === 'receipt' && payMethod() !== 'invoice') {
                <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <b>Kassaregister:</b> kontant-, kort- och Swish-försäljning till privatpersoner
                  kräver ett certifierat kassaregister, om försäljningen över ett år överstiger fyra
                  prisbasbelopp inkl. moms (236 800 kr för 2026). Det här systemet är inget
                  kassaregister. Kontrollera med Skatteverket eller er revisor hur ni ska göra.
                </p>
              }
            } @else if (c.status === 'done') {
              <p class="mb-3 text-sm text-gray-600">
                @if (customerType() === 'company') {
                  Företag får faktura med organisationsnummer, momsbelopp och förfallodatum.
                } @else {
                  Privatkund får kvitto med priset inklusive moms.
                }
                När den är utfärdad får fakturanummer och går inte att ändra.
              </p>
              @if (form.dirty) {
                <p class="mb-3 text-sm text-amber-800">Spara ändringarna först.</p>
              }
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="form.dirty || busy() || !admin"
                (click)="issue()"
              >
                <mat-icon>receipt_long</mat-icon>
                {{ customerType() === 'company' ? 'Fakturera' : 'Skapa kvitto' }}
              </button>
            } @else {
              <p class="text-sm text-gray-600">
                Sätt ordern till <b>Klar</b> och spara för att kunna
                {{ customerType() === 'company' ? 'fakturera' : 'skapa kvitto' }}.
              </p>
            }
          </section>
        }
      </form>
    </app-card-page>
  `,
})
export class WorkOrderCard implements OnInit {
  private readonly auth = inject(Auth);
  /** Bara ägare får ta bort. */
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(WorkOrderApi);
  private readonly links = inject(LinkResolver);
  private readonly workshop = inject(WorkshopApi);
  private readonly inventory = inject(InventoryApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly statuses = Object.entries(WORK_ORDER_STATUS_LABELS);
  readonly lineTypes = Object.entries(WORK_ORDER_LINE_LABELS) as [WorkOrderLineType, string][];
  readonly vatOptions = VAT_OPTIONS;
  readonly payLabels = PAYMENT_METHOD_LABELS;
  readonly payMethods = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][];
  readonly payMethod = signal<PaymentMethod>('card');
  /** Privat → kvitto med pris inkl. moms; företag → faktura. */
  readonly customerType = signal<CustomerType>('private');
  readonly busy = signal(false);
  readonly card = signal<WorkOrderDetail | null>(null);
  readonly resources = signal<Resource[]>([]);
  private readonly serviceTypes = signal<ServiceType[]>([]);
  private readonly partResults = signal<Article[]>([]);
  private readonly partSearch = new Subject<string>();
  /** Räknas om när något i formuläret ändras, så att summan följer med. */
  private readonly version = signal(0);

  readonly lines = this.fb.array<FormGroup>([]);
  readonly form = this.fb.nonNullable.group(
    {
      link: [null as PickerValue | null, Validators.required],
      resourceId: [''],
      status: ['open' as WorkOrderStatus],
      receivedAt: [dateInput(new Date().toISOString()), Validators.required],
      pickupAt: [''],
      priceFrom: [null as number | null, Validators.min(0)],
      priceTo: [null as number | null, Validators.min(0)],
      quote: [null as number | null, Validators.min(0)],
      remarks: [''],
      notes: [''],
      lines: this.lines,
    },
    {
      validators: (g) => {
        const v = g.getRawValue() as {
          receivedAt: string;
          pickupAt: string;
          priceFrom: number | null;
          priceTo: number | null;
        };
        const errors: Record<string, boolean> = {};
        if (v.receivedAt && v.pickupAt && v.pickupAt < v.receivedAt) errors['pickup'] = true;
        if (v.priceFrom != null && v.priceTo != null && v.priceFrom > v.priceTo) {
          errors['price'] = true;
        }
        return Object.keys(errors).length ? errors : null;
      },
    },
  );

  constructor() {
    this.form.valueChanges.subscribe(() => this.version.update((n) => n + 1));
    this.partSearch
      .pipe(
        debounceTime(200),
        switchMap((q) => this.inventory.articles({ q, limit: 8 })),
      )
      .subscribe((p) => this.partResults.set(p.items));
  }

  ngOnInit() {
    // Aktiva mekaniker, och den som redan står på ordern även om hen arkiverats.
    this.workshop.resources(true).subscribe((r) => this.resources.set(r.filter((x) => x.active)));
    this.workshop.serviceTypes().subscribe((t) => this.serviceTypes.set(t));
    if (this.id) this.load();
  }

  private newLine(init?: {
    id?: string | null;
    articleId?: string | null;
    type: WorkOrderLineType;
    description: string;
    quantity: number;
    unitPrice: number | null;
    discountPercent?: number;
    vatRate?: number;
    done: boolean;
    toOrder?: boolean;
    stockBooked?: boolean;
  }) {
    return this.fb.nonNullable.group({
      id: [init?.id ?? (null as string | null)],
      articleId: [init?.articleId ?? (null as string | null)],
      toOrder: [init?.toOrder ?? false],
      stockBooked: [init?.stockBooked ?? false],
      type: [init?.type ?? ('labour' as WorkOrderLineType)],
      description: [init?.description ?? '', Validators.required],
      quantity: [init?.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [init?.unitPrice ?? (0 as number | null), Validators.min(0)],
      discountPercent: [
        init?.discountPercent ?? 0,
        [Validators.min(0), Validators.max(100)],
      ],
      vatRate: [init?.vatRate ?? STANDARD_VAT],
      done: [init?.done ?? false],
    });
  }

  /** Förslag på raden: åtgärder för arbete, lagerartiklar för delar. */
  suggestions(row: FormGroup): { key: string; label: string; hint: string }[] {
    this.version();
    const v = row.getRawValue() as { type: WorkOrderLineType; description: string };
    const q = (v.description ?? '').toLowerCase().trim();
    if (v.type === 'labour') {
      return this.serviceTypes()
        .filter((t) => !q || t.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((t) => ({
          key: 's:' + t.id,
          label: t.name,
          hint: `${t.durationMinutes} min${t.priceFrom != null ? ' · ' + t.priceFrom / 100 + ' kr' : ''}`,
        }));
    }
    if (v.type === 'part') {
      return this.partResults().map((a) => ({
        key: 'a:' + a.id,
        label: a.label,
        hint: `${a.sku ?? ''} · ${a.quantity} i lager · ${a.sellPrice / 100} kr`,
      }));
    }
    return [];
  }

  /** Skriver man om raden är den inte längre kopplad till en lagerartikel. */
  edited(row: FormGroup) {
    row.patchValue({ articleId: null });
    this.typed(row);
  }

  typed(row: FormGroup) {
    const v = row.getRawValue() as { type: WorkOrderLineType; description: string };
    if (v.type === 'part') this.partSearch.next(v.description ?? '');
  }

  picked(row: FormGroup, key: string) {
    if (key.startsWith('a:')) {
      const a = this.partResults().find((x) => x.id === key.slice(2));
      if (a) {
        row.patchValue({ description: a.label, articleId: a.id, unitPrice: kr(a.sellPrice) });
      }
    } else if (key.startsWith('s:')) {
      const t = this.serviceTypes().find((x) => x.id === key.slice(2));
      if (t) {
        // Åtgärdens tid blir antal timmar (kvartar) och priset fördelas på dem.
        const hours = Math.max(0.25, Math.ceil(t.durationMinutes / 15) / 4);
        row.patchValue({
          description: t.name,
          quantity: hours,
          ...(t.priceFrom != null ? { unitPrice: Math.round(t.priceFrom / hours) / 100 } : {}),
        });
      }
    }
    this.form.markAsDirty();
  }

  addLine(type: WorkOrderLineType) {
    this.lines.push(
      this.newLine({ type, description: '', quantity: 1, unitPrice: 0, done: false }),
    );
    this.form.markAsDirty();
    this.settle();
  }

  /**
   * Material-fälten på en ny rad får sin utformning först i en andra rendering; utan den
   * syns raden oformaterad tills man klickar i något (appen kör utan zone.js).
   */
  private settle() {
    this.cdr.detectChanges();
    setTimeout(() => this.cdr.detectChanges());
  }

  removeLine(i: number) {
    this.lines.removeAt(i);
    this.form.markAsDirty();
    this.settle();
  }

  /** Radens belopp exkl. moms efter rabatt, öre. */
  rowTotal(row: FormGroup): number {
    this.version();
    return rowNet(this.priced(row));
  }

  private priced(row: FormGroup) {
    const v = row.getRawValue() as {
      quantity: number | null;
      unitPrice: number | null;
      discountPercent: number | null;
      vatRate: number | null;
    };
    return {
      quantity: v.quantity ?? 0,
      unitPrice: Math.round((v.unitPrice ?? 0) * 100),
      discountPercent: v.discountPercent ?? 0,
      vatRate: v.vatRate ?? STANDARD_VAT,
    };
  }

  /** Summor medan man skriver: netto, moms per sats och belopp att betala. */
  totals() {
    this.version();
    return totalsOf(this.lines.controls.map((r) => this.priced(r)));
  }

  /** Rader utan pris, t.ex. sådana mekanikern lagt till. */
  unpriced(): number {
    this.version();
    return this.lines.controls.filter((r) => this.priced(r).unitPrice === 0).length;
  }

  /** "= 1 250 kr inkl. moms" under ett nettopris. */
  inclHint(netKr: number | null | undefined): string {
    if (netKr == null || Number.isNaN(netKr)) return '';
    const ore = Math.round(netKr * 100);
    return `= ${(withVat(ore) / 100).toLocaleString('sv-SE')} kr inkl. moms`;
  }

  private load() {
    this.api.get(this.id!).subscribe((o) => {
      this.card.set(o);
      this.lines.clear();
      for (const l of o.lines) {
        this.lines.push(
          this.newLine({
            id: l.id,
            articleId: l.articleId,
            toOrder: l.toOrder,
            stockBooked: l.stockBooked,
            type: l.type,
            description: l.description,
            quantity: l.quantity,
            unitPrice: kr(l.unitPrice),
            discountPercent: l.discountPercent,
            vatRate: l.vatRate,
            done: l.done,
          }),
        );
      }
      this.form.reset({
        link: { customerId: o.customerId, vehicleId: o.vehicleId },
        resourceId: o.resourceId ?? '',
        status: o.status,
        receivedAt: dateInput(o.receivedAt),
        pickupAt: dateInput(o.pickupAt),
        priceFrom: kr(o.priceFrom),
        priceTo: kr(o.priceTo),
        quote: kr(o.quote),
        remarks: o.remarks ?? '',
        notes: o.notes ?? '',
      } as never);
      // En fakturerad order är låst.
      if (o.invoice) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
      this.payMethod.set(o.invoice?.paymentMethod ?? 'card');
      this.workshop.customer(o.customerId).subscribe((c) => this.customerType.set(c.type));
      this.version.update((n) => n + 1);
      // Raderna byggs om efter varje laddning (även efter spara): samma extra rendering som vid +.
      this.settle();
    });
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;

    const v = this.form.getRawValue();
    const body: WorkOrderInput = {
      customerId: '',
      vehicleId: '',
      resourceId: v.resourceId || null,
      status: v.status,
      receivedAt: dateIso(v.receivedAt),
      pickupAt: v.pickupAt ? dateIso(v.pickupAt) : null,
      priceFrom: ore(v.priceFrom),
      priceTo: ore(v.priceTo),
      quote: ore(v.quote),
      remarks: v.remarks || null,
      notes: v.notes || null,
      lines: this.lines.controls.map((row) => {
        const l = row.getRawValue() as {
          id: string | null;
          articleId: string | null;
          toOrder: boolean;
          type: WorkOrderLineType;
          description: string;
          quantity: number;
          unitPrice: number | null;
          discountPercent: number | null;
          vatRate: number | null;
          done: boolean;
        };
        return {
          id: l.id ?? undefined,
          articleId: l.type === 'part' ? l.articleId : null,
          toOrder: l.toOrder,
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unitPrice: ore(l.unitPrice) ?? 0,
          discountPercent: l.discountPercent ?? 0,
          vatRate: l.vatRate ?? STANDARD_VAT,
          done: l.done,
        };
      }),
    };
    this.busy.set(true);
    this.links
      .resolve(v.link!)
      .pipe(
        switchMap((link) => {
          const full = { ...body, ...link };
          return this.id ? this.api.update(this.id, full) : this.api.create(full);
        }),
      )
      .subscribe({
        next: (o) => {
          this.busy.set(false);
          this.snack.open('Sparat', undefined, { duration: 2000 });
          if (this.id) this.load();
          else this.router.navigate(['/workorders', o.id]);
        },
        error: () => this.busy.set(false),
      });
  }

  /** Fakturerar (företag) eller kvitterar (privat) och låser ordern. */
  issue() {
    const o = this.card()!;
    const company = this.customerType() === 'company';
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: company ? `Fakturera ${o.code}?` : `Skapa kvitto för ${o.code}?`,
          message:
            'Ordern får ett löpnummer och låses: rader, priser och kund kan inte ändras efteråt. ' +
            'Verkstadens och kundens uppgifter kopieras in på dokumentet.',
          confirmText: company ? 'Fakturera' : 'Skapa kvitto',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.issueInvoice(o.id).subscribe({
          next: () => {
            this.busy.set(false);
            this.snack.open('Utfärdat', undefined, { duration: 2000 });
            this.load();
          },
          error: () => this.busy.set(false),
        });
      });
  }

  setPaid(paid: boolean) {
    this.api.setPaid(this.id!, paid, paid ? this.payMethod() : undefined).subscribe(() => this.load());
  }

  remove() {
    const o = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${o.code}?`,
          message: 'Arbetsordern och alla dess rader tas bort. Det går inte att ångra.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) => ok && this.api.remove(o.id).subscribe(() => this.router.navigate(['/workorders'])),
      );
  }
}
