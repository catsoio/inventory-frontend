import { CreditDialog, type CreditResult } from './credit-dialog';
import { ReturnDialog } from './return-dialog';
import { TillPayDialog, type TillPayData } from './till-pay';
import { ReaderPayment } from './reader-payment';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, format } from 'date-fns';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  forkJoin,
  Observable,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { AxleApi } from '../../core/api/axle-api';
import { CarApi } from '../../core/api/car-api';
import { Nav } from '../../core/layout/nav';
import { carEconomy } from '../../shared/car-economy';
import { environment } from '../../../environments/environment';
import { SalesCardApi } from '../../core/api/sales-card-api';
import { PaymentApi } from '../../core/api/payment-api';
import { ZettleApi } from '../../core/api/zettle-api';
import { SalesSendDialog } from './sales-send-dialog';
import { TyreFinderDialog } from './tyre-finder';
import { Auth } from '../../core/auth/auth';
import { StorageApi } from '../../core/api/storage-api';
import { WorkshopApi } from '../../core/api/workshop-api';
import {
  CarListing,
  Article,
  CUSTOMER_TYPE_LABELS,
  Customer,
  CustomerInput,
  CustomerType,
  DocumentChoice,
  InvoiceKind,
  paidWith,
  PaymentMethod,
  paymentLabel,
  paymentOptions,
  SalesCardDetail,
  SalesCardInput,
  SalesCardOrder,
  SalesLineType,
  SalesSection,
  UnbilledOrder,
  SellerDetails,
  ServiceType,
  StorageDeposit,
  VEHICLE_CLASS_LABELS,
  Vehicle,
  VehicleClass,
} from '../../core/models';
import { Pricing } from '../../core/pricing';
import { appLocale } from '../../core/i18n/locale';
import { priceContextOf, priceOfService, today } from '../../core/service-pricing';
import { KrPipe } from '../../shared/kr-pipe';
import { HasUnsaved } from '../../core/unsaved-guard';
import { Confirm } from '../../shared/confirm';
import { Gap, invoiceGap, sellerGap } from '../../shared/invoice-gap';
import { openSettings } from '../settings/settings';
import { dueNote } from '../../shared/invoice-status';
import {
  CustomerVehiclePicker,
  type PickerValue,
} from '../../shared/customer-vehicle-picker/customer-vehicle-picker';
import type { ItemKind } from '../../shared/item-icon/item-icon';
import { LinkResolver } from '../../shared/customer-vehicle-picker/link-resolver';
import {
  groupAmounts,
  inMode,
  netOf,
  rowAmounts,
  STANDARD_VAT,
  totalsOf,
  VAT_OPTIONS,
  vatLabel,
  vatOn,
} from '../../shared/vat';

/** En rad som den redigeras: priset i kronor i kortets prisläge. */
interface Row {
  key: string;
  id?: string;
  type: SalesLineType;
  code?: string | null;
  sectionId?: string | null;
  description: string;
  articleId?: string;
  depositId?: string;
  carId?: string;
  /** Vad bilen kostade (öre); satt = vinstmarginalbeskattning. */
  vmbPurchase?: number | null;
  quantity: number;
  /** Kronor per styck, i kortets prisläge. */
  price: number;
  discountPercent: number;
  vatRate: number;
  /** Mest man kan sälja av en artikel (lagersaldot). */
  maxQty?: number;
  /** Arbetsordern raden kommer från; servern håller kopplingen, rader som läggs till här har ingen. */
  workOrderId?: string | null;
}

/**
 * En post i radtabellen: ett jobb med sina rader (som förut), eller på en samlingsfaktura en
 * arbetsorders rubrik (`head`) och delsumma (`foot`), och rubriken Övrigt för rader utan order.
 */
interface DisplayGroup {
  key: string;
  section: SalesSection | null;
  items: { r: Row; i: number }[];
  head?: SalesCardOrder;
  foot?: SalesCardOrder;
  other?: boolean;
  /** Hör till en arbetsorders block på en samlingsfaktura: ritas med orderns kantlinje. */
  inOrder?: boolean;
}

let seq = 0;
const key = () => `r${++seq}`;
const ore = (kr: number) => Math.round((kr || 0) * 100);
/** Dagen som ÅÅÅÅ-MM-DD i datorns tid. */
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
/** Mitt på dagen: en dag som skickas till servern ska inte hamna på fel datum i en annan tidszon. */
const noonOf = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/**
 * Säljkortet: en affär med kund, rader, rabatt, bokföring (kvitto eller faktura) och betalning,
 * som ett säljkort i ett affärssystem. Ett utkast kan ändras fritt; bokförs kortet minskar
 * lagret och dokumentet får sitt nummer, och därefter går bara betalningen att ändra.
 */
type PayWay = 'invoice' | 'cash_invoice' | 'till' | 'reader' | 'receipt';
interface PayWayOption {
  id: PayWay;
  icon: string;
  label: string;
  hint: string;
  disabled: boolean;
}

