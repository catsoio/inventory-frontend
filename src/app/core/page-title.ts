import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { Auth } from './auth/auth';

export const APP_NAME = 'Däcklager';

/**
 * Fliktitel och favicon. Titeln blir "Sida · Garage" (t.ex. "Artiklar · Däckcenter Stockholm AB"),
 * och favicon blir orange när en superadmin tittar i någon annans garage.
 */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly doc = inject(DOCUMENT);
  private readonly auth = inject(Auth);

  /** Sidans namn; sätts av routern, eller av en detaljvy när posten har laddats. */
  readonly page = signal<string | null>(null);

  constructor() {
    effect(() => {
      const parts = [this.page(), this.auth.garage()?.name ?? APP_NAME].filter(Boolean);
      this.doc.title = parts.join(' · ');
      const icon = this.doc.getElementById('app-icon') as HTMLLinkElement | null;
      if (icon) icon.href = this.auth.viewingOther() ? 'favicon-other-64.png' : 'favicon-64.png';
    });
  }
}

/** Läser `title` från rutterna och lämnar över till {@link PageTitle}. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(PageTitle);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.page.set(this.buildTitle(snapshot) ?? null);
  }
}
