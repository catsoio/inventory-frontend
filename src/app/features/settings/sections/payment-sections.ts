import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PaymentApi } from '../../../core/api/payment-api';
import { RegisterApi } from '../../../core/api/register-api';
import { Auth } from '../../../core/auth/auth';
import { Pricing } from '../../../core/pricing';
import { PaymentAccount, PaymentReader, RegisterChain, RegisterStatus } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

/**
 * Försäljning vid disken: allt faktureras (kontantfaktura) eller kvitto. Fakturerad försäljning
 * omfattas inte av kravet på kassaregister, men bara när varje försäljning faktureras. Sparas direkt.
 */
@Component({
  selector: 'app-settings-counter',
  standalone: false,
  template: `
    <app-setting-group
      title="Försäljning vid disken"
      text="Hur en försäljning som betalas på plats bokförs."
    >
      <app-setting-row
        label="Allt faktureras (kontantfaktura)"
        hint="Varje försäljning blir en faktura på en kund med namn och adress, också den som betalas vid disken med kort, Swish eller kontant: en kontantfaktura som är betald direkt. Inga kvitton (KV-) utfärdas. Fakturerad försäljning behöver inget kassaregister, men bara om ni aldrig säljer något utan faktura. Fråga er revisor om ni är osäkra."
      >
        <mat-slide-toggle
          [checked]="pricing.value().alwaysInvoice"
          [disabled]="busy() || !isOwner"
          (change)="setAlwaysInvoice($event.checked)"
          aria-label="Allt faktureras"
        />
      </app-setting-row>
    </app-setting-group>
  `,
})
export class SettingsCounterSales {
  readonly pricing = inject(Pricing);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(Auth);
  readonly isOwner = this.auth.isAdmin() || this.auth.isSuperAdmin();
  readonly busy = signal(false);

  setAlwaysInvoice(on: boolean) {
    this.busy.set(true);
    this.pricing.save({ alwaysInvoice: on }).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(
          on ? 'Allt faktureras nu: inga kvitton utfärdas' : 'Kvitton går att utfärda igen',
          'OK',
          { duration: 4000 },
        );
      },
      error: () => this.busy.set(false),
    });
  }
}

/**
 * Betalningar via Stripe: verkstadens eget Stripe-konto (pengarna går direkt dit), Swish och
 * kortläsare. Kunden betalar fakturan med kort eller Swish från länken, och kort kan tas på en
 * kortläsare vid disken. Allt som skapas här tas i bruk direkt, så sidan har ingen Spara-stapel.
 */
@Component({
  selector: 'app-settings-payments',
  standalone: false,
  template: `
    @if (account(); as a) {
      <app-setting-group
        title="Kortbetalning via Stripe"
        text="Kunden kan betala fakturan med kort från länken, och kort kan tas på en läsare vid disken. Pengarna går direkt till ert eget Stripe-konto och fakturan markeras betald av sig själv."
      >
        <app-setting-row
          label="Stripe-konto"
          [hint]="
            a.connected && !a.ready
              ? 'Stripe behöver några uppgifter om företaget innan kontot kan ta emot betalningar.'
              : a.feePercent > 0
                ? 'Avgift till Axle: ' + a.feePercent + ' % av varje betalning.'
                : ''
          "
        >
          @if (a.ready) {
            <app-pill tone="green">Klart att ta betalt</app-pill>
          } @else if (a.connected) {
            <app-pill tone="amber">Inte klart</app-pill>
          } @else {
            <app-pill tone="gray">Inte kopplat</app-pill>
          }
          @if (a.connected) {
            <button mat-button type="button" (click)="reload()">Uppdatera</button>
          }
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="connect()">
            {{ a.connected ? 'Fortsätt hos Stripe' : 'Koppla till Stripe' }}
          </button>
        </app-setting-row>
        @if (a.ready) {
          <app-setting-row
            label="Swish på betalsidan"
            hint="Stripe måste ha aktiverat Swish för kontot först. Slå på det här när det är gjort, så att kunden aldrig får en betalmetod som inte fungerar. Gäller privatkunder."
          >
            <mat-slide-toggle
              [checked]="a.swish"
              (change)="swish($event.checked)"
              aria-label="Swish på betalsidan"
            />
          </app-setting-row>
        }
      </app-setting-group>

      @if (a.ready) {
        <app-setting-group title="Kortläsare" text="Stripe Reader S700/S710 eller BBPOS WisePOS E.">
          @for (r of readers(); track r.id) {
            <app-setting-row [label]="r.label" [hint]="r.busy ? 'Upptagen' : ''">
              <app-pill [tone]="r.status === 'online' ? 'green' : 'gray'">{{
                r.status === 'online' ? 'Online' : 'Offline'
              }}</app-pill>
            </app-setting-row>
          } @empty {
            <p class="py-3.5 text-sm text-gray-500">Ingen läsare är registrerad än.</p>
          }
        </app-setting-group>
        <app-setting-group
          title="Lägg till läsare"
          text="Koden visas på läsaren när du startar registreringen i dess inställningar. Läsaren behöver vara på nätet."
          [form]="true"
        >
          <div class="flex flex-wrap items-start gap-3">
            <mat-form-field subscriptSizing="dynamic" class="w-56">
              <mat-label>Kod från läsaren</mat-label>
              <input matInput [formControl]="code" autocomplete="off" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="w-44">
              <mat-label>Namn</mat-label>
              <input matInput [formControl]="label" placeholder="Disken" />
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              class="!mt-1"
              [disabled]="busy() || code.invalid || label.invalid"
              (click)="addReader()"
            >
              Lägg till
            </button>
          </div>
        </app-setting-group>
      }
    } @else {
      <p class="text-gray-500">Läser in…</p>
    }
  `,
})
export class SettingsPayments implements OnInit {
  private readonly api = inject(PaymentApi);
  private readonly snack = inject(MatSnackBar);

