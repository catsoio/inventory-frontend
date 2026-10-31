import { Injectable, inject, signal } from '@angular/core';
import { AxleApi } from './api/axle-api';
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
  /** Timpris för arbete, kr inkl. moms. */
  defaultHourlyRate: number;
  /** Knappar på en kund i kundlistan (mobil). Verkstäder behöver olika; fler kan läggas till. */
  customerButtons: ('call' | 'map')[];
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
  defaultHourlyRate: 0,
  customerButtons: ['call'],
};

const KEY = 'garagestock.settings';

/** Säsong, leverantör, lagernivå, påslag och däckhotellavgift gäller hela företaget (backend, ägaren ändrar); visning och sidstorlek är personliga (webbläsaren). */
@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly api = inject(AxleApi);
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
      if (c.defaultHourlyRate !== null) next.defaultHourlyRate = c.defaultHourlyRate;
      if (c.customerButtons) next.customerButtons = c.customerButtons;
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
          defaultHourlyRate: next.defaultHourlyRate,
          customerButtons: next.customerButtons,
        })
        .subscribe();
    }
  }

  reset(): void {
    this.save({ ...SETTINGS_DEFAULTS });
  }
}
