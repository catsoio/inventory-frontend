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
  template: `
    @if (visible()) {
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="value()"
        (change)="value.set($event.value)"
        aria-label="Produkt"
      >
        <mat-button-toggle value="all">Alla</mat-button-toggle>
        <mat-button-toggle value="axle">Axle</mat-button-toggle>
        <mat-button-toggle value="hall">Hall</mat-button-toggle>
      </mat-button-toggle-group>
    }
  `,
})
export class ProductFilter {
  private readonly billing = inject(Billing);
  readonly value = model<ProductScope>('all');
  readonly visible = computed(() => this.billing.allows('bilhandel'));
}
