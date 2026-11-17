import { Component, input } from '@angular/core';

/**
 * En sektion på en översiktssida: en ljusgrå yta med rubrik som samlar flera kort, samma uttryck
 * som sektionskorten i sidomenyn (`nav-card`). Korten inuti är vita. Bara dator; mobil har inga
 * sektioner utan en enda kolumn.
 */
@Component({
  selector: 'app-section',
  standalone: false,
  host: { class: 'block rounded-[14px] bg-[#f6f7f9] p-3' },
  template: `
    <h2 class="mt-0.5 mb-2.5 px-1 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
      {{ title() }}
    </h2>
    <ng-content />
  `,
})
export class Section {
  readonly title = input.required<string>();
}
