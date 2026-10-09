import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { InventoryApi } from '../../core/api/inventory-api';
import { Auth } from '../../core/auth/auth';

@Component({
  selector: 'app-onboarding',
  standalone: false,
  template: `
    <div class="auth-bg flex min-h-screen flex-col items-center px-4 py-10">
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white"
        >
          <mat-icon class="!h-8 !w-8 !text-[32px]">warehouse</mat-icon>
        </div>
        <h1 class="text-2xl font-semibold">Välkommen till Däcklager</h1>
        <p class="mt-1 text-gray-600">
          Inloggad som {{ auth.user()?.email ?? 'dig' }}. Välj hur du vill komma igång.
        </p>
      </div>

      @if (!mode()) {
        <div class="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <button type="button" (click)="mode.set('create')" class="choice">
            <mat-icon class="text-brand">add_business</mat-icon>
            <span class="text-lg font-semibold">Skapa nytt garage</span>
            <span class="text-sm text-gray-600">
              Du är först i ditt företag. Du blir ägare och bjuder in kollegor senare.
            </span>
          </button>
          <button type="button" (click)="mode.set('join')" class="choice">
            <mat-icon class="text-brand">group_add</mat-icon>
            <span class="text-lg font-semibold">Gå med i ett garage</span>
            <span class="text-sm text-gray-600">
              Din kollega har redan ett garage och har gett dig en inbjudningskod.
            </span>
          </button>
        </div>
      } @else {
        <mat-card class="w-full max-w-md p-6">
          <button mat-button type="button" class="!-ml-3 mb-2" (click)="back()">
            <mat-icon>arrow_back</mat-icon> Tillbaka
          </button>
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-1">
            @if (mode() === 'create') {
              <h2 class="text-xl font-semibold">Skapa nytt garage</h2>
              <p class="mb-3 text-sm text-gray-600">
                Allt lager och alla försäljningar sparas separat för ert garage.
              </p>
              <mat-form-field>
                <mat-label>Garagets namn</mat-label>
                <input matInput formControlName="name" placeholder="t.ex. Däckhotellet AB" />
                <mat-error>Minst 2 tecken</mat-error>
              </mat-form-field>
            } @else {
              <h2 class="text-xl font-semibold">Gå med i ett garage</h2>
              <p class="mb-3 text-sm text-gray-600">
                Be ägaren öppna Inställningar &rarr; Personal och välja "Skapa inbjudningskod".
                Koden gäller i 7 dagar och kan användas en gång.
              </p>
              <mat-form-field>
                <mat-label>Inbjudningskod</mat-label>
                <input matInput formControlName="code" autocomplete="off" />
                <mat-error>Klistra in hela koden</mat-error>
              </mat-form-field>
            }
            <button mat-flat-button color="primary" class="!h-12" [disabled]="invalid() || busy()">
              {{ mode() === 'create' ? 'Skapa garage' : 'Gå med' }}
            </button>
          </form>
        </mat-card>
      }

      <button mat-button class="mt-6" type="button" (click)="auth.logout()">
        Logga in med ett annat konto
      </button>
    </div>
  `,
  styles: `
    .auth-bg {
      background:
        radial-gradient(
          circle at 15% 20%,
          color-mix(in srgb, var(--mat-sys-primary) 35%, white),
          transparent 50%
        ),
        radial-gradient(
          circle at 85% 80%,
          color-mix(in srgb, var(--mat-sys-primary) 25%, white),
          transparent 45%
        ),
        #eef1f6;
    }
    .choice {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
      padding: 1.5rem;
      text-align: left;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      cursor: pointer;
      transition:
        box-shadow 0.15s,
        border-color 0.15s;
    }
    .choice:hover {
      border-color: currentColor;
      box-shadow: 0 4px 14px rgb(0 0 0 / 0.08);
    }
  `,
})
export class Onboarding {
  protected readonly auth = inject(Auth);
  private readonly api = inject(InventoryApi);
  private readonly router = inject(Router);

  readonly mode = signal<'create' | 'join' | null>(null);
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    code: ['', [Validators.required, Validators.minLength(8)]],
  });

  back() {
    this.mode.set(null);
    this.form.reset();
  }

  invalid() {
    const c = this.form.controls;
    return (this.mode() === 'create' ? c.name : c.code).invalid;
  }

  submit() {
    const { name, code } = this.form.getRawValue();
    this.busy.set(true);
    const request =
      this.mode() === 'create' ? this.api.createGarage(name) : this.api.joinGarage(code);
    request.subscribe({
      next: (garage) => {
        this.auth.setGarage(garage);
        this.router.navigateByUrl('/');
      },
      error: () => this.busy.set(false),
    });
  }
}
