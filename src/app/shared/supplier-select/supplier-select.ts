import { Component, DestroyRef, Input, Optional, Self, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormControl, NgControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { debounceTime, of, startWith, switchMap } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import { Supplier } from '../../core/models';
import { SupplierDialog } from '../supplier-dialog/supplier-dialog';

const NEW = '__new__';

/** Välj en leverantör ur registret. Värdet är leverantörens id (eller tomt tills någon är vald). */
@Component({
  selector: 'app-supplier-select',
  standalone: false,
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ label }}</mat-label>
      <mat-icon matPrefix class="mr-2 text-gray-400">local_shipping</mat-icon>
      <input
        matInput
        [formControl]="input"
        [matAutocomplete]="auto"
        autocomplete="off"
        placeholder="Sök namn, telefon eller LEV-nummer"
        (blur)="onTouched()"
      />
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="show"
        (optionSelected)="pick($event.option.value)"
      >
        @for (c of options(); track c.id) {
          <mat-option [value]="c">
            {{ c.name }}
            <span class="ml-2 text-xs text-gray-500">{{ c.code }} {{ c.phone }}</span>
          </mat-option>
        }
        <mat-option [value]="NEW" class="!font-medium !text-brand">+ Ny leverantör</mat-option>
      </mat-autocomplete>
      <mat-error>Välj en leverantör ur listan</mat-error>
    </mat-form-field>
  `,
})
export class SupplierSelect implements ControlValueAccessor {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  @Input() label = 'Leverantör';
  readonly NEW = NEW;
  readonly options = signal<Supplier[]>([]);
  readonly input = new FormControl<string | Supplier>('', { nonNullable: true });

  private onChange: (id: string | null) => void = () => {};
  onTouched: () => void = () => {};

  constructor(@Optional() @Self() ngControl: NgControl | null) {
    if (ngControl) ngControl.valueAccessor = this;
    this.input.valueChanges
      .pipe(
        startWith(this.input.value),
        debounceTime(150),
        switchMap((v) =>
          typeof v === 'string' ? this.api.suppliers({ q: v.trim(), limit: 15 }) : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => p && this.options.set(p.items));
    // Skriver man om fältet efter ett val är valet borta.
    this.input.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      if (typeof v === 'string') this.onChange(null);
    });
  }

  show = (c: string | Supplier | null) =>
    !c || c === NEW ? '' : typeof c === 'string' ? c : c.name;

  pick(value: Supplier | string) {
    if (value !== NEW) {
      this.onChange((value as Supplier).id);
      return;
    }
    this.input.setValue('');
    this.dialog
      .open<SupplierDialog, unknown, Supplier>(SupplierDialog, {
        data: {},
        width: '560px',
        maxWidth: '96vw',
        panelClass: 'dialog-sheet',
      })
      .afterClosed()
      .subscribe((c) => {
        if (!c) return;
        this.input.setValue(c, { emitEvent: false });
        this.onChange(c.id);
      });
  }

  writeValue(id: string | null) {
    if (!id) return this.input.setValue('', { emitEvent: false });
    this.api.supplier(id).subscribe((c) => this.input.setValue(c, { emitEvent: false }));
  }
  registerOnChange(fn: (id: string | null) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean) {
    if (disabled) this.input.disable({ emitEvent: false });
    else this.input.enable({ emitEvent: false });
  }
}
