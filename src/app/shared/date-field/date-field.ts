import { Component, EventEmitter, Input, Optional, Output, Self } from '@angular/core';
import { ControlValueAccessor, FormControl, NgControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

const toDate = (ymd: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Datumfält med kalender. Formulärvärdet är en sträng "YYYY-MM-DD" (tom sträng = inget datum). */
@Component({
  selector: 'app-date-field',
  standalone: false,
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ label }}</mat-label>
      @if (icon) {
        <mat-icon matPrefix class="mr-2 text-gray-400">{{ icon }}</mat-icon>
      }
      <input
        matInput
        [matDatepicker]="picker"
        [formControl]="inner"
        [min]="minDate"
        [max]="maxDate"
        [errorStateMatcher]="matcher"
        placeholder="ÅÅÅÅ-MM-DD"
        (dateChange)="changed($event.value)"
        (blur)="onTouched()"
        (click)="picker.open()"
      />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker />
      @if (hint) {
        <mat-hint>{{ hint }}</mat-hint>
      }
      @if (error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class DateField implements ControlValueAccessor {
  @Input() label = '';
  @Input() icon = '';
  @Input() hint = '';
  @Input() error = '';
  @Input() set min(v: string | null | undefined) {
    this.minDate = toDate(v);
  }
  @Input() set max(v: string | null | undefined) {
    this.maxDate = toDate(v);
  }
  @Output() dateChange = new EventEmitter<string>();

  minDate: Date | null = null;
  maxDate: Date | null = null;
  readonly inner = new FormControl<Date | null>(null);
  readonly matcher: ErrorStateMatcher = {
    isErrorState: () => !!this.ngControl?.invalid && !!this.ngControl.touched,
  };

  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor(@Optional() @Self() private ngControl: NgControl | null) {
    if (ngControl) ngControl.valueAccessor = this;
  }

  changed(d: Date | null) {
    const v = d ? toYmd(d) : '';
    this.onChange(v);
    this.dateChange.emit(v);
  }

  writeValue(v: string | null) {
    this.inner.setValue(toDate(v), { emitEvent: false });
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
