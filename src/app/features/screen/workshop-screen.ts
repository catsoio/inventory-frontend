import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ScreenApi } from '../../core/api/screen-api';
import { appLocale } from '../../core/i18n/locale';
import { ApiError, ScreenOrder, ScreenView } from '../../core/models';
import { carColorHex } from '../../shared/car-color';

/** Hur ofta skärmen frågar efter nytt. Orderna ändras några gånger i timmen, så en halv minut räcker. */
const POLL_MS = 30_000;
/** Utan svar så här länge säger skärmen att den inte har kontakt (och visar kvar det den vet). */
const STALE_MS = 2 * 60_000;
/** Textstorleken följer skärmens bredd, så samma sida är läsbar på 1080p och 4K. */
const ROOT_FONT = 'clamp(13px, 0.85vw, 34px)';

interface Column {
  status: ScreenOrder['status'];
  title: string;
  icon: string;
  accent: string;
}

const COLUMNS: Column[] = [
  { status: 'open', title: 'Ska startas', icon: 'schedule', accent: 'text-sky-300' },
  { status: 'in_progress', title: 'Pågår', icon: 'build', accent: 'text-emerald-300' },
  {
    status: 'waiting_parts',
    title: 'Väntar på del',
    icon: 'inventory_2',
    accent: 'text-amber-300',
  },
];

const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

