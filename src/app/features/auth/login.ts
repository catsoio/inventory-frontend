import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth } from '../../core/auth/auth';

type Mode = 'email' | 'phone' | 'otp' | 'register';

@Component({
  selector: 'app-login',
  standalone: false,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <mat-card class="w-full max-w-md p-6">
        <h1 class="mb-4 text-2xl font-semibold">Däcklager – logga in</h1>
        <mat-button-toggle-group
          [value]="mode()"
          (change)="setMode($event.value)"
          class="mb-4 w-full"
        >
          <mat-button-toggle value="email">E-post</mat-button-toggle>
          <mat-button-toggle value="phone">Telefon</mat-button-toggle>
          <mat-button-toggle value="otp">Engångskod</mat-button-toggle>
          <mat-button-toggle value="register">Nytt konto</mat-button-toggle>
        </mat-button-toggle-group>

        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-2">
          @if (mode() === 'phone') {
            <mat-form-field
              ><mat-label>Telefonnummer</mat-label>
              <input matInput formControlName="phone" inputmode="tel" autocomplete="tel"
            /></mat-form-field>
          } @else {
            <mat-form-field
              ><mat-label>E-post</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email"
            /></mat-form-field>
          }
          @if (mode() === 'otp') {
            @if (otpSent()) {
              <mat-form-field
                ><mat-label>Kod</mat-label>
                <input
                  matInput
                  formControlName="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
              /></mat-form-field>
            }
          } @else {
            <mat-form-field
              ><mat-label>Lösenord</mat-label>
              <input
                matInput
                type="password"
                formControlName="password"
                autocomplete="current-password"
            /></mat-form-field>
          }
          <button mat-flat-button color="primary" class="!h-12" [disabled]="form.invalid || busy()">
            {{ buttonText() }}
          </button>
        </form>
      </mat-card>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly mode = signal<Mode>('email');
  readonly otpSent = signal(false);
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
    code: [''],
  });

  setMode(m: Mode) {
    this.mode.set(m);
    this.otpSent.set(false);
    const c = this.form.controls;
    c.email.setValidators(m === 'phone' ? [] : [Validators.required, Validators.email]);
    c.phone.setValidators(m === 'phone' ? [Validators.required] : []);
    c.password.setValidators(m === 'otp' ? [] : [Validators.required, Validators.minLength(8)]);
    c.code.setValidators([]);
    Object.values(c).forEach((x) => x.updateValueAndValidity());
  }

  buttonText() {
    const m = this.mode();
    return m === 'register'
      ? 'Skapa konto'
      : m === 'otp'
        ? this.otpSent()
          ? 'Verifiera'
          : 'Skicka kod'
        : 'Logga in';
  }

  submit() {
    const { email, phone, password, code } = this.form.getRawValue();
    this.busy.set(true);
    const done = { error: () => this.busy.set(false) };
    const loggedIn = { next: () => this.router.navigateByUrl('/'), ...done };

    switch (this.mode()) {
      case 'email':
        return void this.auth.loginEmail(email, password).subscribe(loggedIn);
      case 'phone':
        return void this.auth.loginPhone(phone, password).subscribe(loggedIn);
      case 'register':
        return void this.auth.registerEmail(email, password).subscribe({
          next: () => {
            this.busy.set(false);
            this.snack.open('Konto skapat. Verifiera med engångskod för att aktivera.', 'OK', {
              duration: 8000,
            });
            this.setMode('otp');
          },
          ...done,
        });
      case 'otp':
        if (!this.otpSent()) {
          return void this.auth.requestEmailOtp(email).subscribe({
            next: () => {
              this.busy.set(false);
              this.otpSent.set(true);
              this.form.controls.code.setValidators([Validators.required]);
              this.form.controls.code.updateValueAndValidity();
            },
            ...done,
          });
        }
        return void this.auth.verifyEmailOtp(email, code).subscribe(loggedIn);
    }
  }
}
