import { Component, input, output } from '@angular/core';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  /** Material-ikon före texten. Utan `label` blir knappen en ikonknapp (då krävs `title`). */
  icon?: string;
  title?: string;
}

/**
 * Val mellan några få alternativ där exakt ett gäller (Alla · Utkast · Bokförda, Tabell · Kort):
 * ett segmenterat val, aldrig en rad med runda chips. Samma höjd som sökrutan och knapparna i
 * verktygsraden (40 px, 44 px på mobil). Fler än fem alternativ, eller flera val på en gång,
 * hör hemma i `app-filter-button`.
 */
@Component({
  selector: 'app-segmented',
  standalone: false,
  host: {
    '[class]': "fill() ? 'block w-full' : 'inline-block max-w-full overflow-x-auto align-middle'",
  },
  styles: `
    :host {
      --mat-button-toggle-height: 44px;
      --mat-button-toggle-label-text-size: 14px;
    }
    @media (min-width: 768px) {
      :host {
        --mat-button-toggle-height: 40px;
      }
    }
  `,
  template: `
    <mat-button-toggle-group
      hideSingleSelectionIndicator
      [class.w-full]="fill()"
      [value]="value()"
      (change)="valueChange.emit($event.value)"
      [attr.aria-label]="label()"
    >
      @for (o of options(); track o.value) {
        <mat-button-toggle
          [value]="o.value"
          [class.flex-1]="fill()"
          [title]="o.title ?? ''"
          [attr.aria-label]="o.label ? null : (o.title ?? o.value)"
        >
          @if (o.icon) {
            <mat-icon [class.!mr-1.5]="!!o.label">{{ o.icon }}</mat-icon>
          }
          {{ o.label }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
})
export class Segmented {
  readonly options = input.required<SegmentOption[]>();
  readonly value = input<string | null>(null);
  readonly valueChange = output<string>();
  /** Vad valet gäller, för skärmläsare ("Status", "Betalning"). */
  readonly label = input('');
  /** Fyller hela bredden med lika breda knappar (i en filterpanel eller på mobil). */
  readonly fill = input(false);
}