  readonly account = signal<PaymentAccount | null>(null);
  readonly readers = signal<PaymentReader[]>([]);
  readonly busy = signal(false);
  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });
  readonly label = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.api.account().subscribe((a) => {
      this.account.set(a);
      if (a.ready) this.api.readers().subscribe((r) => this.readers.set(r));
    });
  }

  connect() {
    this.busy.set(true);
    this.api.connect().subscribe({
      next: (r) => (window.location.href = r.url),
      error: () => this.busy.set(false),
    });
  }

  swish(enabled: boolean) {
    this.api.setSwish(enabled).subscribe((a) => this.account.set(a));
  }

  addReader() {
    this.busy.set(true);
    this.api.registerReader(this.code.value.trim(), this.label.value.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.code.reset('');
        this.label.reset('');
        this.snack.open('Läsaren är registrerad', 'OK', { duration: 4000 });
        this.reload();
      },
      error: () => this.busy.set(false),
    });
  }
}

/**
 * Kassaregistret: Skatteverket kräver ett tillverkardeklarerat kassaregister när kort-, Swish- och
 * kontantförsäljning vid disk överstiger fyra prisbasbelopp per år. När det är på går varje kvitto
 * genom registret: det får ett löpnummer och en kontrollkod och kan bara tas tillbaka med en retur.
 */