@Component({
  selector: 'app-sales-card',
  standalone: false,
  template: `
    <app-card-page
      [wide]="true"
      [listLink]="hall() ? '/dealership/deals' : '/sales'"
      [listLabel]="hall() ? 'Affärer' : 'Försäljning'"
      [newTitle]="hall() ? 'Ny affär' : 'Ny försäljning'"
      [title]="title()"
      [code]="card()?.code ?? null"
    >
      <div actions class="flex items-center gap-3">
        @if (card(); as c) {
          @if (c.status === 'draft') {
            <button
              mat-icon-button
              class="!text-red-700"
              aria-label="Ta bort"
              matTooltip="Ta bort"
              (click)="remove()"
            >
              <mat-icon>delete_outline</mat-icon>
            </button>
          }
          @if (c.status === 'posted') {
            @if (isOwner && !c.document?.register && !c.credit) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy() || !!reopenBlocked(c)"
                [matTooltip]="reopenBlocked(c) || 'Tar tillbaka kortet till ett utkast'"
                (click)="reopen()"
              >
                <mat-icon>undo</mat-icon> Återöppna
              </button>
            }
            @if (isOwner && c.document?.register && !c.returned) {
              <button
                mat-stroked-button
                color="warn"
                type="button"
                [disabled]="busy()"
                matTooltip="Registrerade kvitton kan inte återöppnas: de tas tillbaka med ett returkvitto"
                (click)="giveBack()"
              >
                <mat-icon>undo</mat-icon> Retur
              </button>
            }
            @if (isOwner && !c.document?.register && !c.credit && !hasCar(c)) {
              <button
                mat-stroked-button
                color="warn"
                type="button"
                [disabled]="busy()"
                matTooltip="Utfärdar en kreditfaktura som upphäver hela dokumentet"
                (click)="credit()"
              >
                <mat-icon>receipt_long</mat-icon> Kreditera
              </button>
            }
            @if (c.credit) {
              <a mat-stroked-button [routerLink]="['/sales', c.id, 'credit']">
                <mat-icon>print</mat-icon> Kreditfaktura
              </a>
            }
            <a mat-stroked-button [routerLink]="['/sales', c.id, 'invoice']">
              <mat-icon>print</mat-icon> Visa / skriv ut
            </a>
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="sendDocument()">
              <mat-icon>forward_to_inbox</mat-icon>
              {{ c.sends?.length ? 'Skicka igen' : 'Skicka' }}
            </button>
          }
        }
        @if (!readOnly()) {
          @if (!card()) {
            <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
              Spara
            </button>
          } @else {
            <!-- Ett utkast sparar sig självt en liten stund efter sista ändringen. -->
            <span class="ml-1 hidden text-xs text-gray-400 sm:inline" aria-live="polite">{{
              saveState()
            }}</span>
          }
        }
      </div>

      @if (card()?.status === 'draft' && card()?.reservedDocumentCode) {
        <p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <b>Återöppnat.</b> Kortet var
          {{ card()!.reservedKind === 'invoice' ? 'en faktura' : 'ett kvitto' }},
          {{ card()!.reservedDocumentCode }}. Rätta det som är fel och bokför igen som
          {{ card()!.reservedKind === 'invoice' ? 'faktura' : 'kvitto' }}: samma nummer används på
          nytt. Tar du bort kortet används inte numret igen.
        </p>
      }

      @if (card()?.status === 'posted') {
        <p class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <b
            >Bokfört som
            {{
              card()!.kind === 'invoice'
                ? card()!.paidOnIssue
                  ? 'kontantfaktura'
                  : 'faktura'
                : 'kvitto'
            }}
            {{ card()!.documentCode }}.</b
          >
          Kortet är låst: rader, priser och rabatt kan inte ändras (ett utfärdat dokument får inte
          ändras i efterhand). Betalningen går att ändra.
          @if (card()!.sends?.length; as n) {
            <br />
            <b>Skickat till kunden</b> {{ lastSent(card()!)
            }}{{ n > 1 ? ' (' + n + ' gånger)' : '' }}.
            @if (card()!.viewedAt) {
              Kunden har öppnat länken.
            }
          }
        </p>
      }

      @if (hall()) {
        <!-- Bilaffär: köparen, bilen och det som följer med. Inget av verkstadens (artiklar, åtgärder, däckhotell). -->
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 class="text-base font-semibold">Köpare</h2>
            @if (customer(); as cu) {
              <span class="text-sm text-gray-500">{{ cu.code }}</span>
              <a class="text-brand text-sm hover:underline" [routerLink]="['/customers', cu.id]"
                >Öppna kundkortet</a
              >
            }
            <span class="flex-1"></span>
            @if (!readOnly()) {
              <mat-button-toggle-group
                hideSingleSelectionIndicator
                [formControl]="buyer.controls.type"
                aria-label="Privatperson eller företag"
              >
                @for (t of customerTypes; track t[0]) {
                  <mat-button-toggle [value]="t[0]">{{ t[1] }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            }
          </div>
          @if (readOnly()) {
            @if (customer(); as cu) {
              <dl class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div class="lg:col-span-2">
                  <dt class="text-xs text-gray-500">
                    {{ cu.type === 'company' ? 'Företag' : 'Privatperson' }}
                  </dt>
                  <dd class="font-medium">{{ cu.name }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500">
                    {{ cu.type === 'company' ? 'Organisationsnummer' : 'Personnummer' }}
                  </dt>
                  <dd>{{ cu.orgNo || '–' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500">Telefon</dt>
                  <dd>{{ cu.phone || '–' }}</dd>
                </div>
                <div class="lg:col-span-2">
                  <dt class="text-xs text-gray-500">Adress</dt>
                  <dd>
                    {{
                      [cu.address, [cu.postalCode, cu.city].join(' ').trim()]
                        .filter((x) => x)
                        .join(', ') || '–'
                    }}
                  </dd>
                </div>
                @if (cu.type === 'company') {
                  <div class="lg:col-span-2">
                    <dt class="text-xs text-gray-500">Kontaktperson</dt>
                    <dd>{{ cu.contactPerson || '–' }}</dd>
                  </div>
                }
              </dl>
            }
          } @else {
            <!-- Som kundkortet, men i halvstorlek: ändringarna sparas på kunden när affären sparas. -->
            <div class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
              <app-customer-vehicle-picker
                class="block sm:col-span-2"
                [formControl]="linkCtl"
                [optional]="true"
                [withVehicle]="false"
                [customerLabel]="isCompany() ? 'Företagsnamn' : 'Namn'"
              />
              <mat-form-field>
                <mat-label>{{ isCompany() ? 'Organisationsnummer' : 'Personnummer' }}</mat-label>
                <input
                  matInput
                  [formControl]="buyer.controls.orgNo"
                  [placeholder]="isCompany() ? '556123-4567' : 'ÅÅMMDD-XXXX'"
                  autocomplete="off"
                />
                @if (isCompany()) {
                  <mat-hint>Krävs på faktura</mat-hint>
                }
              </mat-form-field>
              <mat-form-field>
                <mat-label>Telefon</mat-label>
                <input matInput type="tel" [formControl]="buyer.controls.phone" />
              </mat-form-field>
              <mat-form-field class="sm:col-span-2">
                <mat-label>Adress</mat-label>
                <input matInput [formControl]="buyer.controls.address" autocomplete="off" />
                <mat-hint>Krävs på faktura</mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Postnummer</mat-label>
                <input matInput [formControl]="buyer.controls.postalCode" autocomplete="off" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>Ort</mat-label>
                <input matInput [formControl]="buyer.controls.city" autocomplete="off" />
              </mat-form-field>
              @if (isCompany()) {
                <mat-form-field class="sm:col-span-2">
                  <mat-label>Kontaktperson</mat-label>
                  <input matInput [formControl]="buyer.controls.contactPerson" autocomplete="off" />
                </mat-form-field>
              }
            </div>
            <p class="text-xs text-gray-500">
              En bil säljs alltid till en namngiven köpare, aldrig som kontantförsäljning. Sök på
              namn eller telefon för att hämta en kund, eller skriv ett nytt namn.
            </p>
          }
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-base font-semibold">Bilen</h2>
          @if (carRow(); as cr) {
            <div class="flex flex-wrap items-center gap-4">
              @if (dealCar(); as car) {
                @if (car.imageUrls[0]) {
                  <img
                    [src]="media(car.imageUrls[0])"
                    alt=""
                    class="h-16 w-24 shrink-0 rounded-lg bg-gray-100 object-cover"
                  />
                } @else {
                  <span
                    class="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-400"
                  >
                    <mat-icon>directions_car</mat-icon>
                  </span>
                }
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <app-reg-plate [value]="car.regNo" size="sm" />
                    <a
                      class="truncate font-semibold hover:underline"
                      [routerLink]="['/dealership/cars', car.id]"
                      >{{ car.heading }}</a
                    >
                  </div>
                  <div class="mt-1 text-sm text-gray-600">
                    {{ car.year }}
                    @if (car.mileageKm != null) {
                      · {{ car.mileageKm / 10 | number: '1.0-0' }} mil
                    }
                    ·
                    {{
                      car.vatScheme === 'margin' ? 'Vinstmarginalbeskattning (VMB)' : 'Vanlig moms'
                    }}
                  </div>
                </div>
              } @else {
                <div class="min-w-0 flex-1 text-sm font-medium">{{ cr.description }}</div>
              }
              <div class="w-44">
                @if (readOnly()) {
                  <div class="text-right text-lg font-semibold tabular-nums">
                    {{ amounts()[carIndex()] | kr }}
                  </div>
                } @else {
                  <mat-form-field subscriptSizing="dynamic" class="w-full">
                    <mat-label>Pris, kr inkl. moms</mat-label>
                    <input
                      matInput
                      type="number"
                      min="0"
                      step="1"
                      [value]="cr.price"
                      (focus)="$any($event.target).select()"
                      (input)="edit(carIndex(), { price: $any($event.target).valueAsNumber })"
                    />
                  </mat-form-field>
                }
              </div>
              @if (!readOnly()) {
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeCar()"
                  aria-label="Välj en annan bil"
                  matTooltip="Välj en annan bil"
                >
                  <mat-icon>close</mat-icon>
                </button>
              }
            </div>
            @if (dealProfit(); as e) {
              <dl
                class="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-4"
              >
                <div>
                  <dt class="text-xs text-gray-500">Inköp och kostnader</dt>
                  <dd class="font-medium tabular-nums">{{ e.totalCost ?? 0 | kr }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500">Moms till staten</dt>
                  <dd class="font-medium tabular-nums">{{ e.vatToPay ?? 0 | kr }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500">Vinst på affären</dt>
                  <dd class="font-semibold tabular-nums">{{ e.profit ?? 0 | kr }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500">Marginal</dt>
                  <dd class="font-medium tabular-nums">{{ e.marginPercent ?? 0 }} %</dd>
                </div>
              </dl>
            }
            @if (cr.vmbPurchase != null) {
              <p class="mt-3 text-xs text-gray-500">
                Säljs med vinstmarginalbeskattning: fakturan visar ingen moms, och momsen betalas på
                vinsten (20 % av skillnaden mot inköpspriset).
              </p>
            }
          } @else if (!readOnly()) {
            <p class="mb-3 text-sm text-gray-600">Välj bilen som ska säljas.</p>
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              @for (c of carsForSale(); track c.id) {
                <button
                  type="button"
                  class="hover:bg-brand-soft flex items-center gap-3 rounded-xl border border-gray-200 p-2.5 text-left"
                  (click)="addCar(c)"
                >
                  @if (c.imageUrls[0]) {
                    <img
                      [src]="media(c.imageUrls[0])"
                      alt=""
                      class="h-12 w-[4.5rem] shrink-0 rounded-md bg-gray-100 object-cover"
                    />
                  } @else {
                    <span
                      class="grid h-12 w-[4.5rem] shrink-0 place-items-center rounded-md bg-gray-100 text-gray-400"
                    >
                      <mat-icon>directions_car</mat-icon>
                    </span>
                  }
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">{{ c.heading }}</span>
                    <span class="block text-xs text-gray-500"
                      >{{ c.regNo }}{{ c.status === 'reserved' ? ' · Reserverad' : '' }}</span
                    >
                  </span>
                  <span class="shrink-0 text-sm font-medium tabular-nums">{{
                    c.price == null ? 'Pris saknas' : (c.price | kr)
                  }}</span>
                </button>
              } @empty {
                <p class="text-sm text-gray-500 sm:col-span-2 xl:col-span-3">
                  Inga bilar att sälja. Köp in en bil under Bilar först.
                </p>
              }
            </div>
          }
        </section>

        @if (carRow()) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-1 text-base font-semibold">Tillägg</h2>
            <p class="mb-3 text-sm text-gray-600">
              Sådant som följer med affären: garanti, ägarbyte, leverans, tillbehör.
            </p>
            @for (x of extras(); track x.r.key) {
              <div class="mb-2 flex items-center gap-2">
                @if (readOnly()) {
                  <span class="min-w-0 flex-1 text-sm">{{ x.r.description }}</span>
                  <span class="w-28 text-right text-sm tabular-nums">{{
                    amounts()[x.i] | kr
                  }}</span>
                } @else {
                  <input
                    class="h-10 min-w-0 flex-1 px-2 field"
                    placeholder="Beskrivning"
                    [value]="x.r.description"
                    (input)="edit(x.i, { description: $any($event.target).value })"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="kr"
                    aria-label="Pris, kr inkl. moms"
                    class="h-10 w-28 px-2 text-right field"
                    [value]="x.r.price"
                    (focus)="$any($event.target).select()"
                    (input)="edit(x.i, { price: $any($event.target).valueAsNumber })"
                  />
                  <button
                    mat-icon-button
                    type="button"
                    (click)="removeRow(x.i)"
                    aria-label="Ta bort raden"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
            } @empty {
              @if (readOnly()) {
                <p class="text-sm text-gray-500">Inga tillägg.</p>
              }
            }
            @if (!readOnly()) {
              <div class="mt-3 flex flex-wrap gap-2">
                @for (s of extraSuggestions; track s) {
                  <button mat-stroked-button type="button" (click)="addExtra(s)">
                    <mat-icon>add</mat-icon> {{ s }}
                  </button>
                }
                <button mat-stroked-button type="button" (click)="addExtra('')">
                  <mat-icon>add</mat-icon> Annan rad
                </button>
              </div>
            }
          </section>
        }
      } @else {
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Kund och bil</h2>
          <!-- Ett kort som fakturerar arbetsorder har orderns kund; den byts inte här. -->
          @if (readOnly() || billsOrders()) {
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
              @if (orders().length > 1) {
                · Samlingsfaktura för {{ orders().length }} arbetsorder
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

          <mat-menu #addMenu="matMenu">
            <button mat-menu-item type="button" [matMenuTriggerFor]="serviceMenu">
              <mat-icon>build</mat-icon> Åtgärd
            </button>
            <button
              mat-menu-item
              type="button"
              [matMenuTriggerFor]="orderMenu"
              (menuOpened)="loadOrders()"
            >
              <mat-icon>handyman</mat-icon> Arbetsorder
            </button>
            <button mat-menu-item type="button" (click)="addLabour()">
              <mat-icon>schedule</mat-icon> Arbete
            </button>
            <button mat-menu-item type="button" (click)="addFree()">
              <mat-icon>edit_note</mat-icon> Fri rad
            </button>
          </mat-menu>
          <mat-menu #serviceMenu="matMenu">
            @for (s of serviceTypes(); track s.id) {
              <button mat-menu-item type="button" (click)="addService(s)">
                {{ s.name }}
                @if (priceHint(s); as hint) {
                  <span class="ml-2 text-gray-500">{{ hint }}</span>
                }
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">Inga åtgärder inlagda</span>
            }
          </mat-menu>
          <mat-menu #orderMenu="matMenu">
            @for (o of unbilled(); track o.id) {
              <button mat-menu-item type="button" (click)="addOrder(o)">
                {{ o.code }} · {{ o.regNo }} · klar {{ dayOf(o.doneAt) }} · {{ o.total | kr }}
                @if (o.card) {
                  <span class="ml-2 text-gray-500">(på {{ o.card.code }})</span>
                }
              </button>
            } @empty {
              <span class="px-4 py-2 text-sm text-gray-500">
                {{ ordersHint() }}
              </span>
            }
          </mat-menu>

          @if (cardsMode()) {
            <!-- Som jobben på en arbetsorder: varje rad är ett eget kort med kant och rubrik. -->
            @for (g of display(); track g.key) {
              @for (it of g.items; track it.r.key) {
                @let r = it.r;
                @let i = it.i;
                <div
                  class="mb-3 overflow-hidden rounded-xl border border-l-4 border-gray-200 border-l-teal-700 bg-white"
                >
                  <div class="flex items-center justify-between bg-gray-50 px-4 py-2.5">
                    <span class="text-xs font-semibold tracking-wide text-teal-800 uppercase"
                      >Rad {{ i + 1 }}</span
                    >
                    <span class="text-sm">
                      <span class="text-gray-500">Summa raden</span>
                      <b class="ml-2 tabular-nums">{{ amounts()[i] | kr }}</b>
                    </span>
                  </div>
                  <div
                    class="grid items-end gap-3 p-4 md:grid-cols-[minmax(0,1fr)_6rem_8rem_6rem_2.5rem]"
                  >
                    @if (r.type === 'article') {
                      <div class="flex items-center gap-3 self-center">
                        <app-item-icon [kind]="itemKind(r)" />
                        <div class="min-w-0">
                          <div class="font-medium">{{ r.description }}</div>
                          <div
                            class="truncate text-xs"
                            [class]="
                              r.maxQty !== undefined && r.quantity > r.maxQty
                                ? 'text-red-600'
                                : 'text-gray-500'
                            "
                          >
                            {{ rowSub(r) }}
                          </div>
                        </div>
                      </div>
                    } @else {
                      <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                        Vad ska säljas
                        <input
                          class="h-11 px-3 text-base text-gray-900 field"
                          placeholder="Vad ska säljas"
                          [value]="r.description"
                          (input)="edit(i, { description: $any($event.target).value })"
                        />
                      </label>
                    }
                    <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                      Antal
                      <input
                        type="number"
                        min="0"
                        [step]="r.type === 'article' ? 1 : 0.25"
                        class="h-11 px-2 text-right text-gray-900 field"
                        [value]="r.quantity"
                        (focus)="$any($event.target).select()"
                        (input)="edit(i, { quantity: $any($event.target).valueAsNumber })"
                      />
                    </label>
                    <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                      À-pris (kr)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        class="h-11 px-2 text-right text-gray-900 field"
                        [value]="r.price || ''"
                        (focus)="$any($event.target).select()"
                        (input)="edit(i, { price: $any($event.target).valueAsNumber || 0 })"
                      />
                    </label>
                    <label class="flex flex-col gap-0.5 text-xs text-gray-500">
                      Rabatt %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        class="h-11 px-2 text-right text-gray-900 field"
                        [value]="r.discountPercent || ''"
                        (focus)="$any($event.target).select()"
                        (input)="
                          edit(i, { discountPercent: $any($event.target).valueAsNumber || 0 })
                        "
                      />
                    </label>
                    <button
                      mat-icon-button
                      type="button"
                      class="justify-self-end"
                      (click)="removeRow(i)"
                      aria-label="Ta bort raden"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </div>
              }
            }
          } @else if (rows().length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[640px] text-left text-sm">
                <thead
                  class="border-b border-gray-100 text-xs font-medium tracking-wide text-gray-500 uppercase"
                >
                  <tr>
                    <th class="py-2">Beskrivning</th>
                    <th class="w-20 py-2 text-right">Antal</th>
                    <th class="w-32 py-2 text-right">À-pris</th>
                    <th class="w-24 py-2 text-right">Rabatt %</th>
                    <th class="w-28 py-2 text-right">Summa</th>
                    <th class="w-10 py-2"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (g of display(); track g.key) {
                    @if (g.head; as o) {
                      @if (!$first) {
                        <tr aria-hidden="true">
                          <td colspan="6" class="h-4 !border-0 p-0"></td>
                        </tr>
                      }
                      <tr class="bg-teal-50">
                        <td class="border-l-4 border-teal-700 py-3 pl-3" colspan="5">
                          <a
                            class="text-brand font-semibold"
                            [routerLink]="['/workorders', o.id]"
                            >{{ o.code }}</a
                          >
                          @if (o.regNo) {
                            · <span class="font-semibold">{{ o.regNo }}</span>
                          }
                          <span class="text-gray-600">
                            @if (o.vehicle) {
                              {{ o.vehicle }}
                            }
                            · {{ spanOf(o) }}
                            @if (o.yourReference) {
                              · Er ref: {{ o.yourReference }}
                            }
                          </span>
                        </td>
                        <td class="py-2 text-right">
                          @if (!readOnly()) {
                            <button
                              mat-icon-button
                              type="button"
                              matTooltip="Ta bort ordern från kortet"
                              [attr.aria-label]="'Ta bort ' + o.code + ' från kortet'"
                              (click)="removeOrder(o)"
                            >
                              <mat-icon>link_off</mat-icon>
                            </button>
                          }
                        </td>
                      </tr>
                    }
                    @if (g.other) {
                      <tr>
                        <td class="pt-4 pb-1 pl-2 font-semibold" colspan="6">Övrigt</td>
                      </tr>
                    }
                    @for (it of g.items; track it.r.key) {
                      @let r = it.r;
                      @let i = it.i;
                      <tr class="align-top">
                        <td
                          class="py-2 pr-2"
                          [class]="g.inOrder ? 'border-l-4 border-teal-700/30 pl-3' : ''"
                        >
                          @if (r.type === 'article') {
                            <!-- Som på inköpskortet: ikon, namn och en rad med nummer och lagersaldo. -->
                            <div class="flex items-center gap-3 py-1">
                              <app-item-icon [kind]="itemKind(r)" />
                              <div class="min-w-0">
                                <div class="font-medium">{{ r.description }}</div>
                                <div
                                  class="truncate text-xs"
                                  [class]="
                                    r.maxQty !== undefined && r.quantity > r.maxQty
                                      ? 'text-red-600'
                                      : 'text-gray-500'
                                  "
                                >
                                  {{ rowSub(r) }}
                                </div>
                              </div>
                            </div>
                          } @else if (readOnly() || r.type === 'storage' || r.type === 'car') {
                            <div class="py-2">{{ r.description }}</div>
                          } @else {
                            <input
                              class="h-10 w-full px-2 field"
                              [value]="r.description"
                              (input)="edit(i, { description: $any($event.target).value })"
                            />
                          }
                        </td>
                        <td class="py-2 pr-2 text-right">
                          @if (readOnly() || r.type === 'storage' || r.type === 'car') {
                            <div class="py-2 tabular-nums">{{ r.quantity }}</div>
                          } @else {
                            <input
                              type="number"
                              min="0"
                              [step]="r.type === 'article' ? 1 : 0.25"
                              class="h-10 w-full px-2 text-right field"
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
                              class="h-10 w-full px-2 text-right field"
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
                              class="h-10 w-full px-2 text-right field"
                              [value]="r.discountPercent || ''"
                              (focus)="$any($event.target).select()"
                              (input)="
                                edit(i, { discountPercent: $any($event.target).valueAsNumber || 0 })
                              "
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
                    @if (g.section; as sec) {
                      <tr class="bg-gray-50">
                        <td
                          class="py-2 pl-2 font-semibold"
                          [class]="g.inOrder ? 'border-l-4 border-teal-700/30 pl-3' : ''"
                          colspan="3"
                        >
                          Delsumma {{ sec.title }}
                        </td>
                        <td class="py-2 pr-2 text-right text-xs text-gray-500" colspan="1">
                          @if (readOnly()) {
                            {{ sec.fixedPrice != null ? 'Fast pris' : '' }}
                          } @else {
                            <input
                              type="number"
                              min="0"
                              placeholder="Fast pris"
                              aria-label="Fast pris för jobbet"
                              class="h-9 w-full px-2 text-right field"
                              [value]="sec.fixedPrice != null ? sec.fixedPrice / 100 : ''"
                              (input)="setFixed(sec.id, $any($event.target).value)"
                            />
                          }
                        </td>
                        <td class="py-2 text-right font-semibold tabular-nums">
                          {{ sectionTotals()[sec.id] ?? 0 | kr }}
                        </td>
                        <td></td>
                      </tr>
                    }
                    @if (g.foot; as o) {
                      <tr class="border-b-2 border-teal-700/30">
                        <td
                          class="border-l-4 border-teal-700/30 py-2 pl-2 text-right text-gray-600"
                          colspan="4"
                        >
                          Summa {{ o.code }}
                        </td>
                        <td class="py-2 text-right font-semibold tabular-nums">
                          {{ orderTotals()[o.id] ?? 0 | kr }}
                        </td>
                        <td></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="mb-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">Inga rader än.</p>
          }

          @if (!readOnly()) {
            @if (pickingArticle()) {
              <!-- Artikelkortet: sökfältet står här tills en artikel är vald. -->
              <div
                class="mb-3 rounded-xl border border-l-4 border-gray-200 border-l-teal-700 bg-white"
              >
                <div class="flex items-center justify-between bg-gray-50 px-4 py-2.5">
                  <span class="text-xs font-semibold tracking-wide text-teal-800 uppercase"
                    >Artikel</span
                  >
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Avbryt"
                    (click)="pickingArticle.set(false)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
                <div class="flex flex-wrap items-center gap-3 p-4">
                  <div class="relative min-w-60 flex-1">
                    <mat-icon class="pointer-events-none absolute top-3 left-3 text-gray-400"
                      >search</mat-icon
                    >
                    <input
                      #articleSearch
                      type="search"
                      [formControl]="search"
                      (keydown.enter)="addFirst()"
                      placeholder="Storlek, märke eller artikelnummer…"
                      class="h-12 w-full pr-3 pl-11 field"
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
                              @if (a.sizeLabel) {
                                <span class="font-medium">{{ a.sizeLabel }}</span> ·
                              }
                              {{ a.brand }} {{ a.model }}
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
                  <button mat-stroked-button type="button" (click)="openTyres()">
                    <mat-icon>tire_repair</mat-icon> Däck till bilen
                  </button>
                </div>
              </div>
            }
            <div class="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                class="text-brand hover:bg-brand-soft rounded-xl border border-dashed border-gray-300 py-4 font-medium"
                (click)="startArticle()"
              >
                <mat-icon class="align-middle">inventory_2</mat-icon> Lägg till artikel
              </button>
              <button
                type="button"
                class="text-brand hover:bg-brand-soft rounded-xl border border-dashed border-gray-300 py-4 font-medium"
                [matMenuTriggerFor]="addMenu"
              >
                <mat-icon class="align-middle">add</mat-icon> Lägg till ny rad
              </button>
            </div>
          }
        </section>
      }

      <ng-template #summaryBlock>
        <div class="text-sm">
          <div class="flex items-center justify-between py-1 text-gray-600">
            <span>Summa exkl. moms</span><span class="tabular-nums">{{ totals().net | kr }}</span>
          </div>
          @for (b of totals().byRate; track b.rate) {
            <div class="flex items-center justify-between py-1 text-gray-600">
              <span>{{ incl() ? 'Varav moms' : 'Moms' }} {{ b.rate }} %</span>
              <span class="tabular-nums">{{ b.vat | kr }}</span>
            </div>
          }
          @if (totals().rounding) {
            <div class="flex items-center justify-between py-1 text-gray-600">
              <span>Öresutjämning</span>
              <span class="tabular-nums">{{ totals().rounding! | kr }}</span>
            </div>
          }
          <!-- Rabatten är en rad i summan: ett fält med enheten inbyggd. -->
          <div class="flex h-9 items-center justify-between gap-4">
            <span class="text-gray-600">Rabatt</span>
            @if (readOnly()) {
              <span class="tabular-nums text-green-700">
                {{ totals().discount > 0 ? '−' + (totals().discount | kr) : '–' }}
              </span>
            } @else {
              <span
                class="inline-flex h-8 items-center overflow-hidden rounded-md border border-gray-300 text-sm focus-within:border-teal-700"
              >
                <input
                  class="h-full w-16 bg-transparent px-2 text-right outline-none"
                  inputmode="decimal"
                  placeholder="0"
                  aria-label="Rabatt"
                  [value]="discText()"
                  (input)="setDiscText($any($event.target).value)"
                />
                <button
                  type="button"
                  class="h-full w-8 border-l border-gray-300"
                  aria-label="Procent"
                  [class.bg-teal-700]="discType() === 'percent'"
                  [class.text-white]="discType() === 'percent'"
                  (click)="setDiscType('percent')"
                >
                  %
                </button>
                <button
                  type="button"
                  class="h-full w-8 border-l border-gray-300"
                  aria-label="Kronor"
                  [class.bg-teal-700]="discType() === 'amount'"
                  [class.text-white]="discType() === 'amount'"
                  (click)="setDiscType('amount')"
                >
                  kr
                </button>
              </span>
            }
          </div>
          <div class="mt-2 flex items-baseline justify-between gap-6 border-t border-gray-200 pt-3">
            <span class="text-base font-semibold">Att betala</span>
            <span class="text-xl font-semibold tabular-nums">{{ totals().total | kr }}</span>
          </div>
          <p class="mt-1 text-right text-xs text-gray-400">inkl. moms</p>
        </div>
      </ng-template>
      @if (card()?.status !== 'draft') {
        <div class="flex justify-end">
          <section class="w-full rounded-xl bg-white p-5 shadow-sm md:max-w-md">
            <ng-container *ngTemplateOutlet="summaryBlock" />
          </section>
        </div>
      }

      <ng-template #textBlock>
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-1 text-base font-semibold">Text och anteckning</h2>
          @if (showText()) {
            <div class="mt-3">
              <div class="grid gap-x-4 sm:grid-cols-2">
                <mat-form-field class="sm:col-span-2">
                  <mat-label>{{
                    hall() ? 'Villkor och text på fakturan' : 'Text under raderna på kvittot'
                  }}</mat-label>
                  <textarea
                    matInput
                    rows="2"
                    [disabled]="readOnly()"
                    [value]="performed()"
                    (input)="performed.set($any($event.target).value); touch()"
                    [placeholder]="
                      hall()
                        ? 't.ex. Bilen säljs i befintligt skick. Leverans den 15 november.'
                        : 't.ex. Bytt däck och balanserat'
                    "
                  ></textarea>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Garanti</mat-label>
                  <input
                    matInput
                    [placeholder]="hall() ? 't.ex. 12 månaders begagnatgaranti' : ''"
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
            </div>
          }
        </section>
      </ng-template>

      @if (!card()) {
        <ng-container *ngTemplateOutlet="textBlock" />
      }
      @if (card(); as c) {
        @if (c.status === 'draft') {
          <div class="grid items-start gap-4 lg:grid-cols-[1fr_42rem]">
            <ng-container *ngTemplateOutlet="textBlock" />
            <section class="rounded-xl bg-white p-5 shadow-sm">
              <div class="grid gap-5 sm:grid-cols-[16rem_1fr] sm:gap-0">
                <nav
                  class="flex flex-col gap-1 sm:pr-5"
                  role="radiogroup"
                  aria-label="Hur betalar kunden?"
                >
                  @for (o of wayOptions(); track o.id) {
                    <div>
                      <button
                        type="button"
                        role="radio"
                        class="flex items-center gap-3 rounded-lg px-3 py-2 text-left disabled:opacity-40"
                        [attr.aria-checked]="way() === o.id"
                        [class.bg-teal-50]="way() === o.id"
                        [class.text-teal-900]="way() === o.id"
                        [class.hover:bg-gray-50]="way() !== o.id"
                        [disabled]="readerWaiting() || o.disabled"
                        (click)="chooseWay(o.id)"
                      >
                        <mat-icon [class.text-teal-700]="way() === o.id" class="text-gray-500">{{
                          o.icon
                        }}</mat-icon>
                        <span>
                          <span class="block text-sm font-medium leading-tight">{{ o.label }}</span>
                          <span class="block text-xs leading-tight text-gray-500">{{
                            o.hint
                          }}</span>
                        </span>
                      </button>
                      @if (way() === o.id) {
                        @switch (o.id) {
                          @case ('invoice') {
                            <div class="mb-1 ml-12 mr-3 mt-1 text-xs text-gray-600">
                              <label class="flex items-center gap-2">
                                Betalningsvillkor
                                <input
                                  class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-teal-700 w-16 text-right"
                                  type="number"
                                  min="0"
                                  max="365"
                                  aria-label="Betalningsvillkor i dagar"
                                  [value]="terms()"
                                  (input)="termsDays.set($any($event.target).valueAsNumber)"
                                />
                                dagar
                              </label>
                              <p class="mt-1 text-gray-500">Förfaller {{ dueDate() }}</p>
                            </div>
                          }
                          @case ('cash_invoice') {
                            <label
                              class="mb-1 ml-12 mr-3 mt-1 flex items-center gap-2 text-xs text-gray-600"
                            >
                              Betalsätt
                              <select
                                class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-teal-700"
                                aria-label="Betalsätt"
                                (change)="receiptMethod.set($any($event.target).value)"
                              >
                                @for (m of receiptMethods; track m[0]) {
                                  <option [value]="m[0]" [selected]="m[0] === receiptMethod()">
                                    {{ m[1] }}
                                  </option>
                                }
                              </select>
                            </label>
                          }
                          @case ('receipt') {
                            <label
                              class="mb-1 ml-12 mr-3 mt-1 flex items-center gap-2 text-xs text-gray-600"
                            >
                              Betalsätt
                              <select
                                class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-teal-700"
                                aria-label="Betalsätt"
                                (change)="receiptMethod.set($any($event.target).value)"
                              >
                                @for (m of receiptMethods; track m[0]) {
                                  <option [value]="m[0]" [selected]="m[0] === receiptMethod()">
                                    {{ m[1] }}
                                  </option>
                                }
                              </select>
                            </label>
                          }
                        }
                      }
                    </div>
                  }
                </nav>
                <div
                  class="flex flex-col border-t border-gray-200 pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"
                >
                  <ng-container *ngTemplateOutlet="summaryBlock" />
                  <div class="my-4 border-t border-gray-200"></div>
                  @if (way() === 'reader') {
                    <app-reader-payment
                      [cardId]="c.id"
                      [showStart]="false"
                      (waitingChange)="readerWaiting.set($event)"
                      (booked)="readerWaiting.set(false); load(c.id)"
                    />
                  }
                  @if (blocker(); as b) {
                    <app-callout class="mt-3" [fixes]="b.fixes">{{ b.text }}</app-callout>
                  }
                  <!-- Knapparna ligger alltid längst ned, samma som i kortets huvud. -->
                  <div
                    class="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4"
                  >
                    <a
                      mat-stroked-button
                      [routerLink]="['/sales', c.id, 'invoice']"
                      [queryParams]="choiceParams()"
                      [class.pointer-events-none]="
                        dirty() || !rows().length || way() === 'till' || way() === 'reader'
                      "
                      [class.opacity-40]="way() === 'till' || way() === 'reader'"
                    >
                      <mat-icon>visibility</mat-icon> Förhandsgranska
                    </a>
                    @if (primary(); as pr) {
                      <button
                        mat-flat-button
                        color="primary"
                        type="button"
                        [disabled]="
                          dirty() || busy() || readerWaiting() || !rows().length || !!blocker()
                        "
                        (click)="pr.run()"
                      >
                        <mat-icon>{{ pr.icon }}</mat-icon> {{ pr.label }}
                      </button>
                    }
                  </div>
                </div>
              </div>
            </section>
          </div>
        } @else if (c.document; as inv) {
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <h2 class="mb-2 text-base font-semibold">
              {{ inv.kind === 'invoice' ? 'Betalning av fakturan' : 'Betalning' }}
            </h2>
            @if (inv.kind === 'receipt') {
              <!-- Ett kvitto är betalt när det utfärdas: det finns ingenting att registrera efteråt. -->
              <div class="flex flex-wrap items-center gap-3">
                <app-pill tone="green"
                  >Betalt {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                  @if (inv.paymentMethod) {
                    · {{ payLabel(inv.kind, inv.paymentMethod) }}
                  }
                </app-pill>
                <span class="text-sm text-gray-600"
                  >Ett kvitto är betalt när det utfärdas.
                  {{
                    inv.register
                      ? 'Blev det fel: ta tillbaka kvittot med en retur.'
                      : 'Blev det fel: återöppna kortet.'
                  }}</span
                >
              </div>
              @if (inv.register; as r) {
                <p class="mt-3 text-sm text-gray-600">
                  Registrerat i kassaregistret: kvitto <b>{{ r.receiptNumber }}</b
                  >, Z-rapport {{ r.zNumber }}.
                  @if (!r.certified) {
                    <span class="font-medium text-red-700">
                      Utvecklingsläge – inte ett giltigt kvitto.</span
                    >
                  }
                </p>
              }
              @if (inv.till; as t) {
                <p class="mt-3 text-sm text-gray-600">
                  Betalt i PayPal-kassan: kassakvitto nr <b>{{ t.number ?? '–' }}</b
                  >.
                </p>
              }
              @if (c.returned; as ret) {
                <p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  Tillbakatagen med returkvitto {{ ret.receiptNumber }}: {{ ret.reason }}.
                </p>
              }
            } @else if (c.credit; as cr) {
              <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Krediterad med <b>{{ cr.code }}</b> {{ cr.issuedAt | date: 'yyyy-MM-dd' }}:
                {{ cr.reason }}. {{ cr.restocked ? 'Delarna är tillbaka i lagret.' : '' }}
                @if (inv.paidAt && !inv.paymentReference) {
                  Kunden hade betalat: betala tillbaka kunden själv.
                }
              </p>
            } @else if (inv.paidOnIssue) {
              <!-- Kontantfaktura: betald vid disken när den utfärdades; betalningen går inte att ångra. -->
              <div class="flex flex-wrap items-center gap-3">
                <app-pill tone="green"
                  >Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                  @if (inv.paymentMethod) {
                    · {{ payLabel('receipt', inv.paymentMethod) }}
                  }
                </app-pill>
                <span class="text-sm text-gray-600"
                  >Kontantfaktura: betald vid disken när den utfärdades.
                  {{
                    inv.paymentReference
                      ? 'Blev det fel: kreditera den, så kan pengarna gå tillbaka till kortet.'
                      : 'Blev det fel: återöppna kortet, eller kreditera det om det redan skickats.'
                  }}</span
                >
              </div>
            } @else {
              @if (inv.dueAt) {
                <p class="mb-3 text-sm text-gray-600">
                  Förfaller <b>{{ inv.dueAt | date: 'yyyy-MM-dd' }}</b>
                  @if (late(inv)) {
                    <span class="font-medium text-red-700"> · {{ late(inv) }}</span>
                  } @else if (!inv.paidAt) {
                    <span> · {{ dueNote(inv) }}</span>
                  }
                </p>
              }
              <div class="flex flex-wrap items-center gap-3">
                @if (inv.paidAt) {
                  <app-pill tone="green"
                    >Betald {{ inv.paidAt | date: 'yyyy-MM-dd' }}
                    @if (inv.paymentMethod) {
                      · {{ payLabel(inv.kind, inv.paymentMethod) }}
                    }
                  </app-pill>
                  @if (inv.paymentReference) {
                    <span class="text-sm text-gray-600"
                      >Betald med kort via Stripe. Ska pengarna tillbaka: kreditera fakturan.</span
                    >
                  } @else {
                    <button mat-button type="button" (click)="setPaid(false)">
                      Ångra betalning
                    </button>
                  }
                } @else {
                  <mat-form-field subscriptSizing="dynamic" class="w-48">
                    <mat-label>Betalsätt</mat-label>
                    <mat-select
                      [value]="payMethod()"
                      (selectionChange)="payMethod.set($event.value)"
                    >
                      @for (m of payOptions(); track m[0]) {
                        <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <app-date-field
                    class="w-48"
                    label="Betaldatum"
                    subscript="dynamic"
                    [max]="today"
                    [formControl]="paidOn"
                  />
                  <button mat-flat-button color="primary" type="button" (click)="setPaid(true)">
                    Markera betald
                  </button>
                }
              </div>
              @if (!inv.paidAt) {
                <app-reader-payment
                  [cardId]="c.id"
                  (waitingChange)="readerWaiting.set($event)"
                  (booked)="readerWaiting.set(false); load(c.id)"
                />
              }
            }
          </section>
        }

        @if (c.status !== 'draft') {
          <ng-container *ngTemplateOutlet="textBlock" />
        }

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-2 text-base font-semibold">Hör ihop med</h2>
          <div class="flex flex-wrap gap-2 text-sm">
            @if (hall() && carRow()?.carId; as cid) {
              <a mat-stroked-button [routerLink]="['/dealership/cars', cid]">
                <mat-icon>directions_car</mat-icon> Bilen
              </a>
            }
            @if (c.document?.code; as docCode) {
              <a mat-stroked-button [routerLink]="['/sales', c.id, 'invoice']">
                <mat-icon>receipt_long</mat-icon> {{ docCode }}
              </a>
            }
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
            @for (
              w of c.links.workOrders ?? (c.links.workOrder ? [c.links.workOrder] : []);
              track w.id
            ) {
              <a mat-stroked-button [routerLink]="['/workorders', w.id]">
                <mat-icon>handyman</mat-icon> {{ w.code }}
              </a>
            }
            @for (d of c.links.deposits; track d.id) {
              <a mat-stroked-button [routerLink]="['/storage', d.id]">
                <mat-icon>warehouse</mat-icon> {{ d.code }} · {{ d.regNo }}
              </a>
            }
            @if (
              !hall() &&
              !c.links.customer &&
              !c.links.vehicle &&
              !c.links.workOrder &&
              !c.links.deposits.length
            ) {
              <span class="text-gray-500">Kontantförsäljning utan kund.</span>
            }
          </div>
        </section>
      }
    </app-card-page>
  `,
})
export class SalesCardPage implements OnInit, OnDestroy, HasUnsaved {
  private readonly api = inject(SalesCardApi);
  private readonly payments = inject(PaymentApi);
  private readonly zettleApi = inject(ZettleApi);
  private readonly inventory = inject(AxleApi);
  private readonly storage = inject(StorageApi);
  private readonly workshop = inject(WorkshopApi);
  private readonly pricing = inject(Pricing);
  private readonly links = inject(LinkResolver);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(Auth);
  private readonly carApi = inject(CarApi);
  private readonly nav = inject(Nav);
  /**
   * En bilaffär (Hall) och inte en verkstadsaffär: ett sparat kort säger det själv (det har en
   * bilrad), ett nytt kort följer produkten man kom från. Hall visar bara köparen, bilen och
   * tilläggen; verkstadens artiklar, åtgärder och däckhotell hör inte dit.
   */
  readonly hall = computed(() => {
    const c = this.card();
    return c ? c.product === 'hall' : this.nav.product() === 'hall';
  });
  readonly media = (path: string | null) => (path ? environment.apiUrl + path : '');
  readonly extraSuggestions = ['Garanti', 'Ägarbyte och registrering', 'Leverans', 'Tillbehör'];
  readonly cars = { enabled: () => !this.auth.isMechanic() };
  readonly carsForSale = signal<CarListing[]>([]);
  /** Bara ägaren återöppnar ett bokfört kort. */
  readonly isOwner = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly payLabel = paymentLabel;
  readonly dueNote = dueNote;
  readonly receiptMethods = paymentOptions('receipt');
  readonly vatOptions = VAT_OPTIONS;
  readonly vatLabel = vatLabel;
  /** Kortets prisläge: inkl. moms (standard) eller exkl. moms. */
  readonly incl = signal(true);
  /** Valt för hand eller kommer från ett sparat kort, så kundbyte inte ändrar det. */
  private inclFixed = false;
  readonly sections = signal<SalesSection[]>([]);
  /** Kunden, för kundtyp och kundrabatt. */
  protected readonly customer = signal<Customer | null>(null);
  /** Bilen, för åtgärdernas pris efter klass och fälgstorlek. */
  protected readonly vehicle = signal<Vehicle | null>(null);
  /** Utan bil på kortet: det fordon man valt för hand, så att åtgärderna ändå får rätt pris. */
  readonly manualClass = signal<VehicleClass | null>(null);
  readonly classOptions = (Object.entries(VEHICLE_CLASS_LABELS) as [VehicleClass, string][]).map(
    ([value, label]) => ({ value, label }),
  );

