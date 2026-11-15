import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { appLocale } from '../../core/i18n/locale';
import {
  TOW_KIND_LABELS,
  TOW_STATUS_LABELS,
  TowApi,
  TowJob,
  TowStatus,
} from '../../core/api/tow-api';
import type { PillTone } from '../../shared/pill/pill';

const time = (iso: string) =>
  new Date(iso).toLocaleString(appLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hem för Bärgning: vad som kommit in och inte är gjort, med knappar för att flytta ett uppdrag
 * ett steg, och vad som blivit klart sist. Enkel med flit: det som mer behövs här tar vi reda
 * på av en verkstad som bärgar.
 */
@Component({
  selector: 'app-tow-home',
  standalone: false,
  host: { class: 'block' },
  template: `
    <a
      mat-flat-button
      color="primary"
      routerLink="/towing/new"
      class="mb-4 !flex w-full md:!hidden"
    >
      <mat-icon>add</mat-icon> Nytt uppdrag
    </a>

    <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">
      <app-stat
        label="Nya"
        [value]="loaded() ? count('new') : '–'"
        hint="väntar på någon"
        [status]="count('new') ? 'warn' : 'none'"
        link="/towing"
      />
      <app-stat
        label="På väg"
        [value]="loaded() ? count('on_the_way') : '–'"
        hint="pågående uppdrag"
        link="/towing"
      />
      <div class="col-span-2 xl:col-span-1">
        <app-stat
          label="Klara senaste 7 dagarna"
          [value]="loaded() ? doneRecently() : '–'"
          hint="uppdrag"
          link="/towing"
        />
      </div>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <app-panel
        class="xl:col-span-2"
        title="Pågående uppdrag"
        subtitle="Nya samtal först. Knappen flyttar uppdraget ett steg."
        icon="local_shipping"
        [empty]="loaded() && !active().length"
        emptyText="Inga pågående uppdrag."
      >
        <a actions mat-button routerLink="/towing/new" class="max-md:!hidden">
          <mat-icon>add</mat-icon> Nytt uppdrag
        </a>
        <ul class="divide-y divide-gray-100">
          @for (j of active(); track j.id) {
            <li class="flex items-center gap-3 py-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                (click)="openJob(j)"
              >
                @if (j.regNo) {
                  <app-reg-plate [value]="j.regNo" size="sm" />
                }
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium"
                    >{{ j.customerName }}
                    <span class="font-normal text-gray-500">· {{ kinds[j.kind] }}</span></span
                  >
                  <span class="block truncate text-xs text-gray-500">{{ route(j) }}</span>
                  <span class="block text-xs text-gray-400"
                    >{{ j.code }} · {{ time(j.requestedAt) }}</span
                  >
                </span>
              </button>
              <app-pill [tone]="tones[j.status]">{{ statuses[j.status] }}</app-pill>
              @if (j.phone) {
                <a
                  mat-icon-button
                  [href]="'tel:' + j.phone"
                  [attr.aria-label]="'Ring ' + j.customerName"
                  matTooltip="Ring"
                >
                  <mat-icon>call</mat-icon>
                </a>
              }
              <button
                mat-stroked-button
                class="!h-9 shrink-0"
                type="button"
                [disabled]="busy()"
                (click)="advance(j)"
              >
                {{ j.status === 'new' ? 'På väg' : 'Klar' }}
              </button>
            </li>
          }
        </ul>
      </app-panel>

      <app-panel
        title="Senast klara"
        icon="task_alt"
        [empty]="loaded() && !done().length"
        emptyText="Inga klara uppdrag än."
      >
        <a actions mat-button routerLink="/towing">Alla uppdrag</a>
        <ul class="divide-y divide-gray-100">
          @for (j of done(); track j.id) {
            <li>
              <button
                type="button"
                class="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-gray-50"
                (click)="openJob(j)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ j.customerName }}</span>
                  <span class="block truncate text-xs text-gray-500"
                    >{{ j.code }} · {{ j.regNo || kinds[j.kind] }}</span
                  >
                </span>
                <span class="shrink-0 text-xs tabular-nums text-gray-500">{{
                  time(j.closedAt ?? j.requestedAt)
                }}</span>
              </button>
            </li>
          }
        </ul>
      </app-panel>
    </div>
  `,
})
export class TowHome {
  private readonly api = inject(TowApi);
  private readonly router = inject(Router);
  readonly kinds = TOW_KIND_LABELS;
  readonly statuses = TOW_STATUS_LABELS;
  readonly time = time;
  readonly tones: Record<TowStatus, PillTone> = {
    new: 'amber',
    on_the_way: 'blue',
    done: 'green',
    cancelled: 'gray',
  };

  readonly active = signal<TowJob[]>([]);
  readonly done = signal<TowJob[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal(false);

  readonly count = (s: TowStatus) => this.active().filter((j) => j.status === s).length;
  readonly doneRecently = computed(() => {
    const from = Date.now() - WEEK_MS;
    return this.done().filter((j) => new Date(j.closedAt ?? j.requestedAt).getTime() >= from)
      .length;
  });

  constructor() {
    this.load();
  }

  private load() {
    forkJoin({
      open: this.api.list({ status: 'open', limit: 50 }).pipe(catchError(() => of(null))),
      done: this.api.list({ status: 'done', limit: 20 }).pipe(catchError(() => of(null))),
    }).subscribe(({ open, done }) => {
      // De nya överst, därefter de som är på väg; äldst först så att ingen samtal glöms.
      this.active.set(
        [...(open?.items ?? [])].sort(
          (a, b) => Number(b.status === 'new') - Number(a.status === 'new') || a.number - b.number,
        ),
      );
      this.done.set(done?.items ?? []);
      this.loaded.set(true);
    });
  }

  route(j: TowJob): string {
    return [j.pickupAddress, j.destination].filter(Boolean).join(' → ') || 'Adress saknas';
  }

  openJob(j: TowJob) {
    void this.router.navigate(['/towing', j.id]);
  }

  /** Nytt blir På väg, På väg blir Klar. */
  advance(j: TowJob) {
    this.busy.set(true);
    this.api.update(j.id, { status: j.status === 'new' ? 'on_the_way' : 'done' }).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }
}
