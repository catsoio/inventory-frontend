import { Component, Input, inject } from '@angular/core';
import { CatalogHit, SEASON_LABELS } from '../../core/models';
import { Pricing } from '../../core/pricing';

/**
 * En träff i grossistens katalog som en rad: vad det är, om verkstaden redan har artikeln, vad den
 * kostar (inkl. moms, som på fakturan) och vad som finns i lager hos grossisten.
 */
@Component({
  selector: 'app-catalog-hit',
  standalone: false,
  host: { class: 'block' },
  template: `
    <span class="flex min-w-0 items-center gap-3 md:flex-1">
      <app-item-icon [kind]="hit.kind === 'tyre' ? 'tyre' : hit.kind === 'rim' ? 'rim' : 'other'" />
      <span class="min-w-0">
        <span class="block font-medium break-words md:truncate">{{ title() }}</span>
        <span class="block text-sm break-words text-gray-500 md:truncate">{{ detail() }}</span>
      </span>
    </span>
    @if (!hit.fromCatalog) {
      <span class="hidden shrink-0 flex-col items-end text-sm md:flex">
        <span class="font-medium tabular-nums">
          {{ hit.costFinal ? '' : 'ca ' }}{{ pricing.costIncl(hit.costExVat) | kr }}
        </span>
        @if (hit.available > 0) {
          <span class="text-green-700">{{ hit.available }} hos grossist</span>
        } @else {
          <span class="text-amber-700">
            {{ hit.nextDelivery ? 'Kommer ' + hit.nextDelivery : 'Slut hos grossist' }}
          </span>
        }
      </span>
    }
  `,
})
export class CatalogHitRow {
  @Input({ required: true }) hit!: CatalogHit;
  readonly pricing = inject(Pricing);

  title() {
    const h = this.hit;
    return h.tyre
      ? `${[h.brand, h.model].filter(Boolean).join(' ')} ${h.tyre.width}/${h.tyre.profile} R${h.tyre.rimDiameter}${
          h.tyre.loadIndex || h.tyre.speedIndex
            ? ' ' + (h.tyre.loadIndex ?? '') + (h.tyre.speedIndex ?? '')
            : ''
        }`
      : h.title;
  }

  detail() {
    const h = this.hit;
    const bits: string[] = [];
    if (h.tyre) {
      bits.push(SEASON_LABELS[h.tyre.season]);
      if (h.tyre.studded) bits.push('Dubbat');
      if (h.tyre.runFlat) bits.push('Runflat');
    }
    if (h.partNo) bits.push(h.partNo);
    if (h.articleId) bits.push(`Du har den${h.inStock != null ? ` (${h.inStock} st)` : ''}`);
    return bits.join(' · ');
  }
}
