import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, firstValueFrom, of, switchMap } from 'rxjs';
import { InventoryApi } from '../../core/api/inventory-api';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { StorageApi } from '../../core/api/storage-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import {
  Article,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  SalesCardDetail,
  SalesCardInput,
  SalesLineType,
  ServiceType,
  StorageDeposit,
} from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';
import { Confirm } from '../../shared/confirm';
import { type PickerValue } from '../../shared/customer-vehicle-picker/customer-vehicle-picker';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import { rowAmounts, STANDARD_VAT, totalsOf, VAT_OPTIONS } from '../../shared/vat';

/** En rad som den redigeras: priset i kronor inkl. moms. */
interface Row {
  key: string;
  id?: string;
  type: SalesLineType;
  description: string;
  articleId?: string;
  depositId?: string;
  quantity: number;
  /** Kronor per styck, inkl. moms. */
  price: number;
  discountPercent: number;
  vatRate: number;
  /** Mest man kan sälja av en artikel (lagersaldot). */
  maxQty?: number;
}

let seq = 0;
const key = () => `r${++seq}`;
const ore = (kr: number) => Math.round((kr || 0) * 100);

/**
 * Säljkortet: en affär med kund, rader, rabatt, bokföring (kvitto eller faktura) och betalning,
 * som ett säljkort i ett affärssystem. Ett utkast kan ändras fritt; bokförs kortet minskar
 * lagret och dokumentet får sitt nummer, och därefter går bara betalningen att ändra.
 */
