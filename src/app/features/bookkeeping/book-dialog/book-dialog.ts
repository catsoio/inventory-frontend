import { Component, DestroyRef, Inject, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { catchError, debounceTime, of, Subject, switchMap, tap } from 'rxjs';
import { ClosingApi } from '../../../core/api/closing-api';
import { Closing, ClosingPreview, ClosingStatusInfo, closingCode } from '../../../core/models';
import {
  BLOCKED_TEXT,
  dateTimeText,
  dayInput,
  daysIn,
  periodLabel,
  warningText,
} from '../bookkeeping-format';

type Mode = 'now' | 'custom';

@Component({
  selector: 'app-book-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Bokför period</h2>
    <mat-dialog-content class="!flex flex-col gap-3 !pt-2">
      <p class="text-sm text-gray-600">
        Bokföringen arkiverar periodens siffror, lagersaldon och händelser så att de går att granska
        i efterhand. Lagret ligger kvar och saldona förs vidare till nästa period. Perioden låses:
        betalningar i däckhotellet som hör till den kan inte längre ändras.
      </p>

      <mat-button-toggle-group [value]="mode()" (change)="setMode($event.value)" class="self-start">
        <mat-button-toggle value="now">Från {{ startLabel }} till nu</mat-button-toggle>
        <mat-button-toggle value="custom">Välj period</mat-button-toggle>
      </mat-button-toggle-group>

      @if (mode() === 'custom') {
        <form [formGroup]="form" class="flex flex-wrap items-start gap-3">
          @if (!status.fromIsFixed) {
            <app-date-field
              label="Från"
              formControlName="from"
              [max]="firstDay"
              [hint]="'Senast ' + (firstDay || 'första händelsen')"
              (dateChange)="refresh()"
            />
          } @else {
            <div class="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Börjar där {{ code(status.latest!.number) }} slutade<br />
              <strong>{{ dateTime(status.latest!.to) }}</strong>
            </div>
          }
          <app-date-field
            label="Till och med"
            formControlName="to"
            [max]="today"
            hint="Hela dagen ingår"
            (dateChange)="refresh()"
          />
        </form>
      }

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (preview(); as p) {
        <div class="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <strong>{{ period(p) }}</strong>
          <span class="text-gray-500"> · {{ days(p) }} dagar</span>
          @if (p.counts) {
            <span class="text-gray-500">
              · {{ p.counts.movements }} lagerhändelser, {{ p.counts.lines }} artiklar</span
            >
          }
        </div>

        @if (p.blocked) {
          <div class="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <mat-icon>block</mat-icon>
            <span>{{ blocked[p.blocked] }}</span>
          </div>
        }

        @for (w of p.warnings; track w.code) {
          @if (!(p.blocked === 'NOTHING_TO_CLOSE' && w.code === 'EMPTY_PERIOD')) {
            <div
              class="flex gap-2 rounded-lg p-3 text-sm"
              [class]="
                w.severity === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'
              "
            >
              <mat-icon>{{ w.severity === 'warning' ? 'warning' : 'info' }}</mat-icon>
              <span>{{ text(w) }}</span>
            </div>
          }
        }

        @if (p.summary && !p.blocked) {
          <app-closing-summary [summary]="p.summary" />
        }
      }

      <mat-form-field>
        <mat-label>Anteckning (valfri)</mat-label>
        <textarea matInput rows="2" maxlength="500" [formControl]="note"></textarea>
      </mat-form-field>

      <mat-slide-toggle [formControl]="understood">
        Jag har kontrollerat siffrorna och förstår att perioden låses.
      </mat-slide-toggle>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Avbryt</button>
      <button mat-flat-button color="primary" [disabled]="!canBook() || busy()" (click)="book()">
        Bokför
      </button>
    </mat-dialog-actions>
  `,
})
export class BookDialog {
  private readonly api = inject(ClosingApi);
  private readonly ref = inject<MatDialogRef<BookDialog, Closing>>(MatDialogRef);

  readonly blocked = BLOCKED_TEXT;
  readonly today = dayInput(new Date());
  readonly firstDay: string;
  readonly startLabel: string;
  readonly mode = signal<Mode>('now');
  readonly preview = signal<ClosingPreview | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({ from: '', to: this.today });
  readonly note = inject(FormBuilder).nonNullable.control('');
  readonly understood = inject(FormBuilder).nonNullable.control(false);
  private readonly request$ = new Subject<void>();

  constructor(@Inject(MAT_DIALOG_DATA) public status: ClosingStatusInfo) {
    this.form.controls.from.setValue(dayInput(status.suggestedFrom));
    this.firstDay = status.firstEventAt ? dayInput(status.firstEventAt) : '';
    this.startLabel = status.fromIsFixed
      ? dayInput(status.suggestedFrom)
      : status.firstEventAt
        ? dayInput(status.firstEventAt)
        : 'start';
    this.request$
      .pipe(
        debounceTime(250),
        tap(() => {
          this.loading.set(true);
          this.understood.setValue(false);
        }),
        switchMap(() => this.api.preview(this.range()).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((p) => {
        this.preview.set(p);
        this.loading.set(false);
      });
    this.refresh();
  }

  code = closingCode;
  dateTime = dateTimeText;
  text = warningText;
  period = (p: ClosingPreview) => periodLabel(p.from, p.to);
  days = (p: ClosingPreview) => daysIn(p.from, p.to);

  setMode(mode: Mode) {
    this.mode.set(mode);
    this.refresh();
  }

  refresh() {
    this.request$.next();
  }

  /** "Till nu" ger ingen period alls: servern räknar ut den. */
  private range(): { from?: string; to?: string } {
    if (this.mode() === 'now') return {};
    const { from, to } = this.form.getRawValue();
    return { from: this.status.fromIsFixed ? undefined : from || undefined, to: to || undefined };
  }

  canBook(): boolean {
    const p = this.preview();
    return !!p && !p.blocked && !this.loading() && this.understood.value;
  }

  book() {
    const p = this.preview()!;
    // "Till nu" bokförs till exakt den tidpunkt som förhandsvisades.
    const body =
      this.mode() === 'now'
        ? { to: p.to }
        : { ...this.range(), to: this.form.getRawValue().to || undefined };
    this.busy.set(true);
    this.api.close({ ...body, note: this.note.value.trim() || undefined }).subscribe({
      next: (c) => this.ref.close(c),
      error: () => this.busy.set(false),
    });
  }
}
