import { Component, Input } from '@angular/core';

export type ItemKind = 'tyre' | 'rim' | 'wheel' | 'other';

const META: Record<ItemKind, { label: string; tone: string }> = {
  tyre: { label: 'Däck', tone: 'bg-slate-100 text-slate-700' },
  rim: { label: 'Fälg', tone: 'bg-sky-100 text-sky-700' },
  wheel: { label: 'Komplett hjul', tone: 'bg-indigo-100 text-indigo-700' },
  other: { label: 'Övrigt', tone: 'bg-amber-100 text-amber-700' },
};

/** Liten ikon som visar direkt om en rad är däck, fälg, komplett hjul eller övrigt. */
@Component({
  selector: 'app-item-icon',
  standalone: false,
  host: { class: 'inline-flex align-middle' },
  template: `
    <span
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      [class]="meta.tone"
      [attr.title]="meta.label"
      [attr.aria-label]="meta.label"
    >
      @switch (kind) {
        @case ('tyre') {
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" stroke-width="4.5" />
            <circle cx="12" cy="12" r="3" stroke-width="1.5" />
          </svg>
        }
        @case ('rim') {
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" stroke-width="2" />
            <circle cx="12" cy="12" r="2" stroke-width="1.5" />
            <path
              stroke-width="2"
              stroke-linecap="round"
              d="M12 10V3.5M13.9 11.4l6.2-2M13.2 13.6l3.8 5.2M10.8 13.6L7 18.8M10.1 11.4l-6.2-2"
            />
          </svg>
        }
        @case ('wheel') {
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" stroke-width="2.5" />
            <circle cx="12" cy="12" r="6.5" stroke-width="1" />
            <path
              stroke-width="1.5"
              stroke-linecap="round"
              d="M12 10V6M13.9 11.4l3.8-1.2M13.2 13.6l2.3 3.2M10.8 13.6l-2.3 3.2M10.1 11.4l-3.8-1.2"
            />
          </svg>
        }
        @default {
          <mat-icon class="!h-5 !w-5 !text-xl">build</mat-icon>
        }
      }
    </span>
  `,
})
export class ItemIcon {
  @Input() kind: ItemKind = 'other';
  get meta() {
    return META[this.kind];
  }
}
