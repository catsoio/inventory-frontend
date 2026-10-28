import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { QuoteApi } from '../../core/api/quote-api';
import { Auth } from '../../core/auth/auth';
import { QuoteDetail, QuoteSendResponse } from '../../core/models';

export interface QuoteSendData {
  id: string;
  code: string;
  customerName: string;
  regNo: string;
  phone: string | null;
  email: string | null;
  /** Öre inkl. moms. */
  total: number;
  /** Förslaget har redan skickats minst en gång. */
  resend: boolean;
}

const DEFAULT_SMS =
  'Hej {namn}! Här är kostnadsförslaget för {regnr} från {verkstad} ({belopp}). Läs och svara här: {länk}';

/** Ett svensk mobilnummer vi kan skicka till (samma tumregel som servern: 07x). */
const isMobile = (raw: string) => {
  const n = raw.replace(/[^\d+]/g, '');
  return /^(\+467|00467|07)\d{8}$/.test(n);
};
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Skicka kostnadsförslaget till kunden: en länk som kunden öppnar utan inloggning för att läsa
 * och svara ja eller nej. SMS, e-post eller båda. Förslaget lämnas (fryses) när det skickas.
 */
@Component({
  selector: 'app-quote-send-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>
      {{ data.resend ? 'Skicka igen' : 'Skicka till kund' }} · {{ data.code }}
    </h2>
    <mat-dialog-content class="!flex flex-col gap-4 !pt-2">
      <p class="text-sm text-gray-600">
        {{ data.customerName }} får en länk där förslaget kan läsas och godkännas eller avböjas.
        @if (!data.resend) {
          Förslaget markeras som lämnat och beloppet, giltigheten och avvikelsen fryses.
        }
      </p>

      <section class="rounded-xl p-3 ring-1 ring-gray-200">
        <mat-checkbox [checked]="sms()" (change)="sms.set($event.checked)">
          <span class="font-medium">SMS</span>
        </mat-checkbox>
        @if (sms()) {
          <mat-form-field class="mt-2 block w-full" subscriptSizing="dynamic">
            <mat-label>Mobilnummer</mat-label>
            <input
              matInput
              type="tel"
              inputmode="tel"
              [value]="phone()"
              (input)="phone.set($any($event.target).value)"
              placeholder="070-123 45 67"
            />
            @if (phone() && !phoneOk()) {
              <mat-hint class="!text-red-700">Det måste vara ett svenskt mobilnummer.</mat-hint>
            }
          </mat-form-field>
          <mat-form-field class="mt-3 block w-full" subscriptSizing="dynamic">
            <mat-label>Meddelande</mat-label>
            <textarea
              matInput
              rows="3"
              [value]="smsText()"
              (input)="smsText.set($any($event.target).value)"
            ></textarea>
            <mat-hint>
              {{ preview().length }} tecken. {{ '{namn}' }} {{ '{regnr}' }} {{ '{verkstad}' }}
              {{ '{belopp}' }} {{ '{länk}' }} byts ut. Länken läggs till om du tar bort den.
            </mat-hint>
          </mat-form-field>
          <div class="mt-3 rounded-lg bg-gray-50 p-3 text-sm whitespace-pre-line">
            <div class="mb-1 text-xs font-medium text-gray-500 uppercase">Så ser det ut</div>
            {{ preview() }}
          </div>
        }
      </section>

      <section class="rounded-xl p-3 ring-1 ring-gray-200">
        <mat-checkbox [checked]="mail()" (change)="mail.set($event.checked)">
          <span class="font-medium">E-post</span>
        </mat-checkbox>
        @if (mail()) {
          <mat-form-field class="mt-2 block w-full" subscriptSizing="dynamic">
            <mat-label>E-postadress</mat-label>
            <input
              matInput
              type="email"
              inputmode="email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
              placeholder="namn@exempel.se"
            />
            @if (email() && !emailOk()) {
              <mat-hint class="!text-red-700">Kontrollera e-postadressen.</mat-hint>
            }
          </mat-form-field>
          <mat-form-field class="mt-3 block w-full" subscriptSizing="dynamic">
            <mat-label>Några ord överst i mejlet (valfritt)</mat-label>
            <textarea
              matInput
              rows="2"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
              placeholder="Hej! Här är förslaget vi pratade om."
            ></textarea>
            <mat-hint>Svar på mejlet går till verkstadens adress i Fakturauppgifter.</mat-hint>
          </mat-form-field>
        }
      </section>

      @if (failed().length) {
        <div class="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <b>Det gick inte att skicka:</b>
          @for (f of failed(); track f.channel) {
            <div>{{ f.channel === 'sms' ? 'SMS' : 'E-post' }} till {{ f.to }}</div>
          }
          <div class="mt-1">Det som gick fram är sparat. Försök igen eller kopiera länken.</div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canSend() || busy()"
        (click)="submit()"
      >
        <mat-icon>send</mat-icon> Skicka
      </button>
    </mat-dialog-actions>
  `,
})
export class QuoteSendDialog {
  readonly data = inject<QuoteSendData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<QuoteSendDialog, QuoteDetail | null>);
  private readonly api = inject(QuoteApi);
  private readonly auth = inject(Auth);

  readonly busy = signal(false);
  readonly sms = signal(!!this.data.phone && isMobile(this.data.phone));
  readonly mail = signal(!this.sms() && !!this.data.email);
  readonly phone = signal(this.data.phone ?? '');
  readonly email = signal(this.data.email ?? '');
  readonly smsText = signal(DEFAULT_SMS);
  readonly note = signal('');
  readonly failed = signal<QuoteSendResponse['results']>([]);

  readonly phoneOk = computed(() => isMobile(this.phone()));
  readonly emailOk = computed(() => isEmail(this.email()));
  readonly canSend = computed(
    () =>
      (this.sms() || this.mail()) &&
      (!this.sms() || this.phoneOk()) &&
      (!this.mail() || this.emailOk()) &&
      this.preview().length <= 480,
  );
  readonly preview = computed(() => {
    const link = `${location.origin}/q/••••••••`;
    const text = this.smsText().trim() || DEFAULT_SMS;
    const filled = text
      .replaceAll('{namn}', this.data.customerName.trim().split(/\s+/)[0] ?? '')
      .replaceAll('{regnr}', this.data.regNo)
      .replaceAll('{verkstad}', this.auth.companyName() || 'Verkstaden')
      .replaceAll('{belopp}', `${(this.data.total / 100).toLocaleString('sv-SE')} kr`)
      .replaceAll('{länk}', link);
    return text.includes('{länk}') ? filled : `${filled} ${link}`;
  });

  submit() {
    const channels: ('sms' | 'email')[] = [];
    if (this.sms()) channels.push('sms');
    if (this.mail()) channels.push('email');
    this.busy.set(true);
    this.api
      .send(this.data.id, {
        channels,
        phone: this.sms() ? this.phone().trim() : undefined,
        email: this.mail() ? this.email().trim() : undefined,
        smsText: this.sms() ? this.smsText().trim() : undefined,
        emailNote: this.mail() ? this.note().trim() || undefined : undefined,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          const bad = res.results.filter((r) => !r.ok);
          if (bad.length) this.failed.set(bad);
          if (bad.length < res.results.length) this.ref.close(res.quote);
        },
        error: () => this.busy.set(false),
      });
  }
}
