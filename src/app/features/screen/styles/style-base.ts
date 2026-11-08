import { Directive, computed, input } from '@angular/core';
import { ScreenView } from '../../../core/models';
import { carColorHex } from '../../../shared/car-color';
import { byStatus, dateOf, dueOf, timeOf } from '../screen-format';

/** Det varje stil får av skärmen och kan räkna med; stilen bestämmer bara hur det ritas. */
@Directive()
export abstract class ScreenStyleBase {
  readonly view = input.required<ScreenView>();
  readonly now = input.required<number>();
  /** Skärmen har tappat kontakten och visar det senaste läget. */
  readonly offline = input(false);

  readonly orders = computed(() => this.view().orders);
  readonly total = computed(() => this.view().orders.length + this.view().hidden);
  readonly late = computed(() => this.view().orders.filter((o) => o.overdue).length);
  readonly grouped = computed(() => byStatus(this.view().orders));
  readonly clock = computed(() => timeOf(this.now()));
  readonly date = computed(() => dateOf(this.now()));

  readonly time = timeOf;
  readonly color = carColorHex;
  due(iso: string) {
    return dueOf(iso, this.now());
  }
}
