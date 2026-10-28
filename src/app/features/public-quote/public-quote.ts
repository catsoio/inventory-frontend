import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QuoteApi } from '../../core/api/quote-api';
import { appLocale } from '../../core/i18n/locale';
import { QuotePublic } from '../../core/models';

/**
 * Kundens sida för ett kostnadsförslag (`/q/<nyckel>`): ingen inloggning, nyckeln i länken är
 * nyckeln. Visar förslaget som det lämnades, utan timmar och interna uppgifter, och låter
 * kunden godkänna eller avböja. Byggd för mobilen, eftersom länken oftast kommer i ett SMS.
 */
@Component({
  selector: 'app-public-quote',
  standalone: false,
  host: { class: 'block min-h-dvh bg-gray-50 pb-28 text-gray-800 print:bg-white print:pb-0' },
  template: `
    @if (error()) {
      <main
        class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center"
      >
        <mat-icon class="!h-14 !w-14 !text-[56px] text-gray-400">link_off</mat-icon>
        <h1 class="mt-4 text-xl font-semibold">Länken gäller inte längre</h1>
        <p class="mt-2 text-gray-600">
          Förslaget kan ha ändrats eller dragits tillbaka. Hör av dig till verkstaden så får du en
          ny länk.
        </p>
      </main>
    } @else if (q(); as p) {
      <header class="bg-brand text-white print:bg-white print:text-gray-900">
        <div class="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div class="min-w-0">
            <div class="truncate text-lg font-semibold">{{ p.seller.name }}</div>
            @if (p.seller.city) {
              <div class="truncate text-sm opacity-80">
                {{ p.seller.address }}{{ p.seller.address ? ', ' : '' }}{{ p.seller.city }}
              </div>
            }
          </div>
          @if (p.seller.phone) {
            <a
              class="flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium print:hidden"
              [href]="'tel:' + p.seller.phone"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">call</mat-icon> Ring
            </a>
          }
        </div>
      </header>

      <main class="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <section class="rounded-2xl bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold">Kostnadsförslag {{ p.code }}</h1>
            <app-pill [tone]="stateTone()">{{ stateLabel() }}</app-pill>
          </div>
          <p class="mt-1 text-sm text-gray-600">
            Till {{ p.customerName }}
            @if (p.givenAt) {
              · {{ day(p.givenAt) }}
            }
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <app-reg-plate [value]="p.regNo" size="lg" />
            @if (p.vehicle) {
              <span class="text-gray-700">{{ p.vehicle }}</span>
            }
          </div>
          @if (p.remarks) {
            <div class="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
              <div class="text-xs font-medium text-gray-500 uppercase">Det här gäller</div>
              {{ p.remarks }}
            </div>
          }
        </section>

        @if (p.state === 'approved' || p.state === 'declined') {
          <section
            class="rounded-2xl p-5"
            [class]="p.state === 'approved' ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-100'"
          >
            <div class="flex items-center gap-2 text-lg font-semibold">
              <mat-icon>{{ p.state === 'approved' ? 'check_circle' : 'cancel' }}</mat-icon>
              {{ p.state === 'approved' ? 'Du har godkänt förslaget' : 'Du har avböjt förslaget' }}
            </div>
            <p class="mt-1 text-sm">
              @if (p.answer) {
                Svaret registrerades {{ day(p.answer.at) }}.
              }
              {{
                p.state === 'approved'
                  ? p.seller.name + ' hör av sig när det är dags.'
                  : 'Hör av dig till ' + p.seller.name + ' om du ändrar dig.'
              }}
            </p>
          </section>
        } @else if (p.state === 'expired') {
          <section class="rounded-2xl bg-gray-100 p-5">
            <div class="flex items-center gap-2 text-lg font-semibold">
              <mat-icon>schedule</mat-icon> Förslaget har gått ut
            </div>
            <p class="mt-1 text-sm text-gray-700">
              Hör av dig till {{ p.seller.name }} om du vill ha ett nytt.
            </p>
          </section>
        }

        @if (p.state === 'open' && daysLeft() !== null) {
          <p class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Förslaget gäller till <b>{{ day(p.validUntil!) }}</b
            >{{ daysLeft()! <= 7 ? ' (' + daysLeft() + ' dagar kvar)' : '' }}.
          </p>
        }

        <section class="rounded-2xl bg-white shadow-sm">
          <h2 class="px-5 pt-5 text-base font-semibold">Vad som ingår</h2>
          @for (j of p.jobs; track j.id) {
            <div class="border-b border-gray-100 px-5 py-4 last:border-b-0">
              <div class="flex items-baseline justify-between gap-4">
                <h3 class="font-medium">{{ j.title }}</h3>
                <span class="shrink-0 font-semibold tabular-nums">{{ j.total | kr }}</span>
              </div>
              @if (j.fixedPrice) {
                <p class="mt-1 text-sm text-gray-500">Fast pris för hela jobbet.</p>
              }
              @for (r of j.rows; track r.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: r }" />
              }
            </div>
          }
          @if (p.otherRows.length) {
            <div class="border-b border-gray-100 px-5 py-4 last:border-b-0">
              @if (p.jobs.length) {
                <h3 class="font-medium">Övrigt</h3>
              }
              @for (r of p.otherRows; track r.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: r }" />
              }
            </div>
          }

          <div class="space-y-1 rounded-b-2xl bg-gray-50 px-5 py-4 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Summa exkl. moms</span>
              <span class="tabular-nums">{{ p.totals.net | kr }}</span>
            </div>
            @for (b of p.totals.byRate; track b.rate) {
              <div class="flex justify-between">
                <span class="text-gray-600">Moms {{ b.rate }} %</span>
                <span class="tabular-nums">{{ b.vat | kr }}</span>
              </div>
            }
            @if (p.totals.rounding) {
              <div class="flex justify-between">
                <span class="text-gray-600">Öresutjämning</span>
                <span class="tabular-nums">{{ p.totals.rounding | kr }}</span>
              </div>
            }
            <div class="flex items-baseline justify-between border-t border-gray-200 pt-3">
              <span class="text-base font-semibold">Att betala</span>
              <span class="text-2xl font-semibold tabular-nums">{{ p.totals.total | kr }}</span>
            </div>
            <p class="text-xs text-gray-500">Priset är inklusive moms.</p>
          </div>
        </section>

        <p class="px-1 text-sm text-gray-600">{{ p.terms }}</p>

        @if (choice(); as c) {
          <section class="rounded-2xl bg-white p-5 shadow-sm print:hidden">
            <h2 class="text-base font-semibold">
              {{ c === 'approved' ? 'Godkänn förslaget' : 'Avböj förslaget' }}
            </h2>
            <p class="mt-1 text-sm text-gray-600">
              {{
                c === 'approved'
                  ? 'Du godkänner ' + (p.totals.total | kr) + ' inklusive moms.'
                  : 'Verkstaden får veta att du tackar nej.'
              }}
            </p>
            <mat-form-field class="mt-4 block w-full" subscriptSizing="dynamic">
              <mat-label>Ditt namn (valfritt)</mat-label>
              <input matInput [value]="name()" (input)="name.set($any($event.target).value)" />
            </mat-form-field>
            <mat-form-field class="mt-3 block w-full" subscriptSizing="dynamic">
              <mat-label>Meddelande till verkstaden (valfritt)</mat-label>
              <textarea
                matInput
                rows="2"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
              ></textarea>
            </mat-form-field>
            <div class="mt-4 flex gap-2">
              <button mat-button type="button" [disabled]="busy()" (click)="choice.set(null)">
                Tillbaka
              </button>
              <button
                mat-flat-button
                color="primary"
                class="!h-12 flex-1"
                type="button"
                [disabled]="busy()"
                (click)="submit(c)"
              >
                {{ c === 'approved' ? 'Ja, godkänn' : 'Ja, avböj' }}
              </button>
            </div>
          </section>
        }

        <footer class="px-1 pt-2 text-center text-xs text-gray-500">
          {{ p.seller.name }}
          @if (p.seller.orgNo) {
            · Org.nr {{ p.seller.orgNo }}
          }
          @if (p.seller.email) {
            · <a class="underline" [href]="'mailto:' + p.seller.email">{{ p.seller.email }}</a>
          }
          <div class="mt-2 print:hidden">
            <button mat-button type="button" (click)="print()">
              <mat-icon>print</mat-icon> Skriv ut
            </button>
          </div>
        </footer>
      </main>

      @if (p.state === 'open' && !choice()) {
        <div
          class="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur print:hidden"
        >
          <div class="mx-auto flex max-w-2xl gap-2">
            <button mat-stroked-button type="button" class="!h-12" (click)="choice.set('declined')">
              Avböj
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="!h-12 flex-1"
              (click)="choice.set('approved')"
            >
              <mat-icon>check</mat-icon> Godkänn {{ p.totals.total | kr }}
            </button>
          </div>
        </div>
      }
    } @else {
      <div class="grid min-h-dvh place-items-center">
        <mat-progress-bar mode="indeterminate" class="!w-40" />
      </div>
    }

    <ng-template #row let-r>
      <div class="mt-2 flex items-baseline justify-between gap-4 text-sm">
        <span class="min-w-0 text-gray-700">
          {{ r.description }}
          @if (r.type === 'part' && r.quantity !== 1) {
            <span class="text-gray-500"> × {{ qty(r.quantity) }}</span>
          }
          @if (r.discountPercent) {
            <span class="text-gray-500"> · rabatt {{ r.discountPercent }} %</span>
          }
        </span>
        @if (r.amount !== null) {
          <span class="shrink-0 tabular-nums text-gray-700">{{ r.amount | kr }}</span>
        }
      </div>
    </ng-template>
  `,
})
export class PublicQuote implements OnInit {
  private readonly api = inject(QuoteApi);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly q = signal<QuotePublic | null>(null);
  readonly error = signal(false);
  readonly busy = signal(false);
  readonly choice = signal<'approved' | 'declined' | null>(null);
  readonly name = signal('');
  readonly note = signal('');

