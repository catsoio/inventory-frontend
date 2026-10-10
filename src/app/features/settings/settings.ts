import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryApi } from '../../core/api/inventory-api';
import { Auth } from '../../core/auth/auth';
import { GarageMember, SEASON_LABELS } from '../../core/models';
import { AppSettings, Settings } from '../../core/settings';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';

@Component({
  selector: 'app-settings',
  standalone: false,
  template: `
    <h1 class="mb-4 text-2xl font-semibold">Inställningar</h1>
    <form [formGroup]="form" (ngSubmit)="save()" class="flex max-w-4xl flex-col gap-4">
      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Visning</h2>
        <div class="grid gap-x-6 p-4 sm:grid-cols-3">
          <mat-form-field>
            <mat-label>Standardvy för artiklar</mat-label>
            <mat-select formControlName="defaultView">
              <mat-option value="auto">Automatisk (tabell på dator)</mat-option>
              <mat-option value="table">Tabell</mat-option>
              <mat-option value="cards">Kort</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Rader per hämtning</mat-label>
            <mat-select formControlName="pageSize">
              <mat-option [value]="50">50</mat-option>
              <mat-option [value]="100">100</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Period på översikten</mat-label>
            <mat-select formControlName="dashboardDays">
              <mat-option [value]="7">7 dagar</mat-option>
              <mat-option [value]="30">30 dagar</mat-option>
              <mat-option [value]="90">90 dagar</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Standardvärden för nya artiklar</h2>
        <div class="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <mat-form-field>
            <mat-label>Säsong</mat-label>
            <mat-select formControlName="defaultSeason">
              @for (s of seasons; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Leverantör</mat-label>
            <input matInput formControlName="defaultSupplier" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Beställningspunkt (st)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="defaultReorderLevel" />
            <mat-error>Heltal, 0 eller mer</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Påslag på inköpspris (%)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="markupPercent" />
            <mat-hint>Föreslår försäljningspris vid ingångslager</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <section class="rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Däckhotell</h2>
        <div class="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <mat-form-field>
            <mat-label>Standardavgift per inlämning (kr)</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="defaultStorageFee" />
            <mat-hint>Förifylls vid ny inlämning</mat-hint>
            <mat-error>0 eller mer</mat-error>
          </mat-form-field>
        </div>
      </section>

      <div class="flex gap-2">
        <button mat-flat-button color="primary" [disabled]="form.invalid">Spara</button>
        <button mat-button type="button" (click)="reset()">Återställ standard</button>
      </div>
    </form>

    <section class="mt-4 max-w-4xl rounded-xl bg-white shadow-sm">
      <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Mitt lösenord</h2>
      <form
        [formGroup]="pwForm"
        (ngSubmit)="changePassword()"
        class="grid gap-x-4 p-4 sm:grid-cols-3"
      >
        <mat-form-field>
          <mat-label>Nuvarande lösenord</mat-label>
          <input
            matInput
            type="password"
            autocomplete="current-password"
            formControlName="current"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Nytt lösenord</mat-label>
          <input matInput type="password" autocomplete="new-password" formControlName="next" />
          <mat-error>Minst 8 tecken</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Upprepa nytt lösenord</mat-label>
          <input matInput type="password" autocomplete="new-password" formControlName="repeat" />
          @if (pwForm.errors?.['mismatch']) {
            <mat-error>Lösenorden stämmer inte överens</mat-error>
          }
        </mat-form-field>
        <div class="sm:col-span-3">
          <button mat-stroked-button [disabled]="pwForm.invalid || pwBusy()">Byt lösenord</button>
          <span class="ml-3 text-xs text-gray-500">Du loggas ut på andra enheter.</span>
        </div>
      </form>
    </section>

    @if (auth.isAdmin()) {
      <section class="mt-4 max-w-4xl rounded-xl bg-white shadow-sm">
        <h2 class="px-5 pt-5 pb-1 text-base font-semibold">Personal i {{ auth.garage()?.name }}</h2>
        <div class="flex flex-col gap-3 p-4">
          @for (m of members(); track m.userId) {
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-medium">{{ label(m) }}</span>
                  <app-pill [tone]="m.role === 'owner' ? 'blue' : 'gray'">{{
                    m.role === 'owner' ? 'Ägare' : 'Personal'
                  }}</app-pill>
                  @if (m.status === 'blocked') {
                    <app-pill tone="red">Spärrad</app-pill>
                  }
                </div>
                <div class="truncate text-xs text-gray-500">
                  {{ detail(m) }}
                </div>
              </div>
              @if (auth.isSuperAdmin()) {
                <button mat-button type="button" (click)="resetPassword(m)">
                  <mat-icon>key</mat-icon> Byt lösenord
                </button>
                @if (m.userId !== auth.user()?.id) {
                  <button
                    mat-button
                    type="button"
                    [color]="m.status === 'blocked' ? 'primary' : 'warn'"
                    (click)="toggleBlocked(m)"
                  >
                    <mat-icon>{{ m.status === 'blocked' ? 'lock_open' : 'block' }}</mat-icon>
                    {{ m.status === 'blocked' ? 'Aktivera' : 'Spärra' }}
                  </button>
                }
              }
              @if (m.role !== 'owner') {
                <button mat-button type="button" (click)="remove(m)">Ta bort</button>
              }
            </div>
          }
          <div class="flex items-center gap-3">
            <button mat-stroked-button type="button" (click)="invite()">
              Skapa inbjudningskod
            </button>
            @if (inviteCode()) {
              <code class="rounded bg-gray-100 px-2 py-1 select-all">{{ inviteCode() }}</code>
              <span class="text-xs text-gray-500">Gäller 7 dagar, kan användas en gång</span>
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class SettingsPage {
  private readonly settings = inject(Settings);
  private readonly snack = inject(MatSnackBar);
  private readonly api = inject(InventoryApi);
  protected readonly auth = inject(Auth);
  private readonly dialog = inject(MatDialog);
  readonly members = signal<GarageMember[]>([]);
  readonly pwBusy = signal(false);
  readonly pwForm = inject(FormBuilder).nonNullable.group(
    {
      current: ['', Validators.required],
      next: ['', [Validators.required, Validators.minLength(8)]],
      repeat: ['', Validators.required],
    },
    {
      validators: (g: AbstractControl) =>
        g.get('next')?.value !== g.get('repeat')?.value ? { mismatch: true } : null,
    },
  );
  readonly inviteCode = signal<string | null>(null);
  readonly seasons = Object.entries(SEASON_LABELS);

  readonly form = inject(FormBuilder).nonNullable.group({
    defaultView: this.settings.value().defaultView,
    pageSize: this.settings.value().pageSize,
    dashboardDays: this.settings.value().dashboardDays,
    defaultSeason: this.settings.value().defaultSeason,
    defaultSupplier: this.settings.value().defaultSupplier,
    defaultReorderLevel: [
      this.settings.value().defaultReorderLevel,
      [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
    ],
    markupPercent: [this.settings.value().markupPercent, [Validators.required, Validators.min(0)]],
    defaultStorageFee: [
      this.settings.value().defaultStorageFee,
      [Validators.required, Validators.min(0)],
    ],
  });

  constructor() {
    if (this.auth.isAdmin()) this.loadMembers();
  }

  private loadMembers() {
    this.api.members().subscribe((m) => this.members.set(m));
  }

  invite() {
    this.api.createInvite().subscribe((i) => this.inviteCode.set(i.code));
  }

  label(m: GarageMember) {
    return m.name || m.email || m.phone || m.userId;
  }

  detail(m: GarageMember) {
    const seen = m.lastSeenAt
      ? `senast inloggad ${new Date(m.lastSeenAt).toLocaleDateString('sv-SE')}`
      : 'har aldrig loggat in';
    return [m.name ? m.email : null, m.phone, seen].filter(Boolean).join(' · ');
  }

  resetPassword(m: GarageMember) {
    this.dialog
      .open<ResetPasswordDialog, GarageMember, boolean>(ResetPasswordDialog, {
        data: m,
        width: '440px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(
        (ok) => ok && this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 }),
      );
  }

  toggleBlocked(m: GarageMember) {
    this.api
      .setMemberBlocked(m.userId, m.status !== 'blocked')
      .subscribe((list) => this.members.set(list));
  }

  changePassword() {
    const { current, next } = this.pwForm.getRawValue();
    this.pwBusy.set(true);
    this.auth.changePassword(current, next).subscribe({
      next: () => {
        this.pwBusy.set(false);
        this.pwForm.reset();
        this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 });
      },
      error: () => this.pwBusy.set(false),
    });
  }

  remove(m: GarageMember) {
    this.api.removeMember(m.userId).subscribe(() => this.loadMembers());
  }

  save() {
    this.settings.save(this.form.getRawValue() as AppSettings);
    this.snack.open('Inställningarna sparades', undefined, { duration: 2500 });
  }

  reset() {
    this.settings.reset();
    this.form.reset(this.settings.value());
  }
}
