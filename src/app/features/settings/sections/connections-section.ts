import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WorkshopApi } from '../../../core/api/workshop-api';
import type { CarInfoStatus } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

/** Anslutningar till andra tjänster, ett kort per tjänst; klick öppnar inloggningen. */
@Component({
  selector: 'app-settings-connections',
  standalone: false,
  template: `
    <h2 class="mb-4 text-lg font-semibold">Anslutningar</h2>
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
          @if (status(); as s) {
            @if (s.connected) {
              <span class="block truncate text-sm text-gray-500">{{ s.email }}</span>
            }
          }
        </span>
        @if (status()?.connected) {
          <app-pill tone="green">Ansluten</app-pill>
        } @else {
          <mat-icon class="text-gray-500">add</mat-icon>
        }
      </button>
    </div>
  `,
})
export class SettingsConnections implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);

  readonly status = signal<CarInfoStatus | null>(null);

  ngOnInit() {
    this.api.carInfo().subscribe((s) => this.status.set(s));
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
