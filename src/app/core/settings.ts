import { Injectable, signal } from '@angular/core';
import { Season } from './models';

export interface AppSettings {
  defaultView: 'auto' | 'table' | 'cards';
  pageSize: number;
  dashboardDays: number;
  defaultSeason: Season;
  defaultSupplier: string;
  defaultReorderLevel: number;
  markupPercent: number;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  defaultView: 'auto',
  pageSize: 100,
  dashboardDays: 30,
  defaultSeason: 'winter',
  defaultSupplier: '',
  defaultReorderLevel: 4,
  markupPercent: 35,
};

const KEY = 'garagestock.settings';

// Sparas lokalt tills backend har användarinställningar.
@Injectable({ providedIn: 'root' })
export class Settings {
  readonly value = signal<AppSettings>({
    ...SETTINGS_DEFAULTS,
    ...JSON.parse(localStorage.getItem(KEY) ?? '{}'),
  });

  save(next: AppSettings): void {
    localStorage.setItem(KEY, JSON.stringify(next));
    this.value.set(next);
  }

  reset(): void {
    this.save({ ...SETTINGS_DEFAULTS });
  }
}
