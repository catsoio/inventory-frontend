import { Component, input } from '@angular/core';
import { plateOf } from './screen-format';

/** Registreringsskylten på skärmen: stor, med blå kant och flagga. Storleken följer skärmens textstorlek. */
@Component({
  selector: 'app-screen-plate',
  standalone: false,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex items-stretch overflow-hidden rounded-lg bg-white text-slate-900 ring-1 ring-slate-400"
    >
      <span
        class="flex items-center justify-center bg-[#003399]"
        [class]="size() === 'xl' ? 'w-12' : 'w-9'"
      >
        <app-sv-flag [width]="size() === 'xl' ? 30 : 22" />
      </span>
      <span
        class="leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase"
        [class]="
          size() === 'xl'
            ? 'px-5 py-2 text-5xl'
            : size() === 'sm'
              ? 'px-3 py-1 text-2xl'
              : 'px-4 py-1.5 text-4xl'
        "
        >{{ text() }}</span
      >
    </span>
  `,
})
export class ScreenPlate {
  readonly regNo = input.required<string>();
  readonly size = input<'sm' | 'md' | 'xl'>('md');
  text() {
    return plateOf(this.regNo());
  }
}
