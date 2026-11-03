import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PaymentApi } from '../../../core/api/payment-api';
import { RegisterApi } from '../../../core/api/register-api';
import { PaymentAccount, PaymentReader, RegisterChain, RegisterStatus } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

/**
 * Betalningar via Stripe: verkstadens eget Stripe-konto (pengarna går direkt dit), Swish och
 * kortläsare. Kunden betalar fakturan med kort eller Swish från länken, och kort kan tas på en
 * kortläsare vid disken. Allt som skapas här tas i bruk direkt, så sidan har ingen Spara-stapel.
 */
@Component({
  selector: 'app-settings-payments',
  standalone: false,
  template: `
    <h2 class="text-lg font-semibold">Betalningar via Stripe</h2>
    <p class="mt-1 mb-5 text-sm text-gray-600">
      Kunden kan betala fakturan med kort eller Swish från länken, och kort kan tas på en kortläsare vid
      disken. Pengarna går direkt till ert eget Stripe-konto; fakturan markeras betald av sig själv.
    </p>

    @if (account(); as a) {
      <section class="mb-6">
        <div class="sec">Stripe-konto</div>
        <div class="flex flex-wrap items-center gap-3">
          @if (a.ready) {
            <app-pill tone="green">Klart att ta betalt</app-pill>
          } @else if (a.connected) {
            <app-pill tone="amber">Registreringen hos Stripe är inte klar</app-pill>
          } @else {
            <app-pill tone="gray">Inte kopplat</app-pill>
          }
          <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="connect()">
            {{ a.connected ? 'Fortsätt registreringen hos Stripe' : 'Koppla till Stripe' }}
          </button>
          @if (a.connected) {
            <button mat-button type="button" (click)="reload()">Uppdatera status</button>
          }
        </div>
        @if (a.connected && !a.ready) {
          <p class="mt-2 text-sm text-gray-600">
            Stripe behöver några uppgifter om företaget innan kontot kan ta emot betalningar.
          </p>
        }
        @if (a.feePercent > 0) {
          <p class="mt-2 text-xs text-gray-500">Avgift till Axle: {{ a.feePercent }} % av varje betalning.</p>
        }
      </section>

      @if (a.ready) {
        <section class="mb-6">
          <div class="sec">Swish</div>
          <mat-slide-toggle [checked]="a.swish" (change)="swish($event.checked)">
            Erbjud Swish på betalsidan
          </mat-slide-toggle>
          <p class="mt-1 text-sm text-gray-600">
            Stripe måste ha aktiverat Swish för kontot först (det begärs hos Stripe). Slå på det här först när
            det är gjort, så att kunden aldrig får en betalmetod som inte fungerar. Swish gäller privatkunder.
          </p>
        </section>

        <section class="mb-6">
          <div class="sec">Kortläsare</div>
          @for (r of readers(); track r.id) {
            <div class="mb-2 flex items-center gap-3">
              <mat-icon class="text-gray-500">contactless</mat-icon>
              <span class="font-medium">{{ r.label }}</span>
              <app-pill [tone]="r.status === 'online' ? 'green' : 'gray'">{{ r.status === 'online' ? 'Online' : 'Offline' }}</app-pill>
              @if (r.busy) {
                <span class="text-sm text-gray-500">upptagen</span>
              }
            </div>
          } @empty {
            <p class="mb-3 text-sm text-gray-600">Ingen läsare är registrerad än.</p>
          }
          <div class="mt-3 flex flex-wrap items-start gap-3">
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
              Lägg till läsare
            </button>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            Stripe Reader S700/S710 eller BBPOS WisePOS E. Koden visas på läsaren när du startar
            registreringen i dess inställningar. Läsaren behöver vara på nätet.
          </p>
        </section>
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
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });
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
    <h2 class="text-lg font-semibold">Kassaregister</h2>
    <p class="mt-1 mb-5 text-sm text-gray-600">
      Skatteverket kräver kassaregister när ni säljer för mer än fyra prisbasbelopp per år med kort, Swish
      eller kontant (fakturor räknas inte). Kvitton som utfärdas här registreras i en journal som inte går att
      ändra, och varje kvitto får en kontrollkod.
    </p>

    @if (status(); as s) {
      @if (!s.configured) {
        <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="setup()">
          Skapa kassaregister
        </button>
        <p class="mt-2 text-sm text-gray-600">
          Företagsuppgifterna hämtas från Företaget. Kvittonumren fortsätter efter det senaste kvittot.
        </p>
      } @else if (s.unit; as u) {
        @if (!u.control.certified) {
          <p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
            <b>Utvecklingsläge.</b> Kontrollsystemet är inte certifierat, så kvitton som utfärdas nu är inte
            giltiga och får inte användas i den riktiga verksamheten.
          </p>
        }
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <app-pill [tone]="u.status === 'active' ? 'green' : 'gray'">{{ u.status === 'active' ? 'På' : 'Av' }}</app-pill>
          @if (s.control && !s.control.reachable) {
            <app-pill tone="red">Kontrollsystemet svarar inte</app-pill>
          }
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="toggle(u.status !== 'active')">
            {{ u.status === 'active' ? 'Stäng av' : 'Slå på' }}
          </button>
          <button mat-button type="button" [disabled]="busy()" (click)="refreshCompany()">Hämta företagsuppgifterna igen</button>
        </div>
        <dl class="grid max-w-2xl grid-cols-[11rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-gray-500">Kassabeteckning</dt><dd>{{ u.label }}</dd>
          <dt class="text-gray-500">Kassaregisternummer</dt><dd class="font-mono">{{ s.registerNumber }}</dd>
          <dt class="text-gray-500">Modell och version</dt><dd>{{ s.model }} · {{ s.program }} {{ s.version }}</dd>
          <dt class="text-gray-500">Kontrollsystem</dt>
          <dd>{{ u.control.provider }} · <span class="font-mono">{{ u.control.serial }}</span></dd>
          <dt class="text-gray-500">Företag</dt><dd>{{ u.company.name }}, {{ u.company.orgNo }}</dd>
          <dt class="text-gray-500">Försäljningsställe</dt><dd>{{ u.company.address }}</dd>
          @if (s.counters; as c) {
            <dt class="text-gray-500">Senaste kvittonummer</dt><dd>{{ c.receipt }}</dd>
            <dt class="text-gray-500">Z-rapporter</dt><dd>{{ c.z }}</dd>
          }
        </dl>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <a mat-stroked-button routerLink="/finance/register"><mat-icon>point_of_sale</mat-icon> Rapporter och journal</a>
          <button mat-button type="button" [disabled]="busy()" (click)="verify()">Kontrollera journalen</button>
          @if (chain(); as ch) {
            @if (ch.ok) {
              <span class="text-sm text-teal-800">Journalen är hel ({{ ch.entries }} rader).</span>
            } @else {
              <span class="text-sm font-medium text-red-700">Journalen stämmer inte vid rad {{ ch.brokenAtSeq }}: {{ ch.reason }}</span>
            }
          }
        </div>
        <p class="mt-4 max-w-2xl text-xs text-gray-500">
          Registret är inte tillverkardeklarerat hos Skatteverket än. Ett kvitto i registret kan inte återöppnas:
          det tas tillbaka med en retur. Priser måste vara inkl. moms och utan avrundning till hela kronor.
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