@Component({
  selector: 'app-sales-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/sales"
      listLabel="Försäljning"
      newTitle="Nytt säljkort"
      [title]="title()"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (c.status === 'draft') {
            <button mat-button class="!text-red-700" (click)="remove()">Ta bort</button>
          }
          @if (c.status === 'posted') {
            <a mat-stroked-button [routerLink]="['/sales', c.id, 'invoice']">
              <mat-icon>print</mat-icon> Visa / skriv ut
            </a>
          }
        }
        @if (!readOnly()) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      @if (card()?.status === 'posted') {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b>Bokfört som {{ card()!.invoiceCode }}.</b>
          Kortet är låst: rader, priser och rabatt kan inte ändras (ett utfärdat dokument får inte
          ändras i efterhand). Betalningen går att ändra.
        </p>
      }

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
        @if (readOnly()) {
          <div class="text-sm">
            @if (card()?.links?.customer; as cu) {
              <a class="text-brand" [routerLink]="['/customers', cu.id]">{{ cu.name }}</a>
              <span class="text-gray-500"> · {{ cu.code }}</span>
            } @else {
              Kontantkund
            }
            @if (card()?.links?.vehicle; as v) {
              · <a class="text-brand" [routerLink]="['/vehicles', v.id]">{{ v.regNo }}</a>
              {{ v.label }}
            }
          </div>
        } @else {
          <app-customer-vehicle-picker
            [formControl]="linkCtl"
            [optional]="true"
            customerLabel="Kund (tomt = kontantförsäljning)"
          />
        }
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-base font-semibold">Rader</h2>

        @if (!readOnly()) {
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <div class="relative min-w-60 flex-1">
              <mat-icon class="pointer-events-none absolute top-2.5 left-3 text-gray-400"
                >search</mat-icon
              >
              <input
                type="search"
                [formControl]="search"
                (keydown.enter)="addFirst()"
                placeholder="Lägg till artikel: storlek, märke, artikelnummer…"
                class="focus:ring-brand h-11 w-full rounded-xl border-0 bg-white pr-3 pl-11 shadow-sm ring-1 ring-gray-200 outline-none focus:ring-2"
              />
              @if (results().length) {
                <div
                  class="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl bg-white shadow-lg"
                >
                  @for (a of results(); track a.id) {
                    <button
                      type="button"
                      class="hover:bg-brand-soft flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left last:border-b-0"
                      (click)="addArticle(a)"
                    >
                      <span class="truncate">
                        <span class="font-medium">{{ a.sizeLabel }}</span> · {{ a.brand }}
                        {{ a.model }}
                      </span>
                      <span class="flex shrink-0 items-center gap-3 text-sm">
                        <span class="text-gray-600">{{ a.quantity }} st</span>
                        <span class="font-medium">{{ a.sellPrice | kr }}</span>
                      </span>
                    </button>
                  }
                </div>
              }
            </div>
            <button mat-stroked-button type="button" [matMenuTriggerFor]="serviceMenu">
              <mat-icon>build</mat-icon> Åtgärd
            </button>
            <button
              mat-stroked-button
              type="button"
              [matMenuTriggerFor]="hotelMenu"
              (menuOpened)="loadDeposits()"
            >
              <mat-icon>warehouse</mat-icon> Däckhotell
            </button>
            <button mat-stroked-button type="button" (click)="addFree()">
              <mat-icon>add</mat-icon> Fri rad
            </button>
          </div>
          <mat-menu #serviceMenu="matMenu">
            @for (s of serviceTypes(); track s.id) {
              <button mat-menu-item type="button" (click)="addService(s)">
                {{ s.name }}
                @if (s.priceFrom) {
                  <span class="ml-2 text-gray-500">{{ s.priceFrom | kr }}</span>
                }
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">Inga åtgärder inlagda</span>
            }
          </mat-menu>
          <mat-menu #hotelMenu="matMenu">
            @for (d of deposits(); track d.id) {
              <button mat-menu-item type="button" (click)="addDeposit(d)">
                {{ d.code }} · {{ d.vehicle.regNo }} · {{ d.fee | kr }}
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">
                {{ depositsHint() }}
              </span>
            }
          </mat-menu>
        }

        @if (rows().length) {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-left text-sm">
              <thead
                class="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase"
              >
                <tr>
                  <th class="py-2">Beskrivning</th>
                  <th class="w-20 py-2 text-right">Antal</th>
                  <th class="w-32 py-2 text-right">À-pris inkl. moms</th>
                  <th class="w-24 py-2 text-right">Rabatt %</th>
                  <th class="w-28 py-2 text-right">Summa</th>
                  <th class="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of rows(); track r.key; let i = $index) {
                  <tr class="align-top">
                    <td class="py-2 pr-2">
                      @if (readOnly() || r.type === 'storage') {
                        <div class="py-2">{{ r.description }}</div>
                      } @else {
                        <input
                          class="focus:ring-brand h-10 w-full rounded-lg border-0 px-2 ring-1 ring-gray-200 outline-none focus:ring-2"
                          [value]="r.description"
                          (input)="edit(i, { description: $any($event.target).value })"
                        />
                      }
                      @if (r.type === 'article' && r.maxQty !== undefined && r.quantity > r.maxQty) {
                        <div class="text-xs text-red-600">Bara {{ r.maxQty }} st i lager.</div>
                      }
                    </td>
                    <td class="py-2 pr-2 text-right">
                      @if (readOnly() || r.type === 'storage') {
                        <div class="py-2 tabular-nums">{{ r.quantity }}</div>
                      } @else {
                        <input
                          type="number"
                          min="0"
                          step="1"
                          class="focus:ring-brand h-10 w-full rounded-lg border-0 px-2 text-right ring-1 ring-gray-200 outline-none focus:ring-2"
                          [value]="r.quantity"
                          (focus)="$any($event.target).select()"
                          (input)="edit(i, { quantity: $any($event.target).valueAsNumber })"
                        />
                      }
                    </td>
                    <td class="py-2 pr-2 text-right">
                      @if (readOnly()) {
                        <div class="py-2 tabular-nums">{{ r.price * 100 | kr }}</div>
                      } @else {
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          class="focus:ring-brand h-10 w-full rounded-lg border-0 px-2 text-right ring-1 ring-gray-200 outline-none focus:ring-2"
                          [value]="r.price"
                          (focus)="$any($event.target).select()"
                          (input)="edit(i, { price: $any($event.target).valueAsNumber })"
                        />
                      }
                    </td>
                    <td class="py-2 pr-2 text-right">
                      @if (readOnly()) {
                        <div class="py-2 tabular-nums">{{ r.discountPercent || '' }}</div>
                      } @else {
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          class="focus:ring-brand h-10 w-full rounded-lg border-0 px-2 text-right ring-1 ring-gray-200 outline-none focus:ring-2"
                          [value]="r.discountPercent || ''"
                          (focus)="$any($event.target).select()"
                          (input)="edit(i, { discountPercent: $any($event.target).valueAsNumber || 0 })"
                        />
                      }
                    </td>
                    <td class="py-2 text-right tabular-nums">
                      <div class="py-2">{{ amounts()[i] | kr }}</div>
                    </td>
                    <td class="py-2 text-right">
                      @if (!readOnly()) {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="removeRow(i)"
                          aria-label="Ta bort raden"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            Inga rader än. Sök en artikel ovan, eller lägg till en åtgärd, ett däckhotell eller en
            fri rad.
          </p>
        }
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Rabatt på hela kortet</h2>
        @if (readOnly()) {
          <p class="text-sm">
            @if (card()?.discount; as d) {
              {{ d.type === 'percent' ? d.value + ' %' : (d.value | kr) }}
              @if (d.reason) {
                <span class="text-gray-500"> · {{ d.reason }}</span>
              }
            } @else {
              Ingen rabatt.
            }
          </p>
        } @else {
          <div class="flex flex-wrap items-start gap-3">
            <mat-button-toggle-group
              hideSingleSelectionIndicator
              [value]="discType()"
              (change)="discType.set($event.value); touch()"
              aria-label="Typ av rabatt"
            >
              <mat-button-toggle value="percent">%</mat-button-toggle>
              <mat-button-toggle value="amount">kr</mat-button-toggle>
            </mat-button-toggle-group>
            <mat-form-field subscriptSizing="dynamic" class="w-36">
              <mat-label>{{ discType() === 'percent' ? 'Procent' : 'Kronor' }}</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [value]="discValue() || ''"
                (input)="discValue.set($any($event.target).valueAsNumber || 0); touch()"
              />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="min-w-52 flex-1">
              <mat-label>Anledning (syns inte på kvittot)</mat-label>
              <input
                matInput
                [value]="discReason()"
                (input)="discReason.set($any($event.target).value); touch()"
                placeholder="t.ex. 4 bilar på däckhotell"
              />
            </mat-form-field>
          </div>
        }
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <div class="ml-auto max-w-sm text-sm">
          @if (totals().discount > 0) {
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Före rabatt</span><span>{{ totals().gross | kr }}</span>
            </div>
            <div class="flex justify-between py-0.5 text-green-700">
              <span>Rabatt</span><span>−{{ totals().discount | kr }}</span>
            </div>
          }
          <div class="flex justify-between py-0.5 text-gray-600">
            <span>Summa exkl. moms</span><span>{{ totals().net | kr }}</span>
          </div>
          @for (b of totals().byRate; track b.rate) {
            <div class="flex justify-between py-0.5 text-gray-600">
              <span>Varav moms {{ b.rate }} %</span><span>{{ b.vat | kr }}</span>
            </div>
          }
          <div class="mt-1 flex justify-between gap-6 border-t pt-1 text-lg font-semibold">
            <span>Att betala inkl. moms</span><span>{{ totals().total | kr }}</span>
          </div>
        </div>
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h2 class="mb-2 text-base font-semibold">Text och anteckning</h2>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <mat-form-field class="sm:col-span-2">
            <mat-label>Text under raderna på kvittot</mat-label>
            <textarea
              matInput
              rows="2"
              [disabled]="readOnly()"
              [value]="performed()"
              (input)="performed.set($any($event.target).value); touch()"
              placeholder="t.ex. Bytt däck och balanserat"
            ></textarea>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Garanti</mat-label>
            <input
              matInput
              [disabled]="readOnly()"
              [value]="warranty()"
              (input)="warranty.set($any($event.target).value); touch()"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Intern anteckning</mat-label>
            <input
              matInput
              [disabled]="readOnly()"
              [value]="note()"
              (input)="note.set($any($event.target).value); touch()"
            />
          </mat-form-field>
        </div>
      </section>

      @if (card(); as c) {
        @if (c.status === 'draft') {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">Bokför</h2>
            <p class="mb-3 text-sm text-gray-600">
              Privatkund får kvitto och företag får faktura. Vid bokföring minskar lagret för
              artiklarna på raderna och dokumentet får sitt nummer. Därefter går kortet inte att
              ändra. Tills dess kan du förhandsgranska utkastet.
            </p>
            @if (dirty()) {
              <p class="mb-3 text-sm text-amber-800">Spara ändringarna först.</p>
            }
            <div class="flex flex-wrap gap-2">
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="dirty() || busy() || !rows().length"
                (click)="post()"
              >
                <mat-icon>receipt_long</mat-icon> Bokför
              </button>
              <a
                mat-stroked-button
                [routerLink]="['/sales', c.id, 'invoice']"
                [class.pointer-events-none]="dirty() || !rows().length"
              >
                <mat-icon>visibility</mat-icon> Förhandsgranska utkast
              </a>
            </div>
          </section>
        } @else if (c.invoice; as inv) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">Betalning</h2>
            <div class="flex flex-wrap items-center gap-3">
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
            @if (inv.kind === 'receipt' && payMethod() !== 'invoice' && !inv.paidAt) {
              <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <b>Kassaregister:</b> kontant-, kort- och Swish-försäljning till privatpersoner
                kräver ett certifierat kassaregister, om försäljningen över ett år överstiger fyra
                prisbasbelopp inkl. moms (236 800 kr för 2026). Det här systemet är inget
                kassaregister. Kontrollera med Skatteverket eller er revisor.
              </p>
            }
          </section>
        }

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Hör ihop med</h2>
          <div class="flex flex-wrap gap-2 text-sm">
            @if (c.links.customer; as cu) {
              <a mat-stroked-button [routerLink]="['/customers', cu.id]">
                <mat-icon>person</mat-icon> {{ cu.name }}
              </a>
            }
            @if (c.links.vehicle; as v) {
              <a mat-stroked-button [routerLink]="['/vehicles', v.id]">
                <mat-icon>directions_car</mat-icon> {{ v.regNo }}
              </a>
            }
            @if (c.links.workOrder; as w) {
              <a mat-stroked-button [routerLink]="['/workorders', w.id]">
                <mat-icon>handyman</mat-icon> {{ w.code }}
              </a>
            }
            @for (d of c.links.deposits; track d.id) {
              <a mat-stroked-button [routerLink]="['/storage', d.id]">
                <mat-icon>warehouse</mat-icon> {{ d.code }} · {{ d.regNo }}
              </a>
            }
            @if (!c.links.customer && !c.links.vehicle && !c.links.workOrder && !c.links.deposits.length) {
              <span class="text-gray-500">Kontantförsäljning utan kund.</span>
            }
          </div>
        </section>
      }
    </app-card-page>
  `,
})
export class SalesCardPage implements OnInit, HasUnsaved {
  private readonly api = inject(SalesCardApi);
  private readonly inventory = inject(InventoryApi);
  private readonly storage = inject(StorageApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly payLabels = PAYMENT_METHOD_LABELS;
  readonly payMethods = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][];
  readonly vatOptions = VAT_OPTIONS;

  readonly card = signal<SalesCardDetail | null>(null);
  readonly rows = signal<Row[]>([]);
  readonly linkCtl = new FormControl<PickerValue | null>(null);
  private readonly link = signal<PickerValue | null>(null);
  readonly discType = signal<'percent' | 'amount'>('percent');
  readonly discValue = signal(0);
  readonly discReason = signal('');
  readonly note = signal('');
  readonly performed = signal('');
  readonly warranty = signal('');
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly payMethod = signal<PaymentMethod>('card');

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly deposits = signal<StorageDeposit[]>([]);
  readonly depositsHint = signal('Välj en kund först för att se kundens däckhotell.');

  readonly readOnly = computed(() => this.card()?.status === 'posted');
  readonly title = computed(() => {
    const c = this.card();
    if (!c) return '';
    return [c.regNo, c.customerName ?? 'Kontantkund'].filter(Boolean).join(' · ');
  });

  private readonly priced = computed(() =>
    this.rows().map((r) => ({
      quantity: r.quantity || 0,
      unitPrice: ore(r.price),
      discountPercent: r.discountPercent || 0,
      vatRate: r.vatRate,
    })),
  );
  private readonly discount = computed(() =>
    this.discValue() > 0
      ? {
          type: this.discType(),
          value: this.discType() === 'amount' ? ore(this.discValue()) : this.discValue(),
        }
      : null,
  );
  readonly amounts = computed(() => rowAmounts(this.priced(), this.discount()));
  /** Summan medan man skriver; efter bokföring gäller det som frystes. */
  readonly totals = computed(() =>
    this.readOnly() && this.card()?.invoice
      ? this.card()!.invoice!.totals
      : totalsOf(this.priced(), this.discount()),
  );

  constructor() {
    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim() ? this.inventory.articles({ q: q.trim(), limit: 8, inStock: true }) : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((p) => this.results.set(p?.items ?? []));
    this.linkCtl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.link.set(v);
      this.touch();
    });
  }

  ngOnInit() {
    this.workshop.serviceTypes().subscribe((l) => this.serviceTypes.set(l));
    if (this.id && this.id !== 'new') {
      this.load(this.id);
      return;
    }
    // Länkar från kund-, bil-, arbetsorder- och däckhotellskort fyller i vad det gäller.
    const q = this.route.snapshot.queryParamMap;
    const customerId = q.get('customerId');
    const vehicleId = q.get('vehicleId');
    if (customerId || vehicleId) {
      this.linkCtl.setValue({ customerId: customerId ?? '', vehicleId: vehicleId ?? '' });
    }
    const depositId = q.get('depositId');
    if (depositId) {
      this.storage.deposit(depositId).subscribe((d) => {
        if (!customerId && d.customerId) {
          this.linkCtl.setValue({ customerId: d.customerId, vehicleId: d.vehicleId ?? '' });
        }
        this.addDeposit(d);
      });
    }
    this.dirty.set(false);
  }

  hasUnsaved() {
    return this.dirty();
  }

  touch() {
    this.dirty.set(true);
  }

  private load(id: string) {
    this.api.get(id).subscribe((c) => this.apply(c));
  }

  private apply(c: SalesCardDetail) {
    this.card.set(c);
    this.rows.set(
      c.lines.map((l) => ({
        key: key(),
        id: l.id,
        type: l.type,
        description: l.description,
        articleId: l.articleId ?? undefined,
        depositId: l.depositId ?? undefined,
        quantity: l.quantity,
        price: l.unitPrice / 100,
        discountPercent: l.discountPercent,
        vatRate: l.vatRate,
      })),
    );
    this.linkCtl.setValue(
      c.customerId || c.vehicleId
        ? { customerId: c.customerId ?? '', vehicleId: c.vehicleId ?? '' }
        : null,
      { emitEvent: false },
    );
    this.link.set(this.linkCtl.value);
    this.discType.set(c.discount?.type ?? 'percent');
    this.discValue.set(
      c.discount ? (c.discount.type === 'amount' ? c.discount.value / 100 : c.discount.value) : 0,
    );
    this.discReason.set(c.discount?.reason ?? '');
    this.note.set(c.note ?? '');
    this.performed.set(c.performed ?? '');
    this.warranty.set(c.invoice?.warranty ?? '');
    this.payMethod.set(c.invoice?.paymentMethod ?? 'card');
    this.dirty.set(false);
  }

  // --- rader ---

  edit(i: number, patch: Partial<Row>) {
    this.rows.update((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    this.touch();
  }

  removeRow(i: number) {
    this.rows.update((rs) => rs.filter((_, j) => j !== i));
    this.touch();
  }

  private push(r: Omit<Row, 'key'>) {
    this.rows.update((rs) => [...rs, { key: key(), ...r }]);
    this.touch();
  }

  addArticle(a: Article) {
    const i = this.rows().findIndex((r) => r.articleId === a.id);
    if (i >= 0) {
      this.edit(i, { quantity: this.rows()[i].quantity + 1 });
    } else {
      this.push({
        type: 'article',
        description: `${a.sizeLabel} ${a.brand ?? ''} ${a.model ?? ''}`.replace(/\s+/g, ' ').trim(),
        articleId: a.id,
        quantity: 1,
        price: a.sellPrice / 100,
        discountPercent: 0,
        vatRate: STANDARD_VAT,
        maxQty: a.quantity,
      });
    }
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
  }

  addFirst() {
    const [first] = this.results();
    if (first) this.addArticle(first);
  }

  addService(s: ServiceType) {
    this.push({
      type: 'service',
      description: s.name,
      quantity: 1,
      price: (s.priceFrom ?? 0) / 100,
      discountPercent: 0,
      vatRate: STANDARD_VAT,
    });
  }

  addFree() {
    this.push({
      type: 'service',
      description: '',
      quantity: 1,
      price: 0,
      discountPercent: 0,
      vatRate: STANDARD_VAT,
    });
  }

  addDeposit(d: StorageDeposit) {
    if (this.rows().some((r) => r.depositId === d.id)) return;
    this.push({
      type: 'storage',
      description: `Däckhotell ${d.vehicle.regNo}`,
      depositId: d.id,
      quantity: 1,
      price: d.fee / 100,
      discountPercent: 0,
      vatRate: STANDARD_VAT,
    });
  }

  /** Kundens däck som ligger i hotellet och inte är betalda eller redan på kortet. */
  loadDeposits() {
    const customerId = this.link()?.customerId || this.card()?.customerId;
    if (!customerId) {
      this.deposits.set([]);
      this.depositsHint.set('Välj en kund först för att se kundens däckhotell.');
      return;
    }
    this.storage.deposits({ status: 'stored', paymentStatus: 'unpaid', limit: 100 }).subscribe((p) => {
      const taken = new Set(this.rows().map((r) => r.depositId));
      const list = p.items.filter((d) => d.customerId === customerId && !taken.has(d.id));
      this.deposits.set(list);
      this.depositsHint.set('Kunden har inga obetalda däckhotell att lägga till.');
    });
  }

  // --- spara och bokför ---

  private async body(): Promise<SalesCardInput> {
    const link = this.link();
    const resolved = link ? await firstValueFrom(this.links.resolve(link)) : null;
    return {
      customerId: resolved?.customerId || null,
      vehicleId: resolved?.vehicleId || null,
      lines: this.rows().map((r) => ({
        id: r.id,
        type: r.type,
        description: r.description || undefined,
        articleId: r.articleId,
        depositId: r.depositId,
        quantity: r.quantity,
        unitPrice: ore(r.price),
        discountPercent: r.discountPercent || 0,
        vatRate: r.vatRate,
      })),
      discount: this.discount()
        ? { ...this.discount()!, reason: this.discReason().trim() || undefined }
        : null,
      note: this.note().trim(),
      performed: this.performed().trim(),
      warranty: this.warranty().trim(),
    };
  }

  async save(): Promise<boolean> {
    if (this.rows().some((r) => !(r.quantity > 0) || !(r.price >= 0))) {
      this.snack.open('Kontrollera antal och pris på raderna', 'OK', { duration: 4000 });
      return false;
    }
    this.busy.set(true);
    try {
      const body = await this.body();
      const c = this.card();
      const saved = c
        ? await firstValueFrom(this.api.update(c.id, body))
        : await firstValueFrom(this.api.create(body));
      this.apply(saved);
      this.snack.open(`${saved.code} sparades`, undefined, { duration: 2500 });
      if (!c) await this.router.navigate(['/sales', saved.id], { replaceUrl: true });
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  post() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: `Bokför ${c.code}?`,
        message:
          'Lagret minskas för artiklarna på raderna och kvittot eller fakturan får sitt nummer. Därefter går kortet inte att ändra.',
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.post(c.id).subscribe({
          next: (posted) => {
            this.apply(posted);
            this.busy.set(false);
            this.snack.open(`${posted.invoiceCode} är bokfört`, 'OK', { duration: 4000 });
          },
          error: () => this.busy.set(false),
        });
      });
  }

  setPaid(paid: boolean) {
    const c = this.card();
    if (!c) return;
    const run = () =>
      this.api.setPaid(c.id, paid, paid ? this.payMethod() : undefined).subscribe((r) => this.apply(r));
    if (paid) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: 'Markera som obetald?',
        message: 'Betalningen och betalsättet tas bort. Däckhotell på kortet förblir betalda.',
        confirmText: 'Markera obetald',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  remove() {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: `Ta bort ${c.code}?`,
        message: 'Utkastet raderas. Inget har bokförts.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(c.id).subscribe(() => {
          this.dirty.set(false);
          void this.router.navigate(['/sales']);
        });
      });
  }

}
