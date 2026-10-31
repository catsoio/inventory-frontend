import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA as DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import pkg from '../../../../package.json';
import { Confirm } from '../../shared/confirm';
import { SettingsStore } from './settings-store';

export interface SettingsTab {
  key: string;
  label: string;
}

/**
 * Inställningar som en popup med flikar överst (som Ekonomi). Flikarna är grupperade efter vem det
 * gäller: Mitt konto, Företaget, Arbetssätt. Formulären ligger i `SettingsStore`, så att osparat
 * finns kvar mellan flikarna; stänger man med osparat frågar popupen först.
 */
@Component({
  selector: 'app-settings',
  standalone: false,
  providers: [SettingsStore],
  host: { class: 'flex h-full min-h-0 flex-col' },
  styles: `
    .tab.is-active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    nav {
      scrollbar-width: none;
    }
    nav::-webkit-scrollbar {
      display: none;
    }
  `,
  template: `
    <header class="flex items-center gap-2 px-5 pt-4 md:px-7">
      <h2 class="m-0 flex-1 text-xl font-semibold">Inställningar</h2>
      <button mat-icon-button type="button" aria-label="Stäng" (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </header>
    <nav
      class="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-3 whitespace-nowrap md:px-5"
      aria-label="Inställningar"
    >
      @for (t of tabs(); track t.key) {
        <button
          type="button"
          (click)="tab.set(t.key)"
          [class.is-active]="tab() === t.key"
          class="tab -mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[15px] font-medium text-gray-600 hover:text-gray-900"
        >
          {{ t.label }}
        </button>
      }
    </nav>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3 md:px-7">
      @switch (tab()) {
        @case ('visning') {
          <app-settings-view />
        }
        @case ('losenord') {
          <app-settings-password />
        }
        @case ('foretag') {
          <app-settings-company />
        }
        @case ('personal') {
          <app-settings-staff />
        }
        @case ('bolag') {
          <app-settings-companies />
        }
        @case ('prissattning') {
          <app-settings-pricing />
        }
        @case ('artiklar') {
          <app-settings-stock />
        }
        @case ('kunder') {
          <app-settings-customers />
        }
        @case ('dackhotell') {
          <app-settings-hotel />
        }
      }
      <div class="mt-6 text-xs text-gray-400 tabular-nums">Version {{ version }}</div>
    </div>
  `,
})
export class SettingsPage {
  private readonly store = inject(SettingsStore);
  private readonly ref = inject(MatDialogRef<SettingsPage>);
  private readonly confirm = inject(Confirm);
  protected readonly version = pkg.version;

  readonly tab = signal(inject<{ tab?: string } | null>(DIALOG_DATA, { optional: true })?.tab ?? 'visning');

  readonly tabs = computed<SettingsTab[]>(() => {
    const t: SettingsTab[] = [
      { key: 'visning', label: 'Visning' },
      { key: 'losenord', label: 'Lösenord' },
    ];
    if (!this.store.admin) return t;
    t.push({ key: 'foretag', label: 'Företaget' }, { key: 'personal', label: 'Personal' });
    if (this.store.showCompanies()) t.push({ key: 'bolag', label: 'Bolag' });
    t.push(
      { key: 'prissattning', label: 'Prissättning' },
      { key: 'artiklar', label: 'Artiklar och lager' },
      { key: 'kunder', label: 'Kunder' },
      { key: 'dackhotell', label: 'Däckhotell' },
    );
    return t;
  });

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
      width: '980px',
      maxWidth: '95vw',
      height: '86vh',
      maxHeight: '95vh',
      panelClass: 'settings-dialog',
    }),
  );
}