/**
 * Skärmen i verkstadens hall (`/s/<nyckel>`): en stor display som bara visar orderna som finns i
 * huset, uppdelade på Ska startas, Pågår och Väntar på del. Ingen inloggning, ingenting att klicka på;
 * nyckeln i länken är nyckeln. Den ska kunna stå på i veckor: frågar om var halvminut, behåller sista
 * läget om nätet försvinner, hindrar skärmen från att somna, rullar långa kolumner själv och laddar om
 * sig vid midnatt så att nya versioner når den.
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
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between gap-6 px-8 pt-5 pb-4">
          <div class="min-w-0">
            <div class="truncate text-3xl font-semibold tracking-tight">{{ v.garageName }}</div>
            <div class="text-lg text-slate-400">
              {{ v.orders.length + v.hidden }} order i huset
              @if (lateCount() > 0) {
                <span class="ml-3 font-medium text-red-300">· {{ lateCount() }} försenade</span>
              }
            </div>
          </div>
          <div class="text-right">
            <div class="text-5xl leading-none font-semibold tabular-nums">{{ clock() }}</div>
            <div class="mt-1 text-lg text-slate-400 first-letter:uppercase">{{ date() }}</div>
          </div>
        </header>

        @if (offline()) {
          <div
            class="mx-8 mb-3 flex items-center gap-3 rounded-xl bg-red-950 px-5 py-3 text-xl text-red-100 ring-1 ring-red-500/50"
          >
            <mat-icon>wifi_off</mat-icon>
            Ingen kontakt. Visar läget klockan {{ time(v.at) }}.
          </div>
        }

        @if (v.orders.length === 0) {
          <main class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
            <mat-icon class="!h-24 !w-24 !text-[96px]">check_circle</mat-icon>
            <div class="text-4xl font-medium">Inga order just nu</div>
          </main>
        } @else {
          <main class="grid min-h-0 flex-1 grid-cols-3 gap-5 px-8 pb-6">
            @for (c of columns; track c.status) {
              <section
                class="flex min-h-0 flex-col rounded-3xl bg-slate-900/60 ring-1 ring-white/5"
              >
                <h2
                  class="flex items-center gap-3 px-5 pt-4 pb-3 text-2xl font-semibold"
                  [class]="c.accent"
                >
                  <mat-icon>{{ c.icon }}</mat-icon>
                  {{ c.title }}
                  <span
                    class="ml-auto rounded-full bg-white/10 px-3 py-0.5 text-xl text-slate-200 tabular-nums"
                    >{{ byStatus()[c.status].length }}</span
                  >
                </h2>
                <div #scroller class="min-h-0 flex-1 space-y-4 overflow-hidden px-4 pb-4">
                  @for (o of byStatus()[c.status]; track o.id) {
                    <article
                      class="rounded-2xl bg-slate-900 p-5 ring-1"
                      [class]="o.overdue ? 'ring-red-500/70' : 'ring-white/10'"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <span
                          class="inline-flex items-stretch overflow-hidden rounded-lg bg-white text-slate-900 ring-1 ring-slate-400"
                        >
                          <span class="flex w-9 items-center justify-center bg-[#003399]">
                            <app-sv-flag [width]="22" />
                          </span>
                          <span
                            class="px-4 py-1.5 text-4xl leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase"
                            >{{ plate(o.regNo) }}</span
                          >
                        </span>
                        <span class="text-xl text-slate-500 tabular-nums">{{ o.code }}</span>
                      </div>

                      @if (o.vehicle) {
                        <div class="mt-3 flex items-center gap-3 text-2xl text-slate-200">
                          <span
                            class="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-white/40"
                            [style.background]="color(o.vehicleColor)"
                          ></span>
                          <span class="truncate">{{ o.vehicle }}</span>
                        </div>
                      }

                      <div class="mt-3 flex flex-wrap gap-2 text-xl">
                        @if (o.mechanic) {
                          <span
                            class="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1"
                          >
                            <mat-icon class="!h-6 !w-6 !text-[24px]">person</mat-icon
                            >{{ o.mechanic }}
                          </span>
                        }
                        @if (o.place) {
                          <span
                            class="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1"
                          >
                            <mat-icon class="!h-6 !w-6 !text-[24px]">garage</mat-icon>{{ o.place }}
                          </span>
                        }
                        @if (o.dueAt) {
                          <span
                            class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium"
                            [class]="o.overdue ? 'bg-red-500/20 text-red-200' : 'bg-white/10'"
                          >
                            <mat-icon class="!h-6 !w-6 !text-[24px]">{{
                              o.overdue ? 'warning' : 'flag'
                            }}</mat-icon>
                            {{ o.overdue ? 'Försenad ' : 'Klar ' }}{{ due(o.dueAt) }}
                          </span>
                        }
                        @if (o.missingParts) {
                          <span
                            class="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-1 font-medium text-amber-200"
                          >
                            <mat-icon class="!h-6 !w-6 !text-[24px]">inventory_2</mat-icon>Del
                            saknas
                          </span>
                        }
                      </div>

                      @if (o.jobs.length) {
                        <ul class="mt-4 space-y-2">
                          @for (j of o.jobs; track j.id) {
                            <li>
                              <div class="text-2xl leading-snug font-medium">{{ j.title }}</div>
                              @if (j.instruction) {
                                <div class="text-xl leading-snug text-slate-400">
                                  {{ j.instruction }}
                                </div>
                              }
                            </li>
                          }
                        </ul>
                      }
                      @if (o.remarks) {
                        <div
                          class="mt-3 border-l-4 border-slate-600 pl-3 text-xl leading-snug text-slate-300"
                        >
                          {{ o.remarks }}
                        </div>
                      }

                      @if (o.progress.total > 0) {
                        <div class="mt-4 flex items-center gap-3">
                          <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              class="h-full rounded-full bg-emerald-400"
                              [style.width.%]="(o.progress.done / o.progress.total) * 100"
                            ></div>
                          </div>
                          <span class="text-lg text-slate-400 tabular-nums"
                            >{{ o.progress.done }}/{{ o.progress.total }}</span
                          >
                        </div>
                      }
                    </article>
                  }
                </div>
              </section>
            }
          </main>
          @if (v.hidden > 0) {
            <div class="pb-3 text-center text-lg text-slate-500">
              + {{ v.hidden }} order till visas inte
            </div>
          }
        }
      </div>
    } @else {
      <main class="flex h-full items-center justify-center text-3xl text-slate-500">
        Hämtar order …
      </main>
    }
  `,
})
export class WorkshopScreen implements OnInit, OnDestroy {
  private readonly api = inject(ScreenApi);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollers = viewChildren<ElementRef<HTMLElement>>('scroller');

  readonly columns = COLUMNS;
  readonly view = signal<ScreenView | null>(null);
  readonly gone = signal(false);
  private readonly lastOk = signal<number | null>(null);
  private readonly now = signal(Date.now());
  private readonly bootDay = dayKey(new Date());

  readonly byStatus = computed(() => {
    const out: Record<ScreenOrder['status'], ScreenOrder[]> = {
      open: [],
      in_progress: [],
      waiting_parts: [],
    };
    for (const o of this.view()?.orders ?? []) out[o.status].push(o);
    return out;
  });
  readonly lateCount = computed(() => (this.view()?.orders ?? []).filter((o) => o.overdue).length);
  readonly offline = computed(() => {
    const ok = this.lastOk();
    return ok !== null && this.now() - ok > STALE_MS;
  });

  readonly clock = computed(() =>
    new Date(this.now()).toLocaleTimeString(appLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm',
    }),
  );
  readonly date = computed(() =>
    new Date(this.now()).toLocaleDateString(appLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Stockholm',
    }),
  );

  private wakeLock: { release(): Promise<void> } | null = null;
  private readonly scrollState = new WeakMap<HTMLElement, { dir: 1 | -1; resumeAt: number }>();
  private readonly previousFont = document.documentElement.style.fontSize;

  ngOnInit() {
    document.documentElement.style.fontSize = ROOT_FONT;
    this.load();
    const timers = [
      setInterval(() => this.load(), POLL_MS),
      setInterval(() => this.now.set(Date.now()), 1000),
      setInterval(() => this.autoScroll(), 50),
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

  /** En kolumn med fler order än som ryms rullar ner, väntar, och rullar upp igen. */
  private autoScroll() {
    const now = Date.now();
    for (const ref of this.scrollers()) {
      const el = ref.nativeElement;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 2) {
        el.scrollTop = 0;
        continue;
      }
      const st = this.scrollState.get(el) ?? { dir: 1 as const, resumeAt: now + 6000 };
      if (now < st.resumeAt) {
        this.scrollState.set(el, st);
        continue;
      }
      el.scrollTop += st.dir * 1.2;
      if (st.dir === 1 && el.scrollTop >= max - 1) {
        this.scrollState.set(el, { dir: -1, resumeAt: now + 6000 });
      } else if (st.dir === -1 && el.scrollTop <= 1) {
        this.scrollState.set(el, { dir: 1, resumeAt: now + 6000 });
      } else {
        this.scrollState.set(el, st);
      }
    }
  }

  plate(regNo: string) {
    const v = regNo.toUpperCase().replace(/\s+/g, '');
    return v.length === 6 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
  }

  color(name: string | null) {
    return carColorHex(name);
  }

  time(iso: string) {
    return new Date(iso).toLocaleTimeString(appLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm',
    });
  }

  /** "15:30" idag, annars "fre 13 nov 15:30". */
  due(iso: string) {
    const d = new Date(iso);
    const t = this.time(iso);
    if (dayKey(d) === dayKey(new Date(this.now()))) return t;
    const day = d.toLocaleDateString(appLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Stockholm',
    });
    return `${day} ${t}`;
  }
}
