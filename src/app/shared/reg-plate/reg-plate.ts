import { Component, Input } from '@angular/core';

/** Liten svensk flagga (blå med gult kors). */
@Component({
  selector: 'app-sv-flag',
  standalone: false,
  host: { class: 'inline-flex align-middle' },
  template: `
    <svg
      viewBox="0 0 16 10"
      [attr.width]="width"
      [attr.height]="(width * 10) / 16"
      aria-label="Sverige"
    >
      <rect width="16" height="10" fill="#006AA7" />
      <rect x="5" width="2" height="10" fill="#FECC02" />
      <rect y="4" width="16" height="2" fill="#FECC02" />
    </svg>
  `,
})
export class SvFlag {
  @Input() width = 16;
}

/** Registreringsskylt med blå kant till vänster och flagga, så att regnr känns igen direkt. */
@Component({
  selector: 'app-reg-plate',
  standalone: false,
  host: { class: 'inline-flex align-middle' },
  template: `
    <span
      class="inline-flex items-stretch overflow-hidden rounded-md bg-white text-gray-900 shadow-sm ring-1 ring-gray-400"
      [class]="size === 'lg' ? 'h-11' : size === 'sm' ? 'h-6' : 'h-8'"
    >
      <span class="flex w-5 items-center justify-center bg-[#003399]" [class.w-7]="size === 'lg'">
        <app-sv-flag [width]="size === 'lg' ? 18 : 12" />
      </span>
      <span
        class="flex items-center px-2 font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
        [class]="size === 'lg' ? 'px-3 text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm'"
        >{{ text }}</span
      >
    </span>
  `,
})
export class RegPlate {
  @Input() value: string | null | undefined = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  /** ABC123 -> "ABC 123" (nya och gamla svenska nummer har 3 + 3 tecken). */
  get text() {
    const v = (this.value ?? '').toUpperCase().replace(/\s+/g, '');
    return v.length === 6 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
  }
}