  readonly card = signal<SalesCardDetail | null>(null);
  readonly rows = signal<Row[]>([]);
  /** Bilen på kortet (en bilaffär har en), dess plats i radlistan och det som följer med. */
  readonly carRow = computed(() => this.rows().find((r) => r.type === 'car') ?? null);
  readonly carIndex = computed(() => this.rows().findIndex((r) => r.type === 'car'));
  readonly extras = computed(() =>
    this.rows()
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.type !== 'car'),
  );
  /** Bilens böcker (inköp, kostnader, momsregim), för vinsten på affären. */
  readonly dealCar = signal<CarListing | null>(null);
  /** Vad affären ger: priset på kortet (efter rabatt) mot bilens inköp och kostnader. */
  readonly dealProfit = computed(() => {
    const car = this.dealCar();
    const i = this.carIndex();
    if (!car || i < 0) return null;
    return carEconomy({ ...car, status: 'sold', soldPrice: this.amounts()[i] ?? 0 });
  });
  readonly linkCtl = new FormControl<PickerValue | null>(null);
  readonly customerTypes = Object.entries(CUSTOMER_TYPE_LABELS);
  /**
   * Köparens uppgifter i en bilaffär: som kundkortet i halvstorlek. De hör till kunden och sparas
   * dit när affären sparas (`saveBuyer`); bara fält som ändrats skickas.
   */
  readonly buyer = new FormGroup({
    type: new FormControl<CustomerType>('private', { nonNullable: true }),
    orgNo: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
    contactPerson: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });
  readonly isCompany = () => this.buyer.controls.type.value === 'company';
  private readonly link = signal<PickerValue | null>(null);
  readonly discType = signal<'percent' | 'amount'>('percent');
  readonly discValue = signal(0);
  readonly discReason = signal('');
  readonly note = signal('');
  readonly performed = signal('');
  readonly warranty = signal('');
  readonly dirty = signal(false);
  readonly busy = signal(false);
  /** Hur kunden betalar. Gäller ett bokfört dokument: en faktura betalas oftast in på banken. */
  readonly payMethod = signal<PaymentMethod>('card');
  /** Dagen betalningen kom in (standard i dag); en faktura betalas ofta dagar efter att den bokfördes. */
  readonly today = ymd(new Date());
  readonly paidOn = new FormControl(ymd(new Date()), { nonNullable: true });
  readonly payOptions = computed(() => paymentOptions(this.card()?.kind ?? 'receipt'));

  /**
   * Vad kunden får när kortet bokförs: faktura (betalar senare) eller kvitto (betalar nu). Valt för
   * hand, annars följer det kunden: ett företag får faktura, alla andra kvitto. "Ny faktura" på
   * Fakturor börjar med faktura (`?kind=invoice`).
   */
  readonly docKind = signal<InvoiceKind | null>(null);
  /**
   * Allt faktureras (Inställningar → Betalning och kassa): inga kvitton, en försäljning som betalas
   * vid disken blir en kontantfaktura. Ett återöppnat kvitto bokförs ändå som det kvitto det var.
   */
  readonly alwaysInvoice = computed(() => this.pricing.value().alwaysInvoice);
  readonly receiptsAllowed = computed(
    () => !this.alwaysInvoice() || this.card()?.reservedKind === 'receipt',
  );
  readonly kind = computed<InvoiceKind>(() => {
    const reserved = this.card()?.kind ?? this.card()?.reservedKind;
    // Ett återöppnat kort är samma dokument igen: numret hör till dess serie.
    if (reserved) return reserved;
    if (this.alwaysInvoice()) return 'invoice';
    return (
      this.docKind() ??
      // En bil betalas nästan alltid mot faktura; ett kvitto är ett val.
      (this.hall() || this.customer()?.type === 'company' ? 'invoice' : 'receipt')
    );
  });
  /** Vald för hand: en faktura som betalas nu vid disken (kontantfaktura) eller senare. */
  private readonly paidNowChoice = signal<boolean | null>(null);
  /**
   * Faktura, kontantfaktura eller kvitto. Där allt faktureras blir en privatperson en kontantfaktura
   * (betalar vid disken) och ett företag en vanlig faktura, tills man väljer annat.
   */
  readonly docOption = computed<'invoice' | 'cash_invoice' | 'receipt'>(() => {
    if (this.kind() === 'receipt') return 'receipt';
    // Bara där allt faktureras; annars finns valet inte.
    if (!this.alwaysInvoice()) return 'invoice';
    const paidNow = this.paidNowChoice() ?? (!this.hall() && this.customer()?.type !== 'company');
    return paidNow ? 'cash_invoice' : 'invoice';
  });
  /** En betalning väntar på läsaren: kortet ändras och bokförs inte under tiden. */
  readonly readerWaiting = signal(false);

  chooseDoc(option: 'invoice' | 'cash_invoice' | 'receipt') {
    this.wayOverride.set(null);
    this.docKind.set(option === 'receipt' ? 'receipt' : 'invoice');
    this.paidNowChoice.set(option === 'cash_invoice');
  }

  /** PayPal-kassan är ansluten (och affären är en verkstadsaffär): då finns "Betald i PayPal-kassan". */
  readonly tillOn = signal(false);
  /** Stripe är kopplat och en kortläsare är registrerad. */
  readonly readerOn = signal(false);
  /** Valt sätt som inte är ett dokumentval: PayPal-kassan eller kortläsaren. */
  private readonly wayOverride = signal<'till' | 'reader' | null>(null);
  /**
   * Hur kunden betalar, det enda val som styr resten av rutan. Utan eget val: faktura för ett
   * företag, annars PayPal-kassan när den är ansluten, annars kvitto.
   */
  readonly way = computed<PayWay>(() => {
    const o = this.wayOverride();
    if (o === 'till' && this.tillOn() && !this.hall()) return 'till';
    if (o === 'reader' && this.readerOn()) return 'reader';
    const d = this.docOption();
    if (
      d === 'receipt' &&
      this.docKind() === null &&
      this.tillOn() &&
      !this.hall() &&
      !this.card()?.reservedKind
    ) {
      return 'till';
    }
    return d;
  });
  /** Vilket dokument sättet ger: PayPal-kassan ger alltid ett kvitto. */
  private readonly effectiveKind = computed<InvoiceKind>(() =>
    this.way() === 'till' ? 'receipt' : this.kind(),
  );
  readonly wayOptions = computed<PayWayOption[]>(() => {
    const reserved = this.card()?.reservedKind;
    const noInvoice = reserved === 'receipt';
    const noReceipt = reserved === 'invoice';
    const out: PayWayOption[] = [
      {
        id: 'invoice',
        icon: 'description',
        label: 'Faktura',
        hint: 'Kunden betalar senare',
        disabled: noInvoice,
      },
    ];
    if (this.alwaysInvoice()) {
      out.push({
        id: 'cash_invoice',
        icon: 'paid',
        label: 'Betald nu',
        hint: 'Kontantfaktura, betald vid disken',
        disabled: noInvoice,
      });
    }
    if (this.tillOn() && !this.hall()) {
      out.push({
        id: 'till',
        icon: 'point_of_sale',
        label: 'PayPal-kassan',
        hint: 'Slås in i kassan, som ger kvittot',
        disabled: noReceipt,
      });
    }
    if (this.readerOn()) {
      out.push({
        id: 'reader',
        icon: 'contactless',
        label: 'Kortläsare',
        hint: 'Kunden knackar kortet',
        disabled: noReceipt,
      });
    }
    if (this.receiptsAllowed()) {
      out.push({
        id: 'receipt',
        icon: 'receipt',
        label: 'Annat betalsätt',
        hint: 'Kort, Swish eller kontant utan kassa',
        disabled: noReceipt,
      });
    }
    return out;
  });

  /** Kortets stora knapp i huvudet: vad som händer beror på hur kunden betalar. */
  readonly primary = computed<{ label: string; icon: string; run: () => void } | null>(() => {
    switch (this.way()) {
      case 'invoice':
        return { label: 'Bokför som faktura', icon: 'receipt_long', run: () => this.post() };
      case 'cash_invoice':
        return {
          label: `Bokför som betald (${paymentLabel('receipt', this.receiptMethod()).toLowerCase()})`,
          icon: 'receipt_long',
          run: () => this.post(),
        };
      case 'receipt':
        return { label: 'Bokför som kvitto', icon: 'receipt_long', run: () => this.post() };
      case 'till':
        return { label: 'Starta betalning', icon: 'point_of_sale', run: () => this.openTill() };
      case 'reader':
        return {
          label: 'Ta betalt på läsaren',
          icon: 'contactless',
          run: () => this.reader?.start(),
        };
    }
  });

  @ViewChild(ReaderPayment) private reader?: ReaderPayment;

  /** Öppnar stegen för PayPal-kassan; dialogen hittar köpet och bokför kortet. */
  openTill() {
    const c = this.card();
    if (!c) return;
    this.dialog
      .open<TillPayDialog, TillPayData, boolean>(TillPayDialog, {
        data: { cardId: c.id, cardCode: c.code, total: this.totals().total },
        width: '520px',
        maxWidth: '95vw',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((ok) => ok && this.load(c.id));
  }

  /** Rabatten skrivs som ett fält: "10%" är procent, annars kronor; "100+50" räknas ihop. */
  readonly discText = signal('');
  readonly discHint = computed(() =>
    this.discValue() > 0
      ? this.discType() === 'percent'
        ? `${this.discValue()} % av summan`
        : `${this.discValue()} kr av summan`
      : 'Procent (10%) eller kronor',
  );

  setDiscText(raw: string) {
    this.discText.set(raw);
    // Kronor eller procent väljs bredvid fältet; "100+50" räknas ihop.
    const parts = raw
      .replace(/\s/g, '')
      .replace(/,/g, '.')
      .split('+')
      .filter((x) => x !== '');
    const nums = parts.map((x) => (/^\d*\.?\d+$/.test(x) ? Number(x) : NaN));
    const sum = nums.every((n) => !Number.isNaN(n)) ? nums.reduce((x, y) => x + y, 0) : 0;
    this.discValue.set(this.discType() === 'percent' ? Math.min(sum, 100) : sum);
    this.touch();
  }

  setDiscType(type: 'percent' | 'amount') {
    this.discType.set(type);
    this.setDiscText(this.discText());
  }

  readonly wayIcon = computed(() => this.wayOptions().find((o) => o.id === this.way())?.icon ?? '');
  readonly wayLabel = computed(
    () => this.wayOptions().find((o) => o.id === this.way())?.label ?? '',
  );

  /** Text och anteckning är hopfälld tills något står där (eller man öppnar den). */
  readonly showText = signal(true);
  readonly hasText = () =>
    !!(this.performed().trim() || this.warranty().trim() || this.note().trim());

  chooseWay(id: PayWay) {
    if (id === 'till' || id === 'reader') {
      this.wayOverride.set(id);
      return;
    }
    this.chooseDoc(id);
  }
  /** Betalningsvillkoren som verkstaden har ställt in (Företaget), tills man skriver egna dagar. */
  private readonly defaultTerms = signal(30);
  readonly termsDays = signal<number | null>(null);
  readonly terms = computed(() => {
    const t = this.termsDays();
    return t != null && Number.isFinite(t) && t >= 0
      ? Math.min(Math.round(t), 365)
      : (this.customer()?.paymentTermsDays ?? this.defaultTerms());
  });
  readonly dueDate = computed(() => ymd(addDays(new Date(), this.terms())));
  readonly receiptMethod = signal<PaymentMethod>('card');

  /** Verkstadens egna uppgifter (Inställningar → Företaget): varje faktura och kvitto bär dem. */
  private readonly seller = signal<SellerDetails | null>(null);
  /**
   * Valet som löser en faktura som inte går att skriva: ett kvitto kräver varken kund eller adress.
   * Finns inte där allt faktureras.
   */
  private readonly receiptFix = {
    label: 'Bokför som kvitto',
    icon: 'receipt',
    click: () => this.chooseDoc('receipt'),
  };
  private readonly receiptFixes = () => (this.receiptsAllowed() ? [this.receiptFix] : []);

  /**
   * Det som hindrar bokföring just nu, med en knapp dit det rättas. Först verkstadens egna uppgifter
   * (gäller faktura och kvitto), sedan en faktura som behöver en kund med adress.
   */
  readonly blocker = computed<Gap | null>(() => {
    const own = sellerGap(this.seller(), this.isOwner, () => this.openCompanySettings());
    if (own) return own;
    const l = this.link();
    if (this.hall() && !l?.customerId && !l?.pending?.customerId && !l?.pending?.customerName) {
      return { text: 'Välj köparen: en bil säljs aldrig som kontantförsäljning.', fixes: [] };
    }
    if (this.hall()) {
      // Köparens uppgifter står på kortet ovan, så ingen länk till kundkortet behövs.
      const cu = this.customer();
      if (this.effectiveKind() !== 'invoice' || !cu) return null;
      const missing = [
        cu.type === 'company' && !cu.orgNo && 'organisationsnummer',
        !(cu.address && cu.postalCode && cu.city) && 'adress',
      ].filter(Boolean);
      const orReceipt = this.receiptsAllowed() ? ', eller bokför som kvitto' : '';
      return missing.length
        ? {
            text: `Köparen saknar ${missing.join(' och ')}. Fyll i det under Köpare och spara${orReceipt}.`,
            fixes: this.receiptFixes(),
          }
        : null;
    }
    if (this.effectiveKind() !== 'invoice') return null;
    if (!l?.customerId && !l?.pending?.customerId && !l?.pending?.customerName) {
      return {
        text: this.receiptsAllowed()
          ? 'En faktura behöver en kund. Välj kund högst upp, eller bokför som kvitto.'
          : 'Allt faktureras här, så varje försäljning behöver en kund med namn och adress. Välj kund högst upp.',
        fixes: this.receiptFixes(),
      };
    }
    const gap = invoiceGap(this.customer());
    return gap && { ...gap, fixes: [...gap.fixes, ...this.receiptFixes()] };
  });

  /** Öppnar Inställningar → Företaget och läser om uppgifterna när man stänger. */
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
        this.defaultTerms.set(s.paymentTermsDays);
      });
  }

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly deposits = signal<StorageDeposit[]>([]);
  readonly depositsHint = signal('Välj en kund först för att se kundens däckhotell.');
  /** Kundens klara arbetsorder som inte är fakturerade och inte redan på kortet. */
  readonly unbilled = signal<UnbilledOrder[]>([]);
  readonly ordersHint = signal('Välj en kund först för att se kundens klara arbetsorder.');

  readonly readOnly = computed(() => this.card()?.status === 'posted' || this.readerWaiting());
  readonly title = computed(() => {
    const c = this.card();
    if (!c) return '';
    return [c.carLabel ?? c.regNo, c.customerName ?? 'Kontantkund'].filter(Boolean).join(' · ');
  });

  private readonly priced = computed(() =>
    this.rows().map((r) => ({
      quantity: r.quantity || 0,
      unitPrice: ore(r.price),
      discountPercent: r.discountPercent || 0,
      vatRate: r.vatRate,
      group: r.sectionId ?? null,
      ...(r.vmbPurchase != null ? { margin: { purchase: r.vmbPurchase } } : {}),
    })),
  );
  private readonly groups = computed(() =>
    this.sections()
      .filter((x) => x.fixedPrice != null)
      .map((x) => ({ id: x.id, fixedPrice: x.fixedPrice })),
  );
  /**
   * Raderna under sina jobb, sedan raderna utan jobb; med radens index. På en samlingsfaktura (två
   * arbetsorder eller fler) står varje orders jobb och rader under orderns rubrik med delsumma.
   */
  readonly display = computed<DisplayGroup[]>(() => {
    const items = this.rows().map((r, i) => ({ r, i }));
    const groupsOf = (its: typeof items, secs: SalesSection[], prefix = ''): DisplayGroup[] => {
      const ids = new Set(secs.map((x) => x.id));
      return [
        ...secs.map((section) => ({
          key: prefix + section.id,
          section,
          items: its.filter((x) => x.r.sectionId === section.id),
        })),
        {
          key: prefix + '_',
          section: null,
          items: its.filter((x) => !x.r.sectionId || !ids.has(x.r.sectionId)),
        },
      ].filter((g) => g.items.length || g.section);
    };
    const orders = this.orders();
    if (orders.length < 2) return groupsOf(items, this.sections());
    const ids = new Set(orders.map((o) => o.id));
    const loose = (x: { workOrderId?: string | null }) => !x.workOrderId || !ids.has(x.workOrderId);
    const out: DisplayGroup[] = [];
    for (const o of orders) {
      const mine = groupsOf(
        items.filter((x) => x.r.workOrderId === o.id),
        this.sections().filter((x) => x.workOrderId === o.id),
        `${o.id}-`,
      );
      out.push(
        { key: `head-${o.id}`, section: null, items: [], head: o, inOrder: true },
        ...mine.map((g) => ({ ...g, inOrder: true })),
      );
      // Varje order slutar med sin summa, även med ett enda jobb, så blocken ser likadana ut.
      out.push({ key: `foot-${o.id}`, section: null, items: [], foot: o, inOrder: true });
    }
    const rest = groupsOf(
      items.filter((x) => loose(x.r)),
      this.sections().filter(loose),
      'rest-',
    );
    if (rest.length) out.push({ key: 'other', section: null, items: [], other: true }, ...rest);
    return out;
  });
  /** Arbetsorderna kortet fakturerar (servern håller listan). */
  readonly orders = computed(() => this.card()?.orders ?? []);
  /** Kortet fakturerar arbetsorder (även ett äldre kort som bara känner sin order till id). */
  readonly billsOrders = computed(() => this.orders().length > 0 || !!this.card()?.links.workOrder);
  /** Varje arbetsorders delsumma medan man skriver, före kortrabatt. */
  readonly orderTotals = computed(() => {
    const amounts = rowAmounts(this.priced(), null, this.groups());
    const out: Record<string, number> = {};
    this.rows().forEach((r, i) => {
      if (r.workOrderId) out[r.workOrderId] = (out[r.workOrderId] ?? 0) + amounts[i];
    });
    return out;
  });
  readonly dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
  /** Arbetets tid på ordern ("12 nov 08:00–16:00"); äldre kort har bara dagen ordern blev klar. */
  readonly spanOf = (o: SalesCardOrder) => {
    if (!o.startAt) return this.dayOf(o.doneAt);
    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
    const start = `${this.dayOf(o.startAt)} ${time(o.startAt)}`;
    if (!o.endAt || new Date(o.endAt) <= new Date(o.startAt)) return start;
    return this.dayOf(o.endAt) === this.dayOf(o.startAt)
      ? `${start}–${time(o.endAt)}`
      : `${start} – ${this.dayOf(o.endAt)} ${time(o.endAt)}`;
  };
  readonly sectionTotals = computed(() =>
    groupAmounts(this.priced(), rowAmounts(this.priced(), null, this.groups())),
  );
  private readonly discount = computed(() =>
    this.discValue() > 0
      ? {
          type: this.discType(),
          value: this.discType() === 'amount' ? ore(this.discValue()) : this.discValue(),
        }
      : null,
  );
  readonly amounts = computed(() => rowAmounts(this.priced(), this.discount(), this.groups()));
  /** Summan medan man skriver; efter bokföring gäller det som frystes. */
  readonly totals = computed(() =>
    this.readOnly() && this.card()?.document
      ? this.card()!.document!.totals
      : totalsOf(this.priced(), this.discount(), {
          pricesIncludeVat: this.incl(),
          roundToKrona: this.card()?.roundToKrona ?? this.pricing.value().roundToKrona,
          groups: this.groups(),
        }),
  );

  /** Artikelkortet med sökfältet visas när man valt Lägg till artikel. */
  protected readonly pickingArticle = signal(false);

  protected startArticle() {
    this.pickingArticle.set(true);
    setTimeout(() => document.querySelector<HTMLInputElement>('input[type=search]')?.focus(), 50);
  }

  /** Raderna visas som kort när kortet är öppet och inte har order, jobb eller grupper. */
  protected readonly cardsMode = computed(
    () =>
      !this.readOnly() && this.display().every((g) => !g.head && !g.section && !g.foot && !g.other),
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
    // Bilens böcker hämtas när en bil hamnar på kortet (från listan, från bilkortet eller ett sparat kort).
    effect(() => {
      const id = this.carRow()?.carId;
      untracked(() => {
        if (!id) this.dealCar.set(null);
        else if (this.dealCar()?.id !== id)
          this.carApi.get(id).subscribe((c) => this.dealCar.set(c));
      });
    });
    // Köparkortet följer kunden som väljs; skriver man ett nytt namn töms det.
    effect(() => {
      const c = this.customer();
      untracked(() => this.fillBuyer(c));
    });
    this.autosave$
      .pipe(debounceTime(1500), takeUntilDestroyed())
      .subscribe(() => void this.autoSave());
    this.buyer.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.touch());
    this.linkCtl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.link.set(v);
      this.loadCustomer(v?.customerId);
      this.loadVehicle(v?.vehicleId, v?.vehicle);
      this.touch();
    });
  }

  ngOnInit() {
    this.workshop.serviceTypes().subscribe((l) => this.serviceTypes.set(l));
    this.loadSeller();
    this.zettleApi.status().subscribe({
      next: (z) => this.tillOn.set(z.connected),
      error: () => undefined,
    });
    forkJoin({ account: this.payments.account(), readers: this.payments.readers() }).subscribe({
      next: ({ account, readers }) => this.readerOn.set(account.ready && readers.length > 0),
      error: () => undefined,
    });
    // "Ny faktura" (och sidan efter första sparningen) bär valet i adressen.
    const kind = this.route.snapshot.queryParamMap.get('kind');
    if (kind === 'invoice' || kind === 'receipt') this.docKind.set(kind);
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
    // "Sälj" på en artikel öppnar ett nytt kort med artikeln på första raden.
    const prefill: Observable<unknown>[] = [];
    const articleId = q.get('articleId');
    if (articleId) {
      prefill.push(this.inventory.article(articleId).pipe(tap((a) => this.addArticle(a))));
    }
    // "Starta affär" på en bil öppnar ett nytt kort med bilen på första raden.
    const carId = q.get('carId');
    if (carId) {
      prefill.push(this.carApi.get(carId).pipe(tap((c) => this.addCar(c))));
    }
    const depositId = q.get('depositId');
    if (depositId) {
      prefill.push(
        this.storage.deposit(depositId).pipe(
          tap((d) => {
            if (!customerId && d.customerId) {
              this.linkCtl.setValue({ customerId: d.customerId, vehicleId: d.vehicleId ?? '' });
            }
            this.addDeposit(d);
          }),
        ),
      );
    }
    if (this.hall()) this.loadCars();
    // Ett nytt kort startar med en tom rad att skriva i, som en ny arbetsorder startar med ett jobb.
    const prefilled = ['articleId', 'carId', 'depositId', 'workOrderId'].some((k) => q.get(k));
    if (!this.hall() && !prefilled) {
      this.rows.set([
        {
          key: key(),
          type: 'service',
          description: '',
          quantity: 1,
          price: 0,
          discountPercent: 0,
          vatRate: STANDARD_VAT,
        },
      ]);
    }
    this.dirty.set(false);
    // Kortet blir ett utkast direkt (med nummer), så alla fält finns och inget behöver sparas för hand.
    forkJoin(prefill.length ? prefill : [of(null)]).subscribe({
      next: () => {
        if (this.hall() && !this.carRow()) return;
        void this.save({ silent: true });
      },
      error: () => undefined,
    });
  }

  hasUnsaved() {
    return this.dirty();
  }

  private fillBuyer(c: Customer | null) {
    this.buyer.reset(
      {
        type: c?.type ?? 'private',
        orgNo: c?.orgNo ?? '',
        phone: c?.phone ?? '',
        contactPerson: c?.contactPerson ?? '',
        address: c?.address ?? '',
        postalCode: c?.postalCode ?? '',
        city: c?.city ?? '',
      },
      { emitEvent: false },
    );
  }

  /** Det som ändrats på köparkortet, redo att skickas till kunden; tomt när inget ändrats. */
  private buyerPatch(): CustomerInput {
    const v = this.buyer.getRawValue();
    const c = this.buyer.controls;
    const text = (x: string) => x.trim() || null;
    const patch: CustomerInput = {};
    if (c.type.dirty) patch.type = v.type;
    if (c.orgNo.dirty) patch.orgNo = text(v.orgNo);
    if (c.phone.dirty) patch.phone = text(v.phone);
    // Kontaktperson finns bara på ett företag: byter man till privatperson töms den.
    if (c.contactPerson.dirty || c.type.dirty) {
      patch.contactPerson = v.type === 'company' ? text(v.contactPerson) : null;
    }
    if (c.address.dirty) patch.address = text(v.address);
    if (c.postalCode.dirty) patch.postalCode = text(v.postalCode);
    if (c.city.dirty) patch.city = text(v.city);
    return patch;
  }

  /** Kundtypen styr ett nytt korts prisläge (Prissättning); kundens rabatt förifyller rader. */
  private loadCustomer(customerId: string | undefined) {
    if (!customerId) {
      this.customer.set(null);
      if (!this.inclFixed) this.setIncl(this.pricing.includeVatFor(false));
      return;
    }
    this.workshop.customer(customerId).subscribe((c) => {
      this.customer.set(c);
      if (!this.inclFixed) this.setIncl(this.pricing.includeVatFor(c.type === 'company'));
    });
  }

  /** Bilen med registrets uppgifter; en vald bil ur listan har dem redan, annars hämtas den. */
  private loadVehicle(vehicleId: string | undefined, picked?: Vehicle) {
    if (!vehicleId) {
      this.vehicle.set(null);
      return;
    }
    if (this.vehicle()?.id === vehicleId) return;
    if (picked?.tech !== undefined) {
      this.vehicle.set(picked);
      return;
    }
    this.workshop.vehicle(vehicleId).subscribe((v) => this.vehicle.set(v));
  }

  private readonly krText = new KrPipe();

  /** Det som prissätter en åtgärd: bilen på kortet, annars det fordon man valt för hand. */
  private priceCtx() {
    const car = this.vehicle();
    return car
      ? priceContextOf(car)
      : { vehicleClass: this.manualClass(), rimDiameter: null, on: today() };
  }

  /** Priset som visas vid en åtgärd: för bilen eller fordonet som valts, annars det lägsta ("från"). */
  priceHint(s: ServiceType): string | null {
    const p = this.vehicle() || this.manualClass() ? priceOfService(s, this.priceCtx()) : null;
    if (p) {
      const text = this.krText.transform(p.total);
      return p.unit === 'wheel' ? `${text} (${p.quantity} hjul)` : text;
    }
    if (s.prices?.length && s.from) return `från ${this.krText.transform(s.from.total)}`;
    return s.priceFrom ? this.krText.transform(s.priceFrom) : null;
  }

  /** Byter prisläge och räknar om radernas priser så att kunden betalar detsamma. */
  private setIncl(toIncl: boolean) {
    if (toIncl === this.incl()) return;
    const conv = (k: number, rate: number) => {
      const o = ore(k);
      return (toIncl ? o + vatOn(o, rate) : netOf(o, rate)) / 100;
    };
    this.rows.update((rs) => rs.map((r) => ({ ...r, price: conv(r.price, r.vatRate) })));
    this.sections.update((xs) =>
      xs.map((x) =>
        x.fixedPrice == null
          ? x
          : { ...x, fixedPrice: Math.round(conv(x.fixedPrice / 100, STANDARD_VAT) * 100) },
      ),
    );
    if (this.discType() === 'amount' && this.discValue()) {
      this.discValue.set(conv(this.discValue(), STANDARD_VAT));
    }
    this.incl.set(toIncl);
  }

  switchVat(toIncl: boolean) {
    this.inclFixed = true;
    this.setIncl(toIncl);
    this.touch();
  }

  /** Fast pris på ett jobb (kr i kortets prisläge); tomt = radernas egna priser. */
  setFixed(id: string, value: string) {
    const o = value === '' ? null : Math.round(Number(value) * 100);
    this.sections.update((xs) =>
      xs.map((x) => (x.id === id ? { ...x, fixedPrice: Number.isNaN(o) ? null : o } : x)),
    );
    this.touch();
  }

  /** Räknas upp vid varje ändring, så att en sparning vet om något ändrats medan den pågick. */
  private rev = 0;
  private readonly autosave$ = new Subject<void>();
  private readonly savedAt = signal<Date | null>(null);
  readonly saveState = computed(() => {
    if (this.busy() || this.dirty()) return 'Sparar…';
    const at = this.savedAt();
    return at ? `Sparat ${format(at, 'HH:mm')}` : 'Utkast';
  });

  touch() {
    this.rev++;
    this.dirty.set(true);
    if (this.card()?.status === 'draft') this.autosave$.next();
  }

  /** Ett utkast sparar sig självt; ett fel som kräver ett svar (t.ex. ogiltigt antal) lämnas till Spara-felen. */
  private async autoSave() {
    const c = this.card();
    if (!c || c.status !== 'draft' || !this.dirty()) return;
    if (this.busy() || this.readerWaiting()) {
      this.autosave$.next();
      return;
    }
    await this.save({ silent: true });
  }

  protected load(id: string) {
    this.api.get(id).subscribe((c) => {
      this.apply(c);
      this.ensureEmptyRow();
    });
  }

  /** Ett utkast av verkstaden har alltid en tom rad att skriva i, som en ny arbetsorder har ett jobb. */
  private ensureEmptyRow() {
    if (this.card()?.status !== 'draft' || this.hall() || this.rows().length) return;
    this.rows.set([
      {
        key: key(),
        type: 'service',
        description: '',
        quantity: 1,
        price: 0,
        discountPercent: 0,
        vatRate: STANDARD_VAT,
      },
    ]);
  }

  ngOnDestroy() {
    // Ett utkast som öppnades men aldrig fick något innehåll lämnas inte kvar som ett tomt kort.
    const c = this.card();
    if (!c || c.status !== 'draft' || this.id === 'new' || c.reservedDocumentCode) return;
    const empty =
      !this.rows().some((r) => r.type !== 'service' || r.description.trim() || r.price) &&
      !this.link() &&
      !(c.orders?.length ?? 0) &&
      !this.note().trim() &&
      !this.performed().trim() &&
      !this.warranty().trim() &&
      !c.discount;
    if (empty) this.api.remove(c.id).subscribe({ error: () => undefined });
  }

  private apply(c: SalesCardDetail) {
    this.card.set(c);
    this.inclFixed = true;
    this.incl.set(c.pricesIncludeVat ?? true);
    this.sections.set(c.sections ?? []);
    this.rows.set(
      c.lines.map((l) => ({
        key: key(),
        id: l.id,
        type: l.type,
        code: l.code ?? null,
        sectionId: l.sectionId ?? null,
        description: l.description,
        articleId: l.articleId ?? undefined,
        depositId: l.depositId ?? undefined,
        carId: l.carId ?? undefined,
        vmbPurchase: l.vmbPurchase ?? null,
        quantity: l.quantity,
        price: l.unitPrice / 100,
        discountPercent: l.discountPercent,
        vatRate: l.vatRate,
        workOrderId: l.workOrderId ?? null,
      })),
    );
    this.linkCtl.setValue(
      c.customerId || c.vehicleId
        ? { customerId: c.customerId ?? '', vehicleId: c.vehicleId ?? '' }
        : null,
      { emitEvent: false },
    );
    this.link.set(this.linkCtl.value);
    if (c.customerId && this.customer()?.id !== c.customerId) this.loadCustomer(c.customerId);
    this.loadVehicle(c.vehicleId ?? undefined);
    this.discType.set(c.discount?.type ?? 'percent');
    this.discValue.set(
      c.discount ? (c.discount.type === 'amount' ? c.discount.value / 100 : c.discount.value) : 0,
    );
    this.discReason.set(c.discount?.reason ?? '');
    this.discText.set(
      c.discount
        ? c.discount.type === 'percent'
          ? `${c.discount.value}%`
          : String(this.discValue())
        : '',
    );
    this.note.set(c.note ?? '');
    this.performed.set(c.performed ?? '');
    this.warranty.set(c.document?.warranty ?? '');
    if (this.hasText()) this.showText.set(true);
    this.payMethod.set(c.document?.paymentMethod ?? (c.kind === 'invoice' ? 'invoice' : 'card'));
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

  /** Kund- och bilfältet högst upp, så att ett regnummer från Däck till bilen kan skrivas dit. */
  @ViewChild(CustomerVehiclePicker) private picker?: CustomerVehiclePicker;

  /**
   * Däck till bilen: bilens storlekar ur registret, passande däck i lager och hos grossisten.
   * Har kortet ingen bil skriver man regnumret i dialogen, och det hamnar då också i kortets
   * regnummerfält.
   */
  openTyres() {
    this.dialog.open(TyreFinderDialog, {
      width: '920px',
      maxWidth: '96vw',
      data: {
        vehicle: this.vehicle(),
        add: (a: Article, quantity: number) => this.addArticle(a, quantity),
        setVehicle: (regNo: string, existing: Vehicle | null) =>
          this.setVehicleFromRegNo(regNo, existing),
      },
    });
  }

  /** En bil som finns i registret väljs på kortet (med sin kund); annars skrivs numret i fältet. */
  private setVehicleFromRegNo(regNo: string, existing: Vehicle | null) {
    if (this.vehicle()?.regNo === regNo) return;
    this.picker?.fillRegNo(regNo, existing);
  }

  /** Ikonen på en artikelrad: däck om beskrivningen börjar med en dimension, annars övrigt. */
  protected itemKind(r: Row): ItemKind {
    return /\d{3}\s*\/\s*\d{2}/.test(r.description) ? 'tyre' : 'other';
  }

  /** Raden under namnet: artikelnummer och lagersaldo, eller varningen när det inte räcker. */
  protected rowSub(r: Row): string {
    if (r.maxQty !== undefined && r.quantity > r.maxQty) return `Bara ${r.maxQty} st i lager`;
    return [r.code, r.maxQty !== undefined ? `${r.maxQty} st i lager` : '']
      .filter(Boolean)
      .join(' · ');
  }

  addArticle(a: Article, quantity = 1) {
    const i = this.rows().findIndex((r) => r.articleId === a.id);
    if (i >= 0) {
      this.edit(i, { quantity: this.rows()[i].quantity + quantity });
    } else {
      this.push({
        type: 'article',
        description: [a.sizeLabel, a.brand, a.model].filter(Boolean).join(' '),
        articleId: a.id,
        quantity,
        code: a.sku,
        price: inMode(a.sellPrice, this.incl()) / 100,
        discountPercent: this.customer()?.partsDiscount ?? 0,
        vatRate: STANDARD_VAT,
        maxQty: a.quantity,
      });
    }
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
    this.pickingArticle.set(false);
  }

  addFirst() {
    const [first] = this.results();
    if (first) this.addArticle(first);
  }

  addService(s: ServiceType) {
    // Priset följer bilens klass och fälgstorlek; per hjul blir antalet hjul radens antal.
    const p = priceOfService(s, this.priceCtx());
    this.push({
      type: 'service',
      code: s.opCode ?? null,
      description: s.name,
      quantity: p?.quantity ?? 1,
      price: inMode(p?.unitPrice ?? s.priceFrom ?? 0, this.incl()) / 100,
      discountPercent: this.customer()?.labourDiscount ?? 0,
      vatRate: STANDARD_VAT,
    });
  }

  /**
   * Arbetsrad: en åtgärd med ett pris. Kunden ser aldrig timmar eller timpris, så raden har
   * antal 1 och det pris arbetet kostar.
   */
  addLabour() {
    this.push({
      type: 'labour',
      description: 'Arbete',
      quantity: 1,
      price: 0,
      discountPercent: this.customer()?.labourDiscount ?? 0,
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

  /** Bilar som går att sälja: inte redan sålda, och inte på ett annat kort. */
  loadCars() {
    this.carApi.list().subscribe((list) => {
      const taken = new Set(this.rows().map((r) => r.carId));
      this.carsForSale.set(
        list.filter((c) => !c.soldCardId && c.status !== 'sold' && !taken.has(c.id)),
      );
    });
  }

  /** En bil är en rad med bilens pris. Såld med VMB (momsen på vinsten) räknas momsen ur inköpspriset. */
  addCar(c: CarListing) {
    if (this.rows().some((r) => r.carId === c.id)) return;
    this.dealCar.set(c);
    this.push({
      type: 'car',
      description: `${c.heading} (${c.regNo})`,
      carId: c.id,
      vmbPurchase: c.vatScheme === 'margin' ? (c.purchase?.price ?? null) : null,
      quantity: 1,
      price: (c.price ?? 0) / 100,
      discountPercent: 0,
      vatRate: c.vatScheme === 'margin' ? 0 : STANDARD_VAT,
    });
  }

  /** Väljer en annan bil: tar bort den på kortet och visar listan över bilar att sälja igen. */
  removeCar() {
    const i = this.carIndex();
    if (i < 0) return;
    this.removeRow(i);
    this.dealCar.set(null);
    this.loadCars();
  }

  /** Något som följer med bilaffären (garanti, ägarbyte, leverans): en rad med text och pris. */
  addExtra(description: string) {
    this.push({
      type: 'service',
      description,
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
      price: inMode(d.fee, this.incl()) / 100,
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
    this.storage
      .deposits({ status: 'stored', paymentStatus: 'unpaid', limit: 100 })
      .subscribe((p) => {
        const taken = new Set(this.rows().map((r) => r.depositId));
        const list = p.items.filter((d) => d.customerId === customerId && !taken.has(d.id));
        this.deposits.set(list);
        this.depositsHint.set('Kunden har inga obetalda däckhotell att lägga till.');
      });
  }

  /** Kundens klara arbetsorder som väntar på faktura (inte de som redan ligger på kortet). */
  loadOrders() {
    const customerId = this.link()?.customerId || this.card()?.customerId;
    if (!customerId) {
      this.unbilled.set([]);
      this.ordersHint.set('Välj en kund först för att se kundens klara arbetsorder.');
      return;
    }
    const mine = new Set(this.orders().map((o) => o.id));
    const own = this.card()?.links.workOrder?.id;
    this.api.toInvoice(customerId).subscribe((x) => {
      this.unbilled.set(
        (x.customers[0]?.orders ?? []).filter((o) => !mine.has(o.id) && o.id !== own),
      );
      this.ordersHint.set('Kunden har inga fler klara arbetsorder att fakturera.');
    });
  }

  /**
   * Lägger en klar arbetsorder på kortet med dess jobb och rader; med två eller fler blir kortet en
   * samlingsfaktura. Osparade ändringar sparas först, eftersom servern bygger om kortet.
   */
  async addOrder(o: UnbilledOrder) {
    if (!this.card()) {
      // Ett nytt kort skapas med ordern direkt: att spara först byter sida innan ordern hunnit läggas till.
      if (this.rows().length) {
        this.snack.open('Spara kortet först, lägg sedan till arbetsordern.', 'OK', {
          duration: 4000,
        });
        return;
      }
      this.busy.set(true);
      try {
        const made = await firstValueFrom(this.api.create({ workOrderId: o.id }));
        // Kortet är sparat med ordern: att välja kund var det enda som ändrats, så ingen varning.
        this.dirty.set(false);
        await this.router.navigate(['/sales', made.id], { replaceUrl: true });
      } finally {
        this.busy.set(false);
      }
      return;
    }
    if (this.dirty() && !(await this.save())) return;
    const c = this.card()!;
    this.busy.set(true);
    try {
      this.apply(await firstValueFrom(this.api.addWorkOrders(c.id, [o.id])));
      this.snack.open(
        o.card ? `${o.code} flyttades hit från ${o.card.code}` : `${o.code} lades till`,
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Tar bort en arbetsorder med dess rader från kortet; den väntar då på faktura igen. */
  removeOrder(o: SalesCardOrder) {
    const c = this.card();
    if (!c) return;
    this.confirm
      .ask({
        title: `Ta bort ${o.code} från kortet?`,
        message:
          'Orderns jobb och rader tas bort från säljkortet. Ordern finns kvar och väntar på faktura igen.',
        confirmText: 'Ta bort från kortet',
      })
      .subscribe(async (ok) => {
        if (!ok) return;
        if (this.dirty() && !(await this.save())) return;
        this.busy.set(true);
        try {
          this.apply(await firstValueFrom(this.api.removeWorkOrder(c.id, o.id)));
        } finally {
          this.busy.set(false);
        }
      });
  }

  // --- spara och bokför ---

  private async body(): Promise<SalesCardInput> {
    const link = this.link();
    const resolved = link ? await firstValueFrom(this.links.resolve(link)) : null;
    if (this.hall() && resolved?.customerId) {
      const patch = this.buyerPatch();
      if (Object.keys(patch).length) {
        const saved = await firstValueFrom(
          this.workshop.updateCustomer(resolved.customerId, patch),
        );
        this.customer.set({ ...this.customer(), ...saved } as Customer);
        this.fillBuyer(this.customer());
      }
    }
    return {
      customerId: resolved?.customerId || null,
      vehicleId: resolved?.vehicleId || null,
      pricesIncludeVat: this.incl(),
      sections: this.sections(),
      // En tom fri rad (den som ett nytt kort startar med) sparas inte.
      lines: this.rows()
        .filter((r) => r.type !== 'service' || r.description.trim() || r.price)
        .map((r) => ({
          id: r.id,
          type: r.type,
          code: r.code || null,
          sectionId: r.sectionId ?? null,
          description: r.description || undefined,
          articleId: r.articleId,
          depositId: r.depositId,
          carId: r.carId,
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

  async save(opts: { silent?: boolean } = {}): Promise<boolean> {
    const silent = !!opts.silent;
    const tell = (text: string) => {
      if (!silent) this.snack.open(text, 'OK', { duration: 4000 });
    };
    if (this.hall() && !this.carRow()) {
      tell('Välj bilen som ska säljas.');
      return false;
    }
    if (this.hall() && this.buyer.dirty && !this.link()) {
      tell('Skriv köparens namn först: uppgifterna hör till köparen.');
      return false;
    }
    if (this.rows().some((r) => !(r.quantity > 0) || !(r.price >= 0))) {
      tell('Kontrollera antal och pris på raderna');
      return false;
    }
    this.busy.set(true);
    try {
      const body = await this.body();
      const c = this.card();
      const rev = this.rev;
      const saved = c
        ? await firstValueFrom(this.api.update(c.id, body))
        : await firstValueFrom(this.api.create(body));
      if (silent && c) {
        this.mergeSaved(saved, rev);
      } else {
        this.apply(saved);
        if (!c) this.ensureEmptyRow();
      }
      this.savedAt.set(new Date());
      if (!silent) this.snack.open(`${saved.code} sparades`, undefined, { duration: 2500 });
      if (!c) {
        await this.router.navigate(['/sales', saved.id], {
          replaceUrl: true,
          queryParams: this.docKind() ? { kind: this.docKind() } : {},
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * En tyst sparning bygger inte om formuläret (då tappar man markören): kortet uppdateras och raderna
   * får sina id, och "osparat" släcks bara om inget ändrats medan sparningen pågick.
   */
  private mergeSaved(saved: SalesCardDetail, rev: number) {
    this.card.set(saved);
    if (this.rev !== rev) return;
    let j = 0;
    this.rows.update((rs) =>
      rs.map((r) => {
        if (r.type === 'service' && !r.description.trim() && !r.price) return r;
        return { ...r, id: saved.lines[j++]?.id ?? r.id };
      }),
    );
    this.dirty.set(false);
  }

  /** Valet som skickas med när kortet bokförs eller förhandsgranskas. */
  private choice(): DocumentChoice {
    switch (this.docOption()) {
      case 'cash_invoice':
        return { kind: 'invoice', paidOnIssue: true, paymentMethod: this.receiptMethod() };
      case 'invoice':
        return { kind: 'invoice', paymentTermsDays: this.terms() };
      default:
        return { kind: 'receipt', paymentMethod: this.receiptMethod() };
    }
  }

  /** Samma val som adressparametrar, för förhandsgranskningen. */
  choiceParams() {
    return { ...this.choice() };
  }

  post() {
    const c = this.card();
    if (!c) return;
    const option = this.docOption();
    const gets =
      option === 'cash_invoice'
        ? `en kontantfaktura, betald ${paidWith('receipt', this.receiptMethod())} i dag, i fakturaserien (FAK-)`
        : option === 'invoice'
          ? `en faktura som förfaller ${this.dueDate()} (${this.terms()} dagar), i fakturaserien (FAK-)`
          : `ett kvitto, betalt ${paidWith('receipt', this.receiptMethod())}, i kvittoserien (KV-)`;
    const noun =
      option === 'cash_invoice' ? 'kontantfaktura' : option === 'invoice' ? 'faktura' : 'kvitto';
    this.confirm
      .ask({
        title: `Bokför ${c.code} som ${noun}?`,
        message: this.hall()
          ? `Köparen får ${gets}. Bilen sätts som såld och låses, och dokumentet får sitt nummer. Därefter går varken affären eller dokumentet att ändra.`
          : `Kunden får ${gets}. Lagret minskas för artiklarna på raderna och dokumentet får sitt nummer. Därefter går varken kortet eller dokumentet att ändra.`,
        confirmText: 'Bokför',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.post(c.id, this.choice()).subscribe({
          next: (posted) => {
            this.apply(posted);
            this.busy.set(false);
            this.snack.open(`${posted.documentCode} är bokfört`, 'OK', { duration: 4000 });
          },
          error: () => this.busy.set(false),
        });
      });
  }

  /** "5 dagar sen" när en obetald faktura har passerat förfallodatumet. */
  late(inv: { kind: InvoiceKind; dueAt: string | null; paidAt: string | null }) {
    const n = dueNote(inv);
    return n.endsWith('sen') ? n : '';
  }

  lastSent(c: SalesCardDetail) {
    const s = c.sends?.[c.sends.length - 1];
    return s ? `till ${s.to} den ${s.at.slice(0, 10)}` : '';
  }

  /**
   * Mejlar kvittot eller fakturan som en länk till samma dokument som "Visa / skriv ut". Saknar
   * kunden e-post frågar dialogen efter adressen och sparar den på kunden.
   */
  sendDocument() {
    const c = this.card();
    if (!c?.document) return;
    this.dialog
      .open(SalesSendDialog, {
        width: '520px',
        data: {
          id: c.id,
          code: c.documentCode ?? c.code,
          kind: c.document.kind,
          customerName: c.document.buyer.name,
          email: this.customer()?.email ?? null,
          resend: !!c.sends?.length,
          lastTo: c.sends?.[c.sends.length - 1]?.to ?? null,
        },
      })
      .afterClosed()
      .subscribe((r?: SalesCardDetail) => {
        if (!r) return;
        this.apply(r);
        // Servern sparade adressen på kunden om den saknade en.
        const to = r.sends?.[r.sends.length - 1]?.to;
        this.customer.update((cu) => (cu && !cu.email && to ? { ...cu, email: to } : cu));
        this.snack.open('Skickat till kunden', 'OK', { duration: 4000 });
      });
  }

  hasCar(c: SalesCardDetail) {
    return c.lines.some((l) => l.type === 'car');
  }

  /** Skälet till att kortet inte kan återöppnas just nu, annars tomt. */
  reopenBlocked(c: SalesCardDetail) {
    if (c.sends?.length) {
      return 'Dokumentet har skickats till kunden och kan inte återöppnas.';
    }
    if (c.document?.paymentReference) {
      return 'Betalt med kort via Stripe. Kreditera i stället, så kan pengarna gå tillbaka till kortet.';
    }
    return c.document?.paidAt && c.document.kind === 'invoice' && !c.document.paidOnIssue
      ? 'Fakturan är betald. Markera den obetald först.'
      : '';
  }

  /**
   * Återöppnar ett bokfört kort så att ett fel kan rättas. Ett kvitto och en kontantfaktura var
   * betalda på stället och går tillbaka med affären; en betald faktura får ägaren först markera
   * obetald, med flit.
   */
  reopen() {
    const c = this.card();
    if (!c?.document) return;
    const receipt = c.document.kind === 'receipt';
    const paidOnTheSpot = receipt || !!c.document.paidOnIssue;
    this.confirm
      .ask({
        title: `Återöppna ${c.documentCode}?`,
        message:
          `Kortet blir ett utkast igen${paidOnTheSpot ? ' och betalningen på dokumentet tas bort' : ''}. ` +
          `Delar som lämnade lagret läggs tillbaka, och numret ${c.documentCode} sparas så att det ` +
          `används igen när du bokför som ${receipt ? 'kvitto' : 'faktura'}. Har dokumentet redan ` +
          'gått till kunden ska det i stället krediteras.',
        confirmText: 'Återöppna',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.reopen(c.id).subscribe({
          next: (r) => {
            this.busy.set(false);
            this.apply(r);
            this.snack.open('Kortet är återöppnat', 'OK', { duration: 4000 });
          },
          error: () => {
            this.busy.set(false);
            this.load(c.id);
          },
        });
      });
  }

  /**
   * Krediterar hela fakturan eller kvittot: originalet står kvar, en kreditfaktura upphäver det.
   * Betalade kunden med kort genom Stripe kan pengarna gå tillbaka till kortet i samma steg.
   */
  credit() {
    const c = this.card();
    if (!c?.document) return;
    const doc = c.document;
    this.payments
      .forCard(c.id)
      .pipe(catchError(() => of([])))
      .subscribe((rows) => {
        const refundable = rows
          .filter((p) => p.status === 'succeeded' && !p.refundedAt)
          .reduce((sum, p) => sum + p.amount, 0);
        this.dialog
          .open(CreditDialog, {
            data: {
              code: c.documentCode,
              total: c.totals.total,
              paid: !!doc.paidAt,
              hasParts: c.lines.some((l) => l.stockBooked),
              refundable,
            },
            width: '440px',
          })
          .afterClosed()
          .subscribe((res?: CreditResult) => {
            if (res) this.sendCredit(c.id, res);
          });
      });
  }

  private sendCredit(id: string, res: CreditResult) {
    this.busy.set(true);
    this.api.credit(id, res.reason, res.restock, res.refund).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.apply(r);
        const failed = (r.refunds ?? []).filter((x) => x.status === 'failed');
        this.snack.open(
          failed.length
            ? `Krediterad med ${r.credit?.code}, men återbetalningen gick inte: ${failed[0].error}. Betala tillbaka i Stripe.`
            : r.refunds?.length
              ? `Krediterad med ${r.credit?.code}. Pengarna går tillbaka till kortet.`
              : `Krediterad med ${r.credit?.code}`,
          'OK',
          { duration: failed.length ? 10000 : 4000 },
        );
      },
      error: () => {
        this.busy.set(false);
        this.load(id);
      },
    });
  }

  /** Tar ett registrerat kvitto tillbaka: ett returkvitto i kassaregistret, lagret tillbaka, kortbetalningen återbetald. */
  giveBack() {
    const c = this.card();
    if (!c?.document) return;
    this.dialog
      .open(ReturnDialog, {
        data: { code: c.documentCode, total: c.totals.total },
        width: '440px',
      })
      .afterClosed()
      .subscribe((reason?: string) => {
        if (!reason) return;
        this.busy.set(true);
        this.api.returnReceipt(c.id, reason).subscribe({
          next: (r) => {
            this.busy.set(false);
            this.apply(r);
            const failed = r.refunds?.some((x) => x.status === 'failed');
            this.snack.open(
              failed
                ? 'Returen är registrerad, men återbetalningen till kunden misslyckades: återbetala den för hand.'
                : 'Returen är registrerad',
              'OK',
              { duration: failed ? 12000 : 4000 },
            );
          },
          error: () => {
            this.busy.set(false);
            this.load(c.id);
          },
        });
      });
  }

  setPaid(paid: boolean) {
    const c = this.card();
    if (!c) return;
    const run = () =>
      this.api
        .setPaid(
          c.id,
          paid,
          paid ? this.payMethod() : undefined,
          paid ? noonOf(this.paidOn.value) : undefined,
        )
        .subscribe((r) => this.apply(r));
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
        message: c.reservedDocumentCode
          ? `Utkastet raderas. ${c.reservedDocumentCode} har redan använts och används inte igen.`
          : 'Utkastet raderas. Inget har bokförts.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.remove(c.id).subscribe(() => {
          this.dirty.set(false);
          void this.router.navigate([this.hall() ? '/dealership/deals' : '/sales']);
        });
      });
  }
}
