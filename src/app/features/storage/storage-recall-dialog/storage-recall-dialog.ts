import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { StorageApi } from '../../../core/api/storage-api';
import { Auth } from '../../../core/auth/auth';
import { RecallPreview } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

const RECENT_DAYS = 30;

/** Kalla in kunder med däck i hotellet via SMS: välj mottagare, läs texten, skicka. */
@Component({
  selector: 'app-storage-recall-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Kalla in kunder</h2>
    <mat-dialog-content class="!flex flex-col gap-3 !pt-2">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (!preview()?.recipients?.length) {
        <p class="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          Inga kunder med mobilnummer har däck i hotellet.
        </p>
      } @else {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Meddelande</mat-label>
          <textarea matInput rows="4" [value]="message()" (input)="message.set($any($event.target).value)"></textarea>
          <mat-hint>
            {{ message().length }} tecken. {{ '{namn}' }} och {{ '{regnr}' }} byts ut per kund.
          </mat-hint>
        </mat-form-field>
        @if (example(); as e) {
          <div class="rounded-lg bg-gray-50 p-3 text-sm whitespace-pre-line">
            <div class="mb-1 text-xs font-medium text-gray-500 uppercase">Så ser det ut för {{ e.name }}</div>
            {{ rendered() }}
          </div>
        }
        <div class="flex items-center justify-between text-sm">
          <label class="flex items-center gap-2">
            <mat-checkbox [checked]="allChecked()" (change)="toggleAll($event.checked)" />
            Välj alla
          </label>
          <span class="text-gray-600">{{ selected().size }} av {{ preview()!.recipients.length }} valda</span>
        </div>
        <div class="max-h-72 overflow-auto rounded-xl ring-1 ring-gray-200">
          @for (r of preview()!.recipients; track r.phone) {
            <label class="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0">
              <mat-checkbox [checked]="selected().has(r.phone)" (change)="toggle(r.phone, $event.checked)" />
              <span class="min-w-0 flex-1">
                <span class="font-medium">{{ r.name }}</span>
                <span class="text-gray-500"> · {{ r.regNos.join(', ') }}</span>
                <span class="block text-xs text-gray-500">{{ r.phone }}</span>
              </span>
              @if (r.recalledAt) {
                <span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  Kallad {{ r.recalledAt | date: 'd MMM' }}
                </span>
              }
            </label>
          }
        </div>
        @if (preview()!.withoutPhone) {
          <p class="text-xs text-gray-500">
            {{ preview()!.withoutPhone }} inlämning(ar) saknar mobilnummer och visas inte.
          </p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!canSend()" (click)="send()">
        <mat-icon>sms</mat-icon> Skicka till {{ selected().size }}
      </button>
    </mat-dialog-actions>
  `,
})
export class StorageRecallDialog implements OnInit {
  private readonly api = inject(StorageApi);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(Confirm);
  private readonly ref = inject(MatDialogRef<StorageRecallDialog>);
  private readonly auth = inject(Auth);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly preview = signal<RecallPreview | null>(null);
  /** Valda mottagare (telefonnummer). */
  readonly selected = signal<Set<string>>(new Set());
  readonly message = signal('');

  readonly example = computed(
    () => this.preview()?.recipients.find((r) => this.selected().has(r.phone)) ?? this.preview()?.recipients[0],
  );
  readonly rendered = computed(() => {
    const e = this.example();
    return e ? this.render(this.message(), e.name, e.regNos) : '';
  });
  readonly allChecked = computed(
    () => !!this.preview()?.recipients.length && this.selected().size === this.preview()!.recipients.length,
  );
  readonly canSend = computed(() => !this.busy() && this.selected().size > 0 && this.message().trim().length > 0);

  ngOnInit() {
    const company = this.auth.companyName();
    this.message.set(
      `Hej {namn}! Dina däck för {regnr} står hos oss och det är dags för säsongsbyte. Ring eller boka tid.${company ? ' /' + company : ''}`,
    );
    this.api.recallPreview().subscribe({
      next: (p) => {
        this.preview.set(p);
        const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
        // De som redan fått ett SMS de senaste 30 dagarna är inte förvalda.
        this.selected.set(
          new Set(
            p.recipients
              .filter((r) => !r.recalledAt || new Date(r.recalledAt).getTime() < cutoff)
              .map((r) => r.phone),
          ),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Kunde inte hämta kunderna', 'OK', { duration: 4000 });
      },
    });
  }

  toggle(phone: string, on: boolean) {
    const next = new Set(this.selected());
    if (on) next.add(phone);
    else next.delete(phone);
    this.selected.set(next);
  }

  toggleAll(on: boolean) {
    this.selected.set(on ? new Set(this.preview()!.recipients.map((r) => r.phone)) : new Set());
  }

  send() {
    const chosen = this.preview()!.recipients.filter((r) => this.selected().has(r.phone));
    this.confirm
      .ask({
        title: 'Skicka SMS?',
        message: `${chosen.length} kund(er) får ett SMS. Det går inte att ångra.`,
        confirmText: 'Skicka',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.busy.set(true);
        this.api.recallSend(chosen.flatMap((r) => r.depositIds), this.message()).subscribe({
          next: (res) => {
            this.busy.set(false);
            const failed = res.failed.length ? `, ${res.failed.length} misslyckades` : '';
            this.snack.open(`${res.sent} SMS skickade${failed}`, 'OK', { duration: 5000 });
            this.ref.close(true);
          },
          error: () => {
            this.busy.set(false);
            this.snack.open('Kunde inte skicka', 'OK', { duration: 4000 });
          },
        });
      });
  }

  private render(text: string, name: string, regNos: string[]): string {
    return text.replaceAll('{namn}', name.split(' ')[0] ?? name).replaceAll('{regnr}', regNos.join(', '));
  }
}