@Component({
  selector: 'app-settings-register',
  standalone: false,
  template: `
    @if (status(); as s) {
      <app-setting-group
        title="Kassaregister"
        text="Skatteverket kräver kassaregister när ni säljer för mer än fyra prisbasbelopp per år med kort, Swish eller kontant (fakturor räknas inte). Kvitton som utfärdas här registreras i en journal som inte går att ändra, och varje kvitto får en kontrollkod."
      >
        @if (!s.configured) {
          <app-setting-row
            label="Kassaregistret är inte skapat"
            hint="Företagsuppgifterna hämtas från Företagsuppgifter. Kvittonumren fortsätter efter det senaste kvittot."
          >
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="busy()"
              (click)="setup()"
            >
              Skapa kassaregister
            </button>
          </app-setting-row>
        } @else if (s.unit; as u) {
          @if (!u.control.certified) {
            <p class="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">
              <b>Utvecklingsläge.</b> Kontrollsystemet är inte certifierat, så kvitton som utfärdas
              nu är inte giltiga och får inte användas i den riktiga verksamheten.
            </p>
          }
          <app-setting-row
            label="Kassaregistret är på"
            [hint]="
              s.control && !s.control.reachable ? 'Kontrollsystemet svarar inte just nu.' : ''
            "
          >
            <mat-slide-toggle
              [checked]="u.status === 'active'"
              [disabled]="busy()"
              (change)="toggle($event.checked)"
              aria-label="Kassaregistret är på"
            />
          </app-setting-row>
          <app-setting-row
            label="Rapporter och journal"
            hint="X- och Z-rapport, journal och export."
          >
            <a mat-stroked-button routerLink="/finance/register">Öppna</a>
          </app-setting-row>
          <app-setting-row label="Kontrollera journalen" [hint]="chainText()">
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="verify()">
              Kontrollera
            </button>
          </app-setting-row>
          <app-setting-row label="Företagsuppgifter i registret">
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="refreshCompany()">
              Hämta igen
            </button>
          </app-setting-row>
        }
      </app-setting-group>

      @if (s.configured && s.unit; as u) {
        <app-setting-group title="Registrets uppgifter">
          <dl class="m-0 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5 py-3.5 text-sm">
            <dt class="text-gray-500">Kassabeteckning</dt>
            <dd class="m-0">{{ u.label }}</dd>
            <dt class="text-gray-500">Kassaregisternummer</dt>
            <dd class="m-0 font-mono">{{ s.registerNumber }}</dd>
            <dt class="text-gray-500">Modell och version</dt>
            <dd class="m-0">{{ s.model }} · {{ s.program }} {{ s.version }}</dd>
            <dt class="text-gray-500">Kontrollsystem</dt>
            <dd class="m-0">
              {{ u.control.provider }} · <span class="font-mono">{{ u.control.serial }}</span>
            </dd>
            <dt class="text-gray-500">Företag</dt>
            <dd class="m-0">{{ u.company.name }}, {{ u.company.orgNo }}</dd>
            <dt class="text-gray-500">Försäljningsställe</dt>
            <dd class="m-0">{{ u.company.address }}</dd>
            @if (s.counters; as c) {
              <dt class="text-gray-500">Senaste kvittonummer</dt>
              <dd class="m-0">{{ c.receipt }}</dd>
              <dt class="text-gray-500">Z-rapporter</dt>
              <dd class="m-0">{{ c.z }}</dd>
            }
          </dl>
        </app-setting-group>
        <p class="text-xs text-gray-500">
          Registret är inte tillverkardeklarerat hos Skatteverket än. Ett kvitto i registret kan
          inte återöppnas: det tas tillbaka med en retur. Priser måste vara inkl. moms och utan
          avrundning till hela kronor.
        </p>
      }
    } @else {
      <p class="text-gray-500">Läser in…</p>
    }
  `,
})
export class SettingsRegister implements OnInit {
  private readonly api = inject(RegisterApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);

  readonly status = signal<RegisterStatus | null>(null);
  readonly chain = signal<RegisterChain | null>(null);
  readonly busy = signal(false);

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.api.status().subscribe((s) => this.status.set(s));
  }

  setup() {
    this.confirm
      .ask({
        title: 'Skapa kassaregister?',
        message:
          'Från nu går kvitton genom kassaregistret: de får löpnummer och kontrollkod och kan inte återöppnas, bara tas tillbaka med en retur. Det går inte att ta bort registret igen.',
        confirmText: 'Skapa',
      })
      .subscribe((ok) => ok && this.run(this.api.setup(), 'Kassaregistret är skapat'));
  }

  toggle(active: boolean) {
    this.run(this.api.setActive(active), active ? 'Kassaregistret är på' : 'Kassaregistret är av');
  }

  refreshCompany() {
    this.run(this.api.refreshCompany(), 'Företagsuppgifterna är uppdaterade');
  }

  /** Resultatet av senaste kontrollen av journalen. */
  chainText(): string {
    const ch = this.chain();
    if (!ch) return 'Kontrollerar att ingen rad ändrats.';
    return ch.ok
      ? `Journalen är hel (${ch.entries} rader).`
      : `Journalen stämmer inte vid rad ${ch.brokenAtSeq}: ${ch.reason}`;
  }

  verify() {
    this.api.verify().subscribe((c) => this.chain.set(c));
  }

  private run(call: import('rxjs').Observable<unknown>, done: string) {
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(done, 'OK', { duration: 3000 });
        this.reload();
      },
      error: () => this.busy.set(false),
    });
  }
}
