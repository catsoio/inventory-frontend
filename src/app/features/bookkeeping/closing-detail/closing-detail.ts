import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { ClosingApi } from '../../../core/api/closing-api';
import { Auth } from '../../../core/auth/auth';
import { Closing, closingCode } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { dateTimeText, daysIn, periodLabel } from '../bookkeeping-format';

@Component({
  selector: 'app-closing-detail',
  standalone: false,
  template: `
    @if (c(); as c) {
      <div class="mx-auto max-w-[1400px]">
        <div class="mb-1 text-sm text-gray-500 print:hidden">
          <a routerLink="/bookkeeping" class="text-brand underline">Bokföring</a> /
          {{ code(c.number) }}
        </div>
        <div class="mb-1 flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-semibold">{{ code(c.number) }} · {{ period(c) }}</h1>
          @if (c.status === 'voided') {
            <app-pill tone="gray">Annullerad</app-pill>
          } @else if (c.kind === 'reset') {
            <app-pill tone="red">Nollställning</app-pill>
          } @else {
            <app-pill tone="green">Bokförd</app-pill>
          }
          <span class="flex-1"></span>
          <div class="flex gap-2 print:hidden">
            <button mat-stroked-button (click)="print()">
              <mat-icon>print</mat-icon> Skriv ut
            </button>
            @if (canVoid()) {
              <button mat-stroked-button color="warn" (click)="(void c)">
                <mat-icon>undo</mat-icon> Annullera
              </button>
            }
          </div>
        </div>
        <div class="mb-4 text-sm text-gray-600">
          {{ days(c) }} dagar · exakt {{ dateTime(c.from) }} till {{ dateTime(c.to) }} · bokförd
          {{ dateTime(c.closedAt) }} av {{ c.closedByName ?? 'okänd'
          }}{{ c.closedBySuperAdmin ? ' (superadmin)' : '' }}
        </div>

        @if (c.note) {
          <div class="mb-3 rounded-lg bg-gray-50 p-3 text-sm">“{{ c.note }}”</div>
        }
        @if (c.status === 'voided' && c.voided) {
          <div class="mb-3 flex gap-2 rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
            <mat-icon>info</mat-icon>
            <span>
              Annullerad {{ dateTime(c.voided.at) }}. Perioden är upplåst och kan bokföras om.
              @if (c.voided.reason) {
                Orsak: {{ c.voided.reason }}
              }
            </span>
          </div>
        }
        @if (c.reset; as r) {
          <div class="mb-3 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
            <mat-icon>delete_forever</mat-icon>
            <span>
              Garagets data nollställdes i samband med bokföringen: {{ r.articles }} artiklar,
              {{ r.movements }} lagerhändelser och {{ r.deposits }} inlämningar togs bort och finns
              kvar här i arkivet.
              @if (r.keptDeposits > 0) {
                {{ r.keptDeposits }} inlagrade set lämnades kvar.
              }
            </span>
          </div>
        }

        <mat-tab-group animationDuration="0ms" class="print:hidden" [(selectedIndex)]="tab">
          <mat-tab label="Sammanfattning" />
          <mat-tab [label]="'Artiklar (' + c.counts.lines + ')'" />
          <mat-tab [label]="'Lagerhändelser (' + c.counts.movements + ')'" />
          <mat-tab [label]="'Däckhotell (' + c.counts.deposits + ')'" />
        </mat-tab-group>

        <div class="mt-4">
          @switch (tab) {
            @case (0) {
              <app-closing-summary [summary]="c.summary" />
            }
            @case (1) {
              <app-closing-entries [closingId]="c.id" kind="line" />
            }
            @case (2) {
              <app-closing-entries [closingId]="c.id" kind="movement" />
            }
            @case (3) {
              <app-closing-entries [closingId]="c.id" kind="deposit" />
            }
          }
        </div>
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class ClosingDetail {
  private readonly api = inject(ClosingApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(Auth);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;

  readonly c = signal<Closing | null>(null);
  /** Id på den senaste gällande bokföringen; bara den kan annulleras. */
  private readonly latestId = signal<string | null>(null);
  tab = 0;

  readonly canVoid = computed(() => {
    const c = this.c();
    return (
      !!c &&
      this.auth.isSuperAdmin() &&
      c.status === 'closed' &&
      c.kind === 'period' &&
      this.latestId() === c.id
    );
  });

  code = closingCode;
  dateTime = dateTimeText;
  period = (c: Closing) => periodLabel(c.from, c.to);
  days = (c: Closing) => daysIn(c.from, c.to);

  constructor() {
    this.api.get(this.id).subscribe((c) => this.c.set(c));
    this.api.status().subscribe((s) => this.latestId.set(s.latest?.id ?? null));
  }

  print() {
    window.print();
  }

  void(c: Closing) {
    this.dialog
      .open<ConfirmDialog, unknown, boolean>(ConfirmDialog, {
        data: {
          title: `Annullera ${closingCode(c.number)}?`,
          message:
            'Perioden låses upp och kan bokföras om. Bokföringen finns kvar i listan som annullerad. Gör det bara om perioden bokfördes med fel datum.',
          confirmText: 'Annullera bokföringen',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.api.void(c.id).subscribe((next) => {
          this.c.set(next);
          this.latestId.set(null);
          this.snack.open('Bokföringen är annullerad', undefined, { duration: 3000 });
        });
      });
  }
}
