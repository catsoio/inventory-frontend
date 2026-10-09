import { Component, Input } from '@angular/core';
import { StockLevel } from '../../core/models';

const STYLE: Record<StockLevel, { text: string; cls: string }> = {
  in_stock: { text: 'I lager', cls: 'bg-green-100 text-green-800' },
  low: { text: 'Lågt lager', cls: 'bg-amber-100 text-amber-800' },
  out: { text: 'Slut', cls: 'bg-red-100 text-red-800' },
};

@Component({
  selector: 'app-stock-badge',
  standalone: false,
  template: `<span
    class="rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap"
    [class]="s.cls"
    >{{ s.text }}</span
  >`,
})
export class StockBadge {
  @Input({ required: true }) level!: StockLevel;
  get s() {
    return STYLE[this.level] ?? STYLE.in_stock;
  }
}
