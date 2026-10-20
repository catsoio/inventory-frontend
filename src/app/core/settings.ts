import { Injectable, inject, signal } from '@angular/core';
import { InventoryApi } from './api/inventory-api';
import { Auth } from './auth/auth';
import { Season } from './models';

export interface AppSettings {
  defaultView: 'auto' | 'table' | 'cards';
  pageSize: number;
  dashboardDays: number;
  defaultSeason: Season;
  defaultSupplier: string;
  defaultReorderLevel: number;
  markupPercent: number;
  /** Standardavgift för däckhotell per inlämning, kr. */
  defaultStorageFee: number;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  defaultView: 'auto',
  pageSize: 100,
  dashboardDays: 30,
  defaultSeason: 'winter',
  defaultSupplier: '',
  defaultReorderLevel: 4,
  markupPercent: 35,
  defaultStorageFee: 0,
};

const KEY = 'garagestock.settings';

/** Säsong, leverantör, lagernivå, påslag och däckhotellavgift gäller hela företaget (backend, ägaren ändrar); visning och sidstorlek är personliga (webbläsaren). */
@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(Auth);

  readonly value = signal<AppSettings>({
    ...SETTINGS_DEFAULTS,
    ...JSON.parse(localStorage.getItem(KEY) ?? '{}'),
  });

  /** Hämtar företagets gemensamma värden; de sparade i backend går före det lokala. */
  loadCompany(): void {
    this.api.companySettings().subscribe((c) => {
      const next = { ...this.value() };
      if (c.defaultSeason) next.defaultSeason = c.defaultSeason;
      if (c.defaultSupplier !== null) next.defaultSupplier = c.defaultSupplier;
      if (c.defaultReorderLevel !== null) next.defaultReorderLevel = c.defaultReorderLevel;
      if (c.defaultMarkupPercent !== null) next.markupPercent = c.defaultMarkupPercent;
      if (c.defaultStorageFee !== null) next.defaultStorageFee = c.defaultStorageFee;
      this.value.set(next);
    });
  }

  save(next: AppSettings): void {
    localStorage.setItem(KEY, JSON.stringify(next));
    this.value.set(next);
    if (this.auth.isAdmin()) {
      this.api
        .saveCompanySettings({
          defaultSeason: next.defaultSeason,
          defaultSupplier: next.defaultSupplier,
          defaultReorderLevel: next.defaultReorderLevel,
          defaultMarkupPercent: next.markupPercent,
          defaultStorageFee: next.defaultStorageFee,
        })
        .subscribe();
    }
  }

  reset(): void {
    this.save({ ...SETTINGS_DEFAULTS });
  }
}
