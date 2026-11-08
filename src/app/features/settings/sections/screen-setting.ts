import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ScreenApi } from '../../../core/api/screen-api';
import { Billing } from '../../../core/billing/billing';
import { ScreenStatus, ScreenStyle } from '../../../core/models';
import { Confirm } from '../../../shared/confirm';

const LOOKS: { id: ScreenStyle; name: string; text: string }[] = [
  { id: 'board', name: 'Tavla', text: 'Mörk, tre kolumner: ska startas, pågår, väntar på del.' },
  { id: 'light', name: 'Ljus', text: 'Vit bakgrund, ett rutnät av kort. Passar en ljus hall.' },
  {
    id: 'list',
    name: 'Lista',
    text: 'Som en avgångstavla: en rad per order, stor text, svart och gult.',
  },
  { id: 'mechanics', name: 'Per mekaniker', text: 'En kolumn per mekaniker med dennes order.' },
];

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
          <div class="py-3.5">
            <div class="mb-0.5 text-[15px] font-medium">Utseende</div>
            <p class="m-0 mb-3 text-sm text-gray-500">
              Skärmen byter av sig själv inom en halv minut. Ordern är desamma i alla.
            </p>
            <div
              class="grid grid-cols-2 gap-3 lg:grid-cols-4"
              role="radiogroup"
              aria-label="Utseende"
            >
              @for (l of looks; track l.id) {
                <div
                  class="flex flex-col overflow-hidden rounded-xl border-2 bg-white"
                  [class]="status()?.style === l.id ? 'border-primary' : 'border-gray-200'"
                >
                  <button
                    type="button"
                    role="radio"
                    class="flex-1 cursor-pointer text-left"
                    [attr.aria-checked]="status()?.style === l.id"
                    [disabled]="busy()"
                    (click)="pick(l.id)"
                  >
                    <div class="h-24 p-2" [class]="swatch(l.id)">
                      @switch (l.id) {
                        @case ('board') {
                          <div class="grid h-full grid-cols-3 gap-1">
                            @for (i of [1, 2, 3]; track i) {
                              <div class="space-y-1 rounded bg-white/10 p-1">
                                <div class="h-3 rounded-sm bg-white/70"></div>
                                <div class="h-3 rounded-sm bg-white/30"></div>
                              </div>
                            }
                          </div>
                        }
                        @case ('light') {
                          <div class="grid h-full grid-cols-2 gap-1">
                            @for (i of [1, 2, 3, 4]; track i) {
                              <div
                                class="rounded border-l-4 border-emerald-500 bg-white p-1 shadow-sm"
                              >
                                <div class="h-2.5 w-3/4 rounded-sm bg-slate-700"></div>
                              </div>
                            }
                          </div>
                        }
                        @case ('list') {
                          <div class="space-y-1.5 pt-1">
                            @for (i of [1, 2, 3, 4]; track i) {
                              <div class="flex gap-1.5">
                                <div class="h-2.5 w-1/4 rounded-sm bg-[#ffd23f]"></div>
                                <div class="h-2.5 flex-1 rounded-sm bg-[#ffd23f]/50"></div>
                                <div class="h-2.5 w-3 rounded-full bg-emerald-400"></div>
                              </div>
                            }
                          </div>
                        }
                        @case ('mechanics') {
                          <div class="grid h-full grid-cols-3 gap-1">
                            @for (i of [1, 2, 3]; track i) {
                              <div class="space-y-1 rounded bg-white/10 p-1">
                                <div class="h-4 w-4 rounded-full bg-indigo-400"></div>
                                <div class="h-3 rounded-sm bg-white/40"></div>
                              </div>
                            }
                          </div>
                        }
                      }
                    </div>
                    <div class="px-3 pt-2.5">
                      <div class="flex items-center gap-1.5 text-[15px] font-semibold">
                        {{ l.name }}
                        @if (status()?.style === l.id) {
                          <mat-icon class="!h-[18px] !w-[18px] !text-[18px] text-primary"
                            >check_circle</mat-icon
                          >
                        }
                      </div>
                      <div class="mt-0.5 text-xs text-gray-500">{{ l.text }}</div>
                    </div>
                  </button>
                  <a
                    class="px-3 py-2 text-xs font-medium text-primary hover:underline"
                    [href]="link() + '?style=' + l.id"
                    target="_blank"
                    rel="noopener"
                    >Förhandsgranska</a
                  >
                </div>
              }
            </div>
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

  readonly looks = LOOKS;

  /** Miniatyrens bakgrund; den ska likna stilen. */
  swatch(id: ScreenStyle) {
    return {
      board: 'bg-slate-950',
      light: 'bg-stone-100',
      list: 'bg-black',
      mechanics: 'bg-[#10131f]',
    }[id];
  }

  pick(style: ScreenStyle) {
    if (this.status()?.style !== style) this.run(this.api.setStyle(style));
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
