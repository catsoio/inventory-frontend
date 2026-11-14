import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA as DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import pkg from '../../../../package.json';
import { Confirm } from '../../shared/confirm';
import { SettingsStore } from './settings-store';

/** En sida i inställningarna: namnet i vänsterspalten och rubrik och förklaring över innehållet. */
export interface SettingsItem {
  key: string;
  label: string;
  text: string;
}

/** En grupp sidor i vänsterspalten. */
export interface SettingsGroup {
  key: string;
  label: string;
  icon: string;
  items: SettingsItem[];
}

/**
 * Inställningar som en popup: grupperade sidor i en vänsterspalt (ett enda sätt att navigera, ingen
 * flik i flik; på mobil en rad som rullar sidledes) och innehållet till höger. Formulären ligger i
 * `SettingsStore`, så att osparat finns kvar mellan sidorna; stänger man med osparat frågar
 * popupen först. Byggstenarna för sidorna (`settings-ui.ts`) gör att samma sorts val ser likadana ut överallt.
 */
@Component({
  selector: 'app-settings',
  standalone: false,
  providers: [SettingsStore],
  host: { class: 'flex h-full min-h-0 flex-col' },
  styles: `
    .rail-item.is-active {
      background: var(--color-brand-soft);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .rail {
      scrollbar-width: none;
    }
    .rail::-webkit-scrollbar {
      display: none;
    }
  `,
  template: `
    <header class="flex items-center gap-2 px-5 py-4 md:px-7">
      <h2 class="m-0 flex-1 text-xl font-semibold">Inställningar</h2>
      <button mat-icon-button type="button" aria-label="Stäng" (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col border-t border-gray-200 md:flex-row">
      <nav
        class="shrink-0 border-b border-gray-200 bg-gray-50 md:w-72 md:overflow-y-auto md:border-r md:border-b-0 md:px-4 md:py-3"
        aria-label="Inställningar"
      >
        <div
          class="rail flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:gap-0 md:overflow-visible md:p-0"
        >
          @for (g of groups(); track g.key; let first = $first) {
            @if (groups().length > 1) {
              <div
                class="hidden items-center gap-2 px-2 pb-1.5 text-[13px] font-bold tracking-wide text-gray-900 uppercase md:flex"
                [class.mt-6]="!first"
                [class.mt-1]="first"
              >
                <mat-icon class="!h-5 !w-5 !text-xl text-gray-500">{{ g.icon }}</mat-icon>
                {{ g.label }}
              </div>
            }
            <div
              class="flex gap-1 md:ml-4 md:flex-col md:gap-0.5 md:border-l-2 md:border-gray-200 md:pl-2"
            >
              @for (i of g.items; track i.key) {
                <button
                  type="button"
                  (click)="tab.set(i.key)"
                  [class.is-active]="tab() === i.key"
                  [attr.aria-current]="tab() === i.key ? 'page' : null"
                  class="rail-item shrink-0 rounded-lg px-3 py-2 text-left text-[15px] whitespace-nowrap text-gray-700 hover:bg-gray-200/60 md:w-full md:whitespace-normal"
                >
                  {{ i.label }}
                </button>
              }
            </div>
          }
        </div>
      </nav>

      <main class="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3 md:px-8">
        <div class="max-w-4xl">
          @if (current(); as c) {
            <h2 class="m-0 text-xl font-semibold">{{ c.label }}</h2>
            <p class="mt-1 mb-5 max-w-2xl text-sm text-gray-600">{{ c.text }}</p>
          }
          @switch (tab()) {
            @case ('foretag') {
              <app-settings-company />
            }
            @case ('personal') {
              <app-settings-staff />
            }
            @case ('bolag') {
              <app-settings-companies />
            }
            @case ('webbsida') {
              <app-settings-website />
            }
            @case ('order') {
              <app-settings-pricing />
            }
            @case ('lager') {
              <app-settings-stock />
            }
            @case ('dackhotell') {
              <app-settings-hotel />
            }
            @case ('betalningar') {
              <app-settings-counter />
              <app-settings-payments />
              <app-settings-register />
            }
            @case ('anslutningar') {
              <app-settings-connections />
            }
            @case ('visning') {
              <app-settings-view />
            }
            @case ('losenord') {
              <app-settings-password />
            }
          }
          <div class="mt-6 text-xs text-gray-400 tabular-nums">Version {{ version }}</div>
        </div>
      </main>
    </div>
  `,
})
export class SettingsPage {
  private readonly store = inject(SettingsStore);
  private readonly ref = inject(MatDialogRef<SettingsPage>);
  private readonly confirm = inject(Confirm);
  protected readonly version = pkg.version;

