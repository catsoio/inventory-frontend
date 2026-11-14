import { Component, computed, inject, model } from '@angular/core';
import { Billing } from '../../core/billing/billing';
import type { ProductScope } from '../../core/layout/products';

/**
 * Val av produkt i en lista som gäller hela bolaget (fakturor): Alla, Axle eller Hall. Visas bara
 * när garaget har bilhandel; annars finns bara verkstaden och inget val behövs.
 */
@Component({
  selector: 'app-product-filter',
  standalone: false,
  host: { class: 'contents' },
  template: `
    @if (visible()) {
      <app-segmented
        label="Produkt"
        [options]="options"
        [value]="value()"
        (valueChange)="value.set($any($event))"
      />
    }
  `,
})
export class ProductFilter {
  readonly options = [
    { value: 'all', label: 'Alla' },
    { value: 'axle', label: 'Verkstad' },
    { value: 'hall', label: 'Bilhandel' },
  ];
  private readonly billing = inject(Billing);
  readonly value = model<ProductScope>('all');
  readonly visible = computed(() => this.billing.allows('bilhandel'));
}
