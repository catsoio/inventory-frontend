import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { ApiError } from '../../core/models';

type Mode = 'login' | 'register' | 'verify';

@Component({
  selector: 'app-login',
  standalone: false,
  template: `
    <div class="auth-bg flex min-h-screen items-center justify-center p-4">
      <div class="flex w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <aside class="auth-hero hidden flex-1 flex-col justify-between p-10 text-white md:flex">
          <div class="flex items-center gap-3 text-xl font-semibold">
            <mat-icon>tire_repair</mat-icon> Catso | Däcklager
          </div>
          <div>
            <h2 class="mb-4 text-3xl leading-tight font-semibold">
              Full koll på lagret.<br />Varje däck, varje affär.
            </h2>
            <ul class="space-y-3 text-white/90">
              <li class="flex items-center gap-3">
                <mat-icon>inventory_2</mat-icon> Lagersaldo i realtid
              </li>
              <li class="flex items-center gap-3">
                <mat-icon>swap_horiz</mat-icon> Inköp, försäljning och inventering
              </li>
              <li class="flex items-center gap-3">
                <mat-icon>insights</mat-icon> Rapporter och vinst per period
              </li>
            </ul>
          </div>
          <p class="text-sm text-white/70"></p>
        </aside>

        <div class="w-full p-8 sm:p-12 md:w-[28rem] md:shrink-0">
          <div class="mb-6 flex items-center gap-2 text-brand md:hidden">
            <mat-icon>tire_repair</mat-icon>
            <span class="text-lg font-semibold">Däcklager</span>
          </div>
          <h1 class="mb-1 text-2xl font-semibold">{{ title() }}</h1>
          <p class="mb-5 text-sm text-gray-600">
            @switch (mode()) {
              @case ('login') {
                Logga in för att hantera ert lager.
              }
              @case ('register') {
                Skapa ett konto med din e-post.
              }
              @case ('verify') {
                Vi har skickat en kod till {{ form.controls.email.value }}. Skriv in den för att
                aktivera kontot.
              }
            }
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-1">
            <mat-form-field>
              <mat-label>E-post</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
            </mat-form-field>

            @if (mode() === 'verify') {
              <mat-form-field>
                <mat-label>Kod från e-post</mat-label>
                <input
                  matInput
                  formControlName="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                />
              </mat-form-field>
            } @else {
              <mat-form-field>
                <mat-label>Lösenord</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
                />
                @if (mode() === 'register') {
                  <mat-hint>Minst 8 tecken</mat-hint>
                }
              </mat-form-field>
            }

            <button mat-flat-button color="primary" class="!mt-3 !h-12" [disabled]="busy()">
              {{ buttonText() }}
            </button>
          </form>

          <div class="mt-4 text-center text-sm">
            @switch (mode()) {
              @case ('login') {
                Inget konto?
                <a class="cursor-pointer text-brand" (click)="setMode('register')">Skapa konto</a>
              }
              @case ('register') {
                Har du redan ett konto?
                <a class="cursor-pointer text-brand" (click)="setMode('login')">Logga in</a>
              }
              @case ('verify') {
                <a class="cursor-pointer text-brand" (click)="resend()">Skicka ny kod</a>
                ·
                <a class="cursor-pointer text-brand" (click)="setMode('login')">Tillbaka</a>
              }
            }
          </div>
        </div>
      </div>
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
    .auth-hero {
      background: linear-gradient(
        160deg,
        var(--mat-sys-primary),
        color-mix(in srgb, var(--mat-sys-primary) 55%, black)
      );
    }
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('login');
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    code: [''],
  });

  setMode(m: Mode) {
    this.mode.set(m);
    const c = this.form.controls;
    c.password.setValidators(
      m === 'login'
        ? [Validators.required]
        : m === 'register'
          ? [Validators.required, Validators.minLength(8)]
          : [],
    );
    c.code.setValidators(m === 'verify' ? [Validators.required] : []);
    c.code.reset();
    Object.values(c).forEach((x) => x.updateValueAndValidity());
  }

  title() {
    return { login: 'Välkommen tillbaka', register: 'Skapa konto', verify: 'Bekräfta e-post' }[
      this.mode()
    ];
  }

  buttonText() {
    return { login: 'Logga in', register: 'Skapa konto', verify: 'Aktivera konto' }[this.mode()];
  }

  resend() {
    this.auth.requestEmailOtp(this.form.controls.email.value).subscribe();
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { email, password, code } = this.form.getRawValue();
    this.busy.set(true);
    const done = () => this.busy.set(false);

    switch (this.mode()) {
      case 'login':
        return void this.auth.loginEmail(email, password).subscribe({
          next: () => this.router.navigateByUrl('/'),
          error: (e: ApiError) => {
            done();
            if (e.code === 'ACCOUNT_NOT_ACTIVE') {
              this.resend();
              this.setMode('verify');
            }
          },
        });
      case 'register':
        return void this.auth.registerEmail(email, password).subscribe({
          next: () => {
            done();
            this.setMode('verify');
          },
          error: done,
        });
      case 'verify':
        return void this.auth.verifyEmailOtp(email, code).subscribe({
          next: () => this.router.navigateByUrl('/'),
          error: done,
        });
    }
  }
}
