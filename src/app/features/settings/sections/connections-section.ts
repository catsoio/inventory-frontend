import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map, of, switchMap } from 'rxjs';
import { BlocketImportApi } from '../../../core/api/car-api';
import { SupplierCatalogApi } from '../../../core/api/supplier-catalog-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { ZettleApi } from '../../../core/api/zettle-api';
import { Billing } from '../../../core/billing/billing';
import type {
  BlocketAccessStatus,
  BlocketStatus,
  CarInfoStatus,
  GummigrossenStatus,
  ZettleStatus,
} from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

/** Anslutningar till andra tjänster, ett kort per tjänst; klick öppnar inloggningen. */
@Component({
  selector: 'app-settings-connections',
  standalone: false,
  template: `
    <div class="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        class="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
        (click)="open()"
      >
        <span
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#1d2733] p-2"
        >
          <img src="car-info-logo.svg" alt="" class="max-h-full max-w-full" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold">car.info</span>
          <span class="block text-sm text-gray-500">
            {{
              status()?.connected
                ? (status()?.email ?? '')
                : 'Hämtar fordonsuppgifter från regnumret'
            }}
          </span>
        </span>
        @if (status()?.connected) {
          <app-pill tone="green">Ansluten</app-pill>
        } @else {
          <mat-icon class="text-gray-500">add</mat-icon>
        }
      </button>
      <button
        type="button"
        class="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
        (click)="openGummigrossen()"
      >
        <span
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#c8102e] text-white"
        >
          <mat-icon>tire_repair</mat-icon>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold">Gummigrossen</span>
          <span class="block text-sm text-gray-500">
            {{
              gummigrossen()?.connected
                ? (gummigrossen()?.name ?? 'Kundnummer ' + gummigrossen()?.customerNo)
                : 'Sök däck och priser, och hämta tidigare beställningar'
            }}
          </span>
        </span>
        @if (gummigrossen()?.connected) {
          <app-pill tone="green">Ansluten</app-pill>
        } @else {
          <mat-icon class="text-gray-500">add</mat-icon>
        }
      </button>
      @if (hasTill()) {
        <button
          type="button"
          class="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
          (click)="openZettle()"
        >
          <span
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#003087] text-white"
          >
            <mat-icon>point_of_sale</mat-icon>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">PayPal-kassan (Zettle)</span>
            <span class="block text-sm text-gray-500">
              {{
                zettle()?.connected
                  ? 'Köpen läses in till lager och Ekonomi → Kassa'
                  : 'Ta betalt av kunder som inte vill ha faktura, med en godkänd kassa'
              }}
            </span>
          </span>
          @if (zettle()?.connected) {
            <app-pill tone="green">Ansluten</app-pill>
          } @else {
            <mat-icon class="text-gray-500">add</mat-icon>
          }
        </button>
      }
      @if (hasCars()) {
        <button
          type="button"
          class="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
          (click)="openBlocket()"
        >
          <span
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#1f4fd8] text-white"
          >
            <mat-icon>campaign</mat-icon>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">Blocket</span>
            <span class="block text-sm text-gray-500">
              {{
                blocket()?.connected
                  ? 'Bilarna skickas som utkast och publiceras från bilkortet'
                  : 'Lägg ut bilarna på Blocket och Bytbil'
              }}
            </span>
          </span>
          @if (blocket()?.connected) {
            <app-pill tone="green">Ansluten</app-pill>
          } @else {
            <mat-icon class="text-gray-500">add</mat-icon>
          }
        </button>
      }
    </div>
  `,
})
export class SettingsConnections implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly billing = inject(Billing);

  readonly status = signal<CarInfoStatus | null>(null);
  readonly blocket = signal<BlocketStatus | null>(null);
  readonly gummigrossen = signal<GummigrossenStatus | null>(null);
  private readonly catalogApi = inject(SupplierCatalogApi);
  /** Blocket gäller bilhandeln, så kortet visas bara för ett garage som har den. */
  readonly hasCars = () => this.billing.allows('bilhandel');
  readonly zettle = signal<ZettleStatus | null>(null);
  private readonly zettleApi = inject(ZettleApi);
  /** Kassan hör till Ekonomi (modulen bokföring). */
  readonly hasTill = () => this.billing.allows('bokforing');

  ngOnInit() {
    this.api.carInfo().subscribe((s) => this.status.set(s));
    this.catalogApi.settings().subscribe((s) => this.gummigrossen.set(s));
    if (this.hasCars()) this.api.blocket().subscribe((s) => this.blocket.set(s));
    if (this.hasTill()) this.zettleApi.status().subscribe((s) => this.zettle.set(s));
  }

  openZettle() {
    this.dialog
      .open<ZettleConnectionDialog, ZettleStatus | null, ZettleStatus>(ZettleConnectionDialog, {
        data: this.zettle(),
        width: '520px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((s) => s && this.zettle.set(s));
  }

  openGummigrossen() {
    this.dialog
      .open<GummigrossenConnectionDialog, GummigrossenStatus | null, GummigrossenStatus>(
        GummigrossenConnectionDialog,
        { data: this.gummigrossen(), width: '440px', maxWidth: '95vw' },
      )
      .afterClosed()
      .subscribe((s) => s && this.gummigrossen.set(s));
  }

  openBlocket() {
    this.dialog
      .open<BlocketConnectionDialog, BlocketStatus | null, BlocketStatus>(BlocketConnectionDialog, {
        data: this.blocket(),
        width: '480px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((s) => s && this.blocket.set(s));
  }

  open() {
    this.dialog
      .open<CarInfoConnectionDialog, CarInfoStatus | null, CarInfoStatus>(CarInfoConnectionDialog, {
        data: this.status(),
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((s) => s && this.status.set(s));
  }
}

@Component({
  selector: 'app-car-info-connection-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>car.info</h2>
    <form (submit)="$event.preventDefault(); save()" autocomplete="off">
      <mat-dialog-content class="!flex flex-col gap-1 !pt-2">
        <mat-form-field>
          <mat-label>E-post</mat-label>
          <input matInput type="email" [formControl]="email" autocomplete="off" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Lösenord</mat-label>
          <input matInput type="password" [formControl]="password" autocomplete="new-password" />
        </mat-form-field>
      </mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-dialog-actions>
        @if (current?.connected) {
          <button mat-button type="button" color="warn" [disabled]="busy()" (click)="remove()">
            Ta bort
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="busy() || email.invalid || password.invalid"
        >
          {{ busy() ? 'Testar…' : 'Testa anslutning' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class CarInfoConnectionDialog {
  private readonly api = inject(WorkshopApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject<MatDialogRef<CarInfoConnectionDialog, CarInfoStatus>>(MatDialogRef);
  readonly current = inject<CarInfoStatus | null>(MAT_DIALOG_DATA);

  readonly busy = signal(false);
  readonly email = new FormControl(this.current?.email ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  readonly password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  save() {
    if (this.email.invalid || this.password.invalid) return;
    this.busy.set(true);
    this.api.saveCarInfo(this.email.value.trim(), this.password.value).subscribe({
      next: (s) => {
        this.snack.open('Anslutningen fungerar', 'OK', { duration: 4000 });
        this.ref.close(s);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    this.confirm
      .ask({
        title: 'Ta bort anslutningen?',
        message: 'Därefter hämtas bara de grundläggande uppgifterna om en bil.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.clearCarInfo().subscribe({
          next: (s) => this.ref.close(s),
          error: () => this.busy.set(false),
        });
      });
  }
}

@Component({
  selector: 'app-blocket-connection-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Blocket</h2>
    <form (submit)="$event.preventDefault(); save()" autocomplete="off">
      <mat-dialog-content class="!flex flex-col gap-2 !pt-2 !pb-4">
        @if (!current?.connected) {
          <p class="text-sm text-gray-600">
            Bilarna läggs ut på Blocket och Bytbil med en API-nyckel från Blocket. Mejla
            butikssupport&#64;blocket.se och be om nyckel till Pro Import API för ert handlarkonto.
          </p>
        }
        <mat-form-field>
          @if (current?.connected) {
            <mat-label>Ny nyckel (lämna tom för att behålla)</mat-label>
          } @else {
            <mat-label>Nyckel från Blocket</mat-label>
          }
          <input matInput type="password" [formControl]="token" autocomplete="new-password" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Handlarkod (valfri)</mat-label>
          <input matInput [formControl]="dealerCode" autocomplete="off" />
          <mat-hint>Behövs bara om nyckeln gäller flera handlare.</mat-hint>
        </mat-form-field>
        <p class="mt-1 text-sm text-gray-600">
          Bilarna skickas alltid först som utkast, dolda hos Blocket. Du publicerar varje bil från
          bilkortet när du är redo.
        </p>
        <div class="mt-4 border-t border-gray-200 pt-4">
          <div class="mb-1 flex items-center gap-2">
            <h3 class="flex-1 text-sm font-semibold">Läs in bilar som redan ligger ute</h3>
            @if (read()?.source === 'own') {
              <app-pill tone="green">Kopplad</app-pill>
            }
          </div>
          <p class="mb-3 text-sm text-gray-600">
            Med en nyckel som får läsa annonser (Access API, get.vehicles) läser knappen Läs in från
            Blocket på bil-listan in bilarna ni redan har ute. Skriv in nyckeln här en gång. Mejla
            butikssupport&#64;blocket.se och be om en.
          </p>
          <div class="flex flex-col gap-2">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{
                read()?.source === 'own'
                  ? 'Ny läsnyckel (lämna tom för att behålla)'
                  : 'Läsnyckel från Blocket'
              }}</mat-label>
              <input
                matInput
                type="password"
                [formControl]="readToken"
                autocomplete="new-password"
              />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Handlargrupp (valfri)</mat-label>
              <input matInput [formControl]="readGroup" autocomplete="off" />
              <mat-hint>Lämna tom: gruppen eller handlaren hittas ur nyckeln.</mat-hint>
            </mat-form-field>
            @if (readGroup.value.trim()) {
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Handlarkod i gruppen (valfri)</mat-label>
                <input matInput [formControl]="readDealer" autocomplete="off" />
                <mat-hint>Tom = hela gruppen.</mat-hint>
              </mat-form-field>
            }
            @if (read()?.source === 'own') {
              <button
                mat-button
                type="button"
                color="warn"
                class="self-start"
                [disabled]="busy()"
                (click)="removeRead()"
              >
                Ta bort läsnyckeln
              </button>
            }
          </div>
        </div>
      </mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-dialog-actions>
        @if (current?.connected) {
          <button mat-button type="button" color="warn" [disabled]="busy()" (click)="remove()">
            Ta bort
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button mat-flat-button color="primary" [disabled]="busy() || !canSave()">
          {{
            token.value.trim() || readToken.value.trim()
              ? busy()
                ? 'Testar…'
                : 'Testa anslutning'
              : busy()
                ? 'Sparar…'
                : 'Spara'
          }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class BlocketConnectionDialog implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly importApi = inject(BlocketImportApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject<MatDialogRef<BlocketConnectionDialog, BlocketStatus>>(MatDialogRef);
  readonly current = inject<BlocketStatus | null>(MAT_DIALOG_DATA);

  readonly busy = signal(false);
  readonly token = new FormControl('', { nonNullable: true });
  readonly dealerCode = new FormControl(this.current?.dealerCode ?? '', { nonNullable: true });

  /** Nyckeln för att läsa in bilar som redan ligger ute; en annan än den som skickar annonser. */
  readonly read = signal<BlocketAccessStatus | null>(null);
  readonly readToken = new FormControl('', { nonNullable: true });
  readonly readGroup = new FormControl('', { nonNullable: true });
  readonly readDealer = new FormControl('', { nonNullable: true });

  ngOnInit() {
    this.importApi.connection().subscribe((c) => {
      this.read.set(c);
      // Bara det en egen läsnyckel sparat fylls i; handlarkoden för att skicka annonser är inte den.
      if (c.source === 'own') {
        this.readGroup.setValue(c.group ?? '');
        this.readDealer.setValue(c.group ? (c.dealerCode ?? '') : '');
      }
    });
  }

  /** Har läsinställningarna ändrats: en ny nyckel, eller en ändrad grupp eller handlare. */
  private readChanged() {
    if (this.readToken.value.trim()) return true;
    const r = this.read();
    if (r?.source !== 'own') return false;
    return (
      this.readGroup.value.trim() !== (r.group ?? '') ||
      (!!this.readGroup.value.trim() && this.readDealer.value.trim() !== (r.dealerCode ?? ''))
    );
  }

  /** En ny anslutning kräver en nyckel (för att skicka eller läsa); en befintlig kan ändra resten utan. */
  canSave() {
    return !!this.current?.connected || this.token.value.trim().length > 0 || this.readChanged();
  }

  save() {
    if (!this.canSave()) return;
    this.busy.set(true);
    const token = this.token.value.trim();
    const readToken = this.readToken.value.trim();
    const group = this.readGroup.value.trim();
    const sending$: Observable<BlocketStatus | null> =
      this.current?.connected || token
        ? this.api.saveBlocket({
            ...(token ? { token } : {}),
            dealerCode: this.dealerCode.value.trim() || null,
          })
        : of(null);
    sending$
      .pipe(
        switchMap((s) =>
          this.readChanged()
            ? this.importApi
                .saveConnection({
                  ...(readToken ? { token: readToken } : {}),
                  group: group || null,
                  // Utan grupp läses handlaren som skickar annonser; med grupp väljer koden en i den.
                  dealerCode: group ? this.readDealer.value.trim() || null : null,
                })
                .pipe(map(() => s))
            : of(s),
        ),
      )
      .subscribe({
        next: (s) => {
          this.snack.open(token || readToken ? 'Anslutningen fungerar' : 'Sparat', 'OK', {
            duration: 4000,
          });
          this.ref.close(s ?? this.current ?? undefined);
        },
        error: () => this.busy.set(false),
      });
  }

  removeRead() {
    this.confirm
      .ask({
        title: 'Ta bort läsnyckeln?',
        message:
          'Bilar som redan är inlästa ligger kvar. Ni kan lägga in en nyckel igen när som helst.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.importApi.clearConnection().subscribe({
          next: (c) => {
            this.busy.set(false);
            this.read.set(c);
            this.readGroup.setValue('');
            this.readDealer.setValue('');
          },
          error: () => this.busy.set(false),
        });
      });
  }

  remove() {
    this.confirm
      .ask({
        title: 'Ta bort anslutningen?',
        message:
          'Annonser som redan ligger på Blocket tas inte bort, och bilarna uppdateras inte där längre. Ta bort annonserna först om de ska bort.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.clearBlocket().subscribe({
          next: (s) => this.ref.close(s),
          error: () => this.busy.set(false),
        });
      });
  }
}

@Component({
  selector: 'app-gummigrossen-connection-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Gummigrossen</h2>
    <form (submit)="$event.preventDefault(); save()" autocomplete="off">
      <mat-dialog-content class="!flex flex-col gap-1 !pt-2">
        @if (!current?.connected) {
          <p class="mb-2 text-sm text-gray-600">
            Logga in med ert kundnummer och lösenord hos Gummigrossen. Då kan ni söka däck med era
            egna priser och lagersaldo när ni lägger in artiklar och inköp, och hämta tidigare
            beställningar som inköp. Inget beställs härifrån.
          </p>
        }
        <mat-form-field>
          <mat-label>Kundnummer</mat-label>
          <input matInput inputmode="numeric" [formControl]="customerNo" autocomplete="off" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Lösenord</mat-label>
          <input matInput type="password" [formControl]="password" autocomplete="new-password" />
        </mat-form-field>
      </mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-dialog-actions>
        @if (current?.connected) {
          <button mat-button type="button" color="warn" [disabled]="busy()" (click)="remove()">
            Ta bort
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="busy() || customerNo.invalid || password.invalid"
        >
          {{ busy() ? 'Testar…' : 'Testa anslutning' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class GummigrossenConnectionDialog {
  private readonly api = inject(SupplierCatalogApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref =
    inject<MatDialogRef<GummigrossenConnectionDialog, GummigrossenStatus>>(MatDialogRef);
  readonly current = inject<GummigrossenStatus | null>(MAT_DIALOG_DATA);

  readonly busy = signal(false);
  readonly customerNo = new FormControl(this.current?.customerNo ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{1,12}$/)],
  });
  readonly password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  save() {
    if (this.customerNo.invalid || this.password.invalid) return;
    this.busy.set(true);
    this.api.save(this.customerNo.value.trim(), this.password.value).subscribe({
      next: (s) => {
        this.snack.open(`Ansluten som ${s.name ?? s.customerNo}`, 'OK', { duration: 4000 });
        this.ref.close(s);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    this.confirm
      .ask({
        title: 'Ta bort anslutningen?',
        message:
          'Artiklar och inköp som redan är hämtade ligger kvar. Sökningen hos Gummigrossen försvinner.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.clear().subscribe({
          next: (s) => this.ref.close(s),
          error: () => this.busy.set(false),
        });
      });
  }
}

/**
 * PayPal-kassan (PayPal Point of Sale, tidigare Zettle): ägaren skapar en API-nyckel hos PayPal och
 * klistrar in klient-id och nyckel här. Kassan är kassaregistret för köp utan faktura; Axle läser in
 * köpen och skickar artiklarna till kassans produktlista.
 */
@Component({
  selector: 'app-zettle-connection-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>PayPal-kassan (Zettle)</h2>
    <form (submit)="$event.preventDefault(); save()" autocomplete="off">
      <mat-dialog-content class="!flex flex-col gap-1 !pt-2">
        @if (current?.connected) {
          <p class="mb-2 text-sm text-gray-600">
            Ansluten sedan {{ day(current?.connectedAt) }}. Köp från och med
            {{ day(current?.since) }} läses in av sig självt med några minuters mellanrum och drar
            lagret. Byt nyckel genom att klistra in en ny.
          </p>
        } @else {
          <p class="mb-2 text-sm text-gray-600">
            För kunder som köper vid disken utan faktura (anonyma köp). Köpet slås in i PayPals
            kassaapp, som är ett godkänt kassaregister, och Axle läser in det: lagret dras och köpet
            syns under Ekonomi → Kassa och i momsrapporten. Era artiklar skickas till kassans
            produktlista, så personalen trycker på varan i stället för att skriva.
          </p>
          <ol class="mb-3 list-decimal space-y-1 pl-5 text-sm text-gray-600">
            <li>Aktivera kassaregistret i PayPal-appen och anmäl det hos Skatteverket.</li>
            <li>
              <a
                class="font-medium text-teal-700 underline"
                [href]="link"
                target="_blank"
                rel="noopener"
                >Skapa en API-nyckel hos PayPal</a
              >
              (logga in som kontots ägare; namn och behörigheter är ifyllda).
            </li>
            <li>Klistra in klient-id och API-nyckel nedan.</li>
          </ol>
        }
        <mat-form-field>
          <mat-label>Klient-id</mat-label>
          <input matInput [formControl]="clientId" autocomplete="off" spellcheck="false" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>API-nyckel</mat-label>
          <textarea
            matInput
            rows="3"
            [formControl]="apiKey"
            autocomplete="off"
            spellcheck="false"
            class="font-mono text-xs"
          ></textarea>
          <mat-hint>Visas bara en gång hos PayPal. Sparas krypterad och visas aldrig här.</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-dialog-actions>
        @if (current?.connected) {
          <button mat-button type="button" color="warn" [disabled]="busy()" (click)="remove()">
            Koppla bort
          </button>
        }
        <span class="flex-1"></span>
        <button mat-button type="button" mat-dialog-close>Avbryt</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="busy() || clientId.invalid || apiKey.invalid"
        >
          {{ busy() ? 'Testar…' : 'Testa anslutning' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ZettleConnectionDialog {
  private readonly api = inject(ZettleApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject<MatDialogRef<ZettleConnectionDialog, ZettleStatus>>(MatDialogRef);
  readonly current = inject<ZettleStatus | null>(MAT_DIALOG_DATA);
  readonly link =
    this.current?.apiKeyLink ??
    'https://my.zettle.com/apps/api-keys?name=Axle&scopes=READ:PURCHASE%20READ:PRODUCT%20WRITE:PRODUCT';

  readonly busy = signal(false);
  readonly clientId = new FormControl(this.current?.clientId ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9-]{8,80}\s*$/)],
  });
  readonly apiKey = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(20)],
  });

  day(iso: string | null | undefined) {
    return iso ? iso.slice(0, 10) : '–';
  }

  save() {
    if (this.clientId.invalid || this.apiKey.invalid) return;
    this.busy.set(true);
    this.api.connect(this.clientId.value.trim(), this.apiKey.value.trim()).subscribe({
      next: (s) => {
        this.snack.open('PayPal-kassan är ansluten', 'OK', { duration: 4000 });
        this.ref.close(s);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    this.confirm
      .ask({
        title: 'Koppla bort PayPal-kassan?',
        message:
          'Inga nya köp läses in och lagret dras inte längre för det som säljs i kassan. Köp som redan är inlästa och varorna i kassans produktlista ligger kvar.',
        confirmText: 'Koppla bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.disconnect().subscribe({
          next: (s) => this.ref.close(s),
          error: () => this.busy.set(false),
        });
      });
  }
}
