import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Vyväljaren för Tidsbokning: samma knappar i kalendern och i listan. */
@Component({
  selector: 'app-booking-views',
  standalone: false,
  styles: `
    @media (max-width: 767px) {
      :host {
        flex: 1 1 100%;
      }
      mat-button-toggle-group {
        width: 100%;
      }
      mat-button-toggle {
        flex: 1 1 0;
        min-width: 0;
        font-size: 13px;
      }
    }
  `,
  template: `
    <mat-button-toggle-group
      hideSingleSelectionIndicator
      [value]="value"
      (change)="pick.emit($event.value)"
      aria-label="Vy"
    >
      @for (v of views; track v.id) {
        <mat-button-toggle [value]="v.id" [attr.aria-label]="v.label">
          <span>{{ v.label }}</span>
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
})
export class BookingViews {
  @Input() value = 'board';
  @Output() pick = new EventEmitter<string>();
  readonly views = [
    { id: 'board', label: 'Resurser' },
    { id: 'day', label: 'Dag' },
    { id: 'week', label: 'Vecka' },
    { id: 'month-grid', label: 'Månad' },
    { id: 'list', label: 'Lista' },
  ];
}
