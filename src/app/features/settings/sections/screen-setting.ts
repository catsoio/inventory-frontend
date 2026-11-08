import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScreenApi } from '../../../core/api/screen-api';
import { Billing } from '../../../core/billing/billing';
import { ScreenStatus } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

/**
 * Skärmen i verkstadens hall. Ingen användare och ingen roll: ägaren slår på den och får en länk som
 * skrivs in en gång på skärmens webbläsare. Länken kan bytas eller stängas, och sidan bakom den visar
 * bara orderna (inget om kunderna, inga priser).
 */
@Component({
  selector: 'app-settings-screen',
  standalone: false,
  template: `
    @if (shown()) {
      <app-setting-group
        title="Skärm i verkstaden"
        text="En stor skärm i hallen som bara visar arbetsorder, uppdelade på ska startas, pågår och väntar på del. Ingen inloggning: länken är nyckeln."
      >
        @if (!status()?.enabled) {
          <app-setting-row
            label="Skärmen är av"
            hint="Slå på så får ni en länk att öppna i skärmens webbläsare."
          >
            <button mat-flat-button type="button" [disabled]="busy()" (click)="enable()">
              Slå på
            </button>
          </app-setting-row>
        } @else {
          <div class="py-3.5">
            <div class="mb-1 text-[15px] font-medium">Skärmens adress</div>
            <div class="flex flex-wrap items-center gap-2">
              <input
                class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm"
                readonly
                [value]="link()"
                (focus)="$any($event.target).select()"
                aria-label="Skärmens adress"
              />
              <button mat-stroked-button type="button" (click)="copy()">Kopiera</button>
              <a mat-stroked-button [href]="link()" target="_blank" rel="noopener">Öppna</a>
            </div>
            <p class="m-0 mt-2 text-sm text-gray-500">
              Öppna adressen på skärmen och tryck F11 för helskärm. Den hämtar nytt av sig själv
              varje halv minut och behöver aldrig laddas om. Alla som har adressen kan se orderna,
              så dela den inte.
            </p>
          </div>
          <app-setting-row
            label="Ny adress"
            hint="Den gamla slutar fungera direkt. Använd om adressen har kommit på avvägar."
          >
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="renew()">
              Skapa ny adress
            </button>
          </app-setting-row>
          <app-setting-row label="Stäng av skärmen" hint="Adressen slutar fungera.">
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="disable()">
              Stäng av
            </button>
          </app-setting-row>
        }
      </app-setting-group>
    }
  `,
})
export class SettingsScreen implements OnInit {
  private readonly api = inject(ScreenApi);
  private readonly billing = inject(Billing);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);

  readonly status = signal<ScreenStatus | null>(null);
  readonly busy = signal(false);
  readonly shown = computed(() => this.billing.allows('arbetsorder') && this.status() !== null);
  readonly link = computed(() => {
    const t = this.status()?.token;
    return t ? `${location.origin}/s/${t}` : '';
  });

  ngOnInit() {
    // Mekaniker och personal når inte inställningarna; en ägare utan modulen får 402 och ser ingenting.
    this.api.status().subscribe({ next: (s) => this.status.set(s), error: () => undefined });
  }

  enable() {
    this.run(this.api.enable());
  }

  renew() {
    this.confirm
      .ask({
        title: 'Skapa ny adress?',
        message: 'Den gamla adressen slutar fungera. Skärmen i verkstaden måste få den nya.',
        confirmText: 'Skapa ny',
      })
      .subscribe((ok) => ok && this.run(this.api.renew()));
  }

  disable() {
    this.confirm
      .ask({
        title: 'Stänga av skärmen?',
        message: 'Skärmen i verkstaden slutar visa order. Du kan slå på den igen när som helst.',
        confirmText: 'Stäng av',
        danger: true,
      })
      .subscribe((ok) => ok && this.run(this.api.disable()));
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.link());
      this.snack.open('Adressen är kopierad', undefined, { duration: 2500 });
    } catch {
      this.snack.open('Kunde inte kopiera, markera adressen och kopiera själv', undefined, {
        duration: 4000,
      });
    }
  }

  private run(call: ReturnType<ScreenApi['enable']>) {
    this.busy.set(true);
    call.subscribe({
      next: (s) => {
        this.status.set(s);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('Det gick inte att ändra skärmen', undefined, { duration: 4000 });
      },
    });
  }
}
