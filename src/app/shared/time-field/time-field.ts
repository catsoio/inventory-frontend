import { Component, Input, Optional, Self } from '@angular/core';
import { ControlValueAccessor, FormControl, NgControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** "930" -> "09:30", "14" -> "14:00", "9" -> "09:00". Null om det inte är en tid. */
export const parseTime = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let h: number;
  let m: number;
  if (digits.length <= 2) {
    h = +digits;
    m = 0;
  } else {
    h = +digits.slice(0, digits.length - 2);
    m = +digits.slice(-2);
  }
  return h > 23 || m > 59 ? null : `${pad(h)}:${pad(m)}`;
};

/**
 * Klockslag som vanligt textfält med sifferknappsats. Webbläsarens egen tidsväljare
 * (`type="time"`) öppnar inget tangentbord på äldre Android. Man skriver "1430" och får 14:30;
 * pil upp/ned och plus/minus-knapparna stegar kvart för kvart. Formulärvärdet är "HH:MM".
 */
@Component({
  selector: 'app-time-field',
  standalone: false,
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ label }}</mat-label>
      <input
        matInput
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="5"
        placeholder="TT:MM"
        [formControl]="inner"
        [errorStateMatcher]="matcher"
        (input)="typed()"
        (blur)="commit()"
        (keydown.arrowup)="step(15); $event.preventDefault()"
        (keydown.arrowdown)="step(-15); $event.preventDefault()"
        (focus)="$any($event.target).select()"
      />
      <button
        matIconSuffix
        type="button"
        mat-icon-button
        class="time-step"
        tabindex="-1"
        aria-label="Kvart tidigare"
        (click)="step(-15)"
      >
        <mat-icon>remove</mat-icon>
      </button>
      <button
        matIconSuffix
        type="button"
        mat-icon-button
        class="time-step"
        tabindex="-1"
        aria-label="Kvart senare"
        (click)="step(15)"
      >
        <mat-icon>add</mat-icon>
      </button>
      @if (error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class TimeField implements ControlValueAccessor {
  @Input() label = '';
  /** Visas när ngControl är ogiltig, t.ex. "Måste vara efter starttiden". */
  @Input() error = '';

  readonly inner = new FormControl('', { nonNullable: true });
  readonly matcher: ErrorStateMatcher = {
    isErrorState: () => !!this.ngControl?.invalid && !!this.ngControl.touched,
  };

  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor(@Optional() @Self() private ngControl: NgControl | null) {
    if (ngControl) ngControl.valueAccessor = this;
  }

  /** Under skrivning: bara siffror, och kolon efter timmarna. Värdet ges vidare när det är en hel tid. */
  typed() {
    const digits = this.inner.value.replace(/\D/g, '').slice(0, 4);
    const shown =
      digits.length > 2 ? `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}` : digits;
    if (shown !== this.inner.value) this.inner.setValue(shown, { emitEvent: false });
    const t = digits.length >= 3 ? parseTime(digits) : null;
    this.onChange(t ?? '');
  }

  /** När man lämnar fältet: "9" blir 09:00. Går det inte att tolka töms värdet så att formuläret ger fel. */
  commit() {
    const t = parseTime(this.inner.value);
    this.inner.setValue(t ?? this.inner.value, { emitEvent: false });
    this.onChange(t ?? '');
    this.onTouched();
  }

  step(minutes: number) {
    const cur = parseTime(this.inner.value) ?? '00:00';
    const [h, m] = cur.split(':').map(Number);
    const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
    const next = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
    this.inner.setValue(next, { emitEvent: false });
    this.onChange(next);
  }

  writeValue(v: string | null) {
    this.inner.setValue(v ?? '', { emitEvent: false });
  }
  registerOnChange(fn: (v: string) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean) {
    if (disabled) this.inner.disable({ emitEvent: false });
    else this.inner.enable({ emitEvent: false });
  }
}
