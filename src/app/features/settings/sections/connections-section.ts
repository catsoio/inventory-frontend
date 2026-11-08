import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupplierCatalogApi } from '../../../core/api/supplier-catalog-api';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { Billing } from '../../../core/billing/billing';
import type { BlocketStatus, CarInfoStatus, GummigrossenStatus } from '../../../core/models';
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
                  ? blocket()?.live
                    ? 'Annonserna publiceras'
                    : 'Annonserna skickas dolda'
                  : 'Lägg ut bilarna på Blocket och Bytbil'
              }}
            </span>
          </span>
          @if (blocket()?.connected) {
            <app-pill [tone]="blocket()?.live ? 'green' : 'amber'">{{
              blocket()?.live ? 'Ansluten' : 'Provläge'
            }}</app-pill>
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

  ngOnInit() {
    this.api.carInfo().subscribe((s) => this.status.set(s));
    this.catalogApi.settings().subscribe((s) => this.gummigrossen.set(s));
    if (this.hasCars()) this.api.blocket().subscribe((s) => this.blocket.set(s));
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
        <mat-radio-group
          [formControl]="live"
          class="mt-3 grid gap-3"
          aria-label="Hur annonserna skickas"
        >
          <label class="choice" [class.is-on]="live.value === false">
            <mat-radio-button [value]="false" class="font-medium">Provläge</mat-radio-button>
            <span class="choice-text"
              >Annonserna skickas dolda. De syns bara i Blockets adminpanel och kostar
              ingenting.</span
            >
          </label>
          <label class="choice" [class.is-on]="live.value === true">
            <mat-radio-button [value]="true" class="font-medium">Publicera</mat-radio-button>
            <span class="choice-text">Annonserna syns på Blocket och Bytbil.</span>
          </label>
        </mat-radio-group>
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
            token.value.trim()
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
export class BlocketConnectionDialog {
  private readonly api = inject(WorkshopApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject<MatDialogRef<BlocketConnectionDialog, BlocketStatus>>(MatDialogRef);
  readonly current = inject<BlocketStatus | null>(MAT_DIALOG_DATA);

  readonly busy = signal(false);
  readonly token = new FormControl('', { nonNullable: true });
  readonly dealerCode = new FormControl(this.current?.dealerCode ?? '', { nonNullable: true });
  readonly live = new FormControl(this.current?.live ?? false, { nonNullable: true });

  /** En ny anslutning kräver nyckeln; en befintlig kan ändra resten utan den. */
  canSave() {
    return !!this.current?.connected || this.token.value.trim().length > 0;
  }

  save() {
    if (!this.canSave()) return;
    this.busy.set(true);
    const token = this.token.value.trim();
    this.api
      .saveBlocket({
        ...(token ? { token } : {}),
        dealerCode: this.dealerCode.value.trim() || null,
        live: this.live.value,
      })
      .subscribe({
        next: (s) => {
          this.snack.open(token ? 'Anslutningen fungerar' : 'Sparat', 'OK', { duration: 4000 });
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
