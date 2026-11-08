import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ScreenApi } from '../../core/api/screen-api';
import { ApiError, ScreenStyle, ScreenView } from '../../core/models';
import { dayKey } from './screen-format';

/** Hur ofta skärmen frågar efter nytt. Orderna ändras några gånger i timmen, så en halv minut räcker. */
const POLL_MS = 30_000;
/** Utan svar så här länge säger skärmen att den inte har kontakt (och visar kvar det den vet). */
const STALE_MS = 2 * 60_000;
/** Textstorleken följer skärmens bredd, så samma sida är läsbar på 1080p och 4K. */
const ROOT_FONT = 'clamp(13px, 0.85vw, 34px)';
const STYLES: ScreenStyle[] = ['board', 'light', 'list', 'mechanics'];

/**
 * Skärmen i verkstadens hall (`/s/<nyckel>`): en stor display som bara visar orderna som finns i
 * huset. Ingen inloggning, ingenting att klicka på; nyckeln i länken är nyckeln. Utseendet är ägarens
 * val (`ScreenView.style`) och följer med svaret, så skärmen byter stil av sig själv; `?style=` i
 * adressen provar en annan utan att spara. Den ska kunna stå på i veckor: frågar om var halvminut,
 * behåller sista läget om nätet försvinner, hindrar skärmen från att somna och laddar om sig vid
 * midnatt så att nya versioner når den. Själva ritandet ligger i `styles/`.
 */
@Component({
  selector: 'app-workshop-screen',
  standalone: false,
  host: {
    class: 'block h-dvh cursor-none overflow-hidden bg-slate-950 text-slate-100 select-none',
  },
  template: `
    @if (gone()) {
      <main class="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <mat-icon class="!h-20 !w-20 !text-[80px] text-slate-500">link_off</mat-icon>
        <h1 class="text-4xl font-semibold">Länken gäller inte längre</h1>
        <p class="max-w-xl text-xl text-slate-400">
          Skärmen har stängts av eller fått en ny länk. Öppna Inställningar → Arbetsorder och offert
          och skriv in den nya adressen på skärmen.
        </p>
      </main>
    } @else if (view(); as v) {
      @switch (style()) {
        @case ('light') {
          <app-screen-light [view]="v" [now]="now()" [offline]="offline()" />
        }
        @case ('list') {
          <app-screen-list [view]="v" [now]="now()" [offline]="offline()" />
        }
        @case ('mechanics') {
          <app-screen-mechanics [view]="v" [now]="now()" [offline]="offline()" />
        }
        @default {
          <app-screen-board [view]="v" [now]="now()" [offline]="offline()" />
        }
      }
    } @else {
      <main class="flex h-full items-center justify-center text-3xl text-slate-500">
        Hämtar order …
      </main>
    }
  `,
})
export class WorkshopScreen implements OnInit, OnDestroy {
  private readonly api = inject(ScreenApi);
  private readonly route = inject(ActivatedRoute);
  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  private readonly preview = this.route.snapshot.queryParamMap.get('style') as ScreenStyle | null;
  private readonly destroyRef = inject(DestroyRef);

  readonly view = signal<ScreenView | null>(null);
  readonly gone = signal(false);
  readonly now = signal(Date.now());
  private readonly lastOk = signal<number | null>(null);
  private readonly bootDay = dayKey(new Date());

  readonly style = computed<ScreenStyle>(() =>
    this.preview && STYLES.includes(this.preview) ? this.preview : (this.view()?.style ?? 'board'),
  );
  readonly offline = computed(() => {
    const ok = this.lastOk();
    return ok !== null && this.now() - ok > STALE_MS;
  });

  private wakeLock: { release(): Promise<void> } | null = null;
  private readonly previousFont = document.documentElement.style.fontSize;

  ngOnInit() {
    document.documentElement.style.fontSize = ROOT_FONT;
    this.load();
    const timers = [
      setInterval(() => this.load(), POLL_MS),
      setInterval(() => this.now.set(Date.now()), 1000),
    ];
    this.destroyRef.onDestroy(() => timers.forEach(clearInterval));

    void this.keepAwake();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void this.keepAwake();
        this.load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  ngOnDestroy() {
    document.documentElement.style.fontSize = this.previousFont;
    void this.wakeLock?.release();
  }

  private load() {
    if (this.gone()) return;
    this.api.view(this.token).subscribe({
      next: (v) => {
        this.view.set(v);
        this.lastOk.set(Date.now());
        // Ny dag: ladda om, så att en ny version av appen når en skärm som aldrig stängs av.
        if (dayKey(new Date()) !== this.bootDay) location.reload();
      },
      error: (e: unknown) => {
        // Bara en ogiltig länk är slutgiltig; allt annat (nät, server) försöker vi om efter en halv minut.
        if ((e as ApiError).status === 404) this.gone.set(true);
      },
    });
  }

  /** Låter inte skärmen släcka sig. Stöds inte överallt; då får TV:ns egna inställningar sköta det. */
  private async keepAwake() {
    try {
      const wl = (
        navigator as unknown as {
          wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
        }
      ).wakeLock;
      if (wl) this.wakeLock = await wl.request('screen');
    } catch {
      // nekas t.ex. när batteriläget är på; inget att göra
    }
  }
}