  /** Det man oftast söker först ligger överst; personliga val sist. */
  readonly groups = computed<SettingsGroup[]>(() => {
    const personal: SettingsGroup = {
      key: 'konto',
      icon: 'person',
      label: 'Mitt konto',
      items: [
        {
          key: 'visning',
          label: 'Visning och språk',
          text: 'Gäller bara dig, på den här enheten.',
        },
        {
          key: 'losenord',
          label: 'Lösenord',
          text: 'Du loggas ut på dina andra enheter när du byter.',
        },
      ],
    };
    if (!this.store.admin) return [personal];
    const company: SettingsItem[] = [
      {
        key: 'foretag',
        label: 'Företagsuppgifter',
        text: 'Skrivs ut på faktura och kvitto. En faktura måste ha namn, adress och momsregistreringsnummer. Uppgifterna kopieras in på varje dokument när det utfärdas och ändras inte i efterhand.',
      },
      {
        key: 'personal',
        label: 'Personal',
        text: 'Ägaren ser allt. Personal når allt utom ekonomi och inställningar; mekaniker ser bara sina arbetsorder.',
      },
    ];
    if (this.store.showCompanies()) {
      company.push({
        key: 'bolag',
        label: 'Bolag',
        text: 'Varje bolag har egna fakturauppgifter, lager och nummerserier.',
      });
    }
    if (this.store.auth.isSuperAdmin()) {
      company.push({
        key: 'webbsida',
        label: 'Onlinebokning',
        text: 'Adressen kunderna bokar på och om sidan är påslagen. Gäller bolaget du är i just nu; verkstaden ändrar inte adressen själv.',
      });
    }
    return [
      { key: 'foretaget', icon: 'business', label: 'Företaget', items: company },
      {
        key: 'arbete',
        icon: 'tune',
        label: 'Arbetssätt',
        items: [
          {
            key: 'order',
            label: 'Arbetsorder och offert',
            text: 'Hur en order prissätts, vad som skrivs ut och hur offerten ser ut.',
          },
          {
            key: 'lager',
            label: 'Lager och kunder',
            text: 'Förval för nya artiklar, hur lagret påverkas av en order och vad kundlistan visar. Gäller hela företaget.',
          },
          {
            key: 'dackhotell',
            label: 'Däckhotell',
            text: 'Fylls i när ni tar emot ett set, så att den som står i kassan bara ändrar det som avviker.',
          },
        ],
      },
      {
        key: 'betalning',
        icon: 'payments',
        label: 'Betalning och tjänster',
        items: [
          {
            key: 'betalningar',
            label: 'Betalning och kassa',
            text: 'Kortbetalning, Swish och kassaregister. Allt här tas i bruk direkt, så sidan har ingen Spara-knapp.',
          },
          {
            key: 'anslutningar',
            label: 'Anslutningar',
            text: 'Tjänster som Axle hämtar uppgifter från eller publicerar till.',
          },
        ],
      },
      personal,
    ];
  });

  readonly tab = signal(
    inject<{ tab?: string } | null>(DIALOG_DATA, { optional: true })?.tab ??
      this.groups()[0].items[0].key,
  );

  readonly current = computed(() =>
    this.groups()
      .flatMap((g) => g.items)
      .find((i) => i.key === this.tab()),
  );

  constructor() {
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => this.close());
    this.ref.keydownEvents().subscribe((e) => e.key === 'Escape' && this.close());
  }

  hasUnsaved(): boolean {
    return this.store.hasUnsaved();
  }

  close(): void {
    if (!this.hasUnsaved()) return this.ref.close();
    this.confirm
      .ask({
        title: 'Lämna utan att spara?',
        message: 'Du har osparade ändringar i inställningarna.',
        confirmText: 'Lämna',
        danger: true,
      })
      .subscribe((ok) => ok && this.ref.close());
  }
}

/** Öppnar inställningarna som popup. Koden laddas först nu, så den ligger utanför första paketet. */
export function openSettings(dialog: MatDialog, tab?: string): Promise<MatDialogRef<unknown>> {
  return import('./settings-module').then((m) =>
    dialog.open(m.SettingsPage, {
      data: { tab },
      width: '1240px',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '95vh',
      panelClass: 'settings-dialog',
    }),
  );
}
