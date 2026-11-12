import { Component, Input, signal } from '@angular/core';

/** Så långt åt sidan (px) ett svep ska gå för att byta bild, och mer åt sidan än uppåt. */
const SWIPE_PX = 40;

/**
 * Bilderna på en bil, en i taget: pilar till vänster och höger, svep med finger eller mus, och
 * vänster/höger-pilarna på tangentbordet när bilden är markerad. Räknaren visar var man är. Går runt
 * i ändarna. Adresserna ska vara kompletta.
 */
@Component({
  selector: 'app-photo-gallery',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div
      class="group relative aspect-[4/3] touch-pan-y overflow-hidden bg-gray-100 outline-none select-none"
      tabindex="0"
      role="group"
      aria-roledescription="bildspel"
      [attr.aria-label]="
        urls.length ? 'Bild ' + (index() + 1) + ' av ' + urls.length : 'Inga bilder'
      "
      (keydown.arrowLeft)="step(-1)"
      (keydown.arrowRight)="step(1)"
      (pointerdown)="down($event)"
      (pointerup)="up($event)"
      (pointercancel)="from = null"
    >
      @if (urls.length) {
        <div
          class="flex h-full transition-transform duration-300 ease-out"
          [style.transform]="'translateX(' + -index() * 100 + '%)'"
        >
          @for (u of urls; track u; let i = $index) {
            <img
              [src]="u"
              alt=""
              draggable="false"
              [attr.loading]="i === 0 ? null : 'lazy'"
              class="h-full w-full shrink-0 object-cover"
            />
          }
        </div>
        @if (urls.length > 1) {
          <button
            type="button"
            aria-label="Föregående bild"
            class="absolute top-1/2 left-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-80"
            (pointerdown)="$event.stopPropagation()"
            (click)="step(-1)"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>
          <button
            type="button"
            aria-label="Nästa bild"
            class="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-80"
            (pointerdown)="$event.stopPropagation()"
            (click)="step(1)"
          >
            <mat-icon>chevron_right</mat-icon>
          </button>
          <span
            class="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
            >{{ index() + 1 }} / {{ urls.length }}</span
          >
        }
      } @else {
        <div class="grid h-full place-items-center text-gray-300">
          <mat-icon class="!h-14 !w-14 !text-6xl">directions_car</mat-icon>
        </div>
      }
    </div>
  `,
})
export class PhotoGallery {
  private list: string[] = [];
  readonly index = signal(0);
  /** Var ett svep började; null när inget pågår. */
  from: { x: number; y: number } | null = null;

  /** Byts bilens bilder börjar visningen om från den första. */
  @Input() set urls(v: string[] | null | undefined) {
    this.list = v ?? [];
    this.index.set(0);
  }
  get urls(): string[] {
    return this.list;
  }

  step(by: number) {
    const n = this.list.length;
    if (n < 2) return;
    this.index.update((i) => (i + by + n) % n);
  }

  down(e: PointerEvent) {
    this.from = { x: e.clientX, y: e.clientY };
  }

  up(e: PointerEvent) {
    const start = this.from;
    this.from = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1);
  }
}