  readonly stateLabel = computed(
    () =>
      ({
        open: 'Väntar på ditt svar',
        approved: 'Godkänt',
        declined: 'Avböjt',
        expired: 'Utgånget',
      })[this.q()?.state ?? 'open'],
  );
  readonly stateTone = computed(
    () =>
      ({ open: 'amber', approved: 'green', declined: 'gray', expired: 'gray' })[
        this.q()?.state ?? 'open'
      ] as 'amber' | 'green' | 'gray',
  );
  readonly daysLeft = computed(() => {
    const v = this.q()?.validUntil;
    if (!v) return null;
    return Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000));
  });

  ngOnInit() {
    this.api.publicView(this.token).subscribe({
      next: (p) => this.q.set(p),
      error: () => this.error.set(true),
    });
  }

  submit(status: 'approved' | 'declined') {
    this.busy.set(true);
    this.api
      .publicAnswer(this.token, {
        status,
        name: this.name().trim() || undefined,
        note: this.note().trim() || undefined,
      })
      .subscribe({
        next: (p) => {
          this.busy.set(false);
          this.choice.set(null);
          this.q.set(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: () => {
          this.busy.set(false);
          // Någon hann före (eller förslaget gick ut): visa läget som det är nu.
          this.api.publicView(this.token).subscribe({
            next: (p) => {
              this.choice.set(null);
              this.q.set(p);
            },
            error: () => this.error.set(true),
          });
        },
      });
  }

  day(iso: string) {
    return new Date(iso).toLocaleDateString(appLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  qty(n: number) {
    return n.toLocaleString(appLocale(), { maximumFractionDigits: 2 });
  }

  print() {
    window.print();
  }
}
