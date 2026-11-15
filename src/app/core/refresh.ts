import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiCache } from './api/api-cache';
import { PageReuseStrategy } from './layout/page-reuse';
import { Todo } from './todo';

/**
 * Uppdatera: glöm det som sparats (cachen och Hem-sidorna man lämnat), hämta menyns siffror på nytt
 * och bygg upp sidan man är på igen, så att allt på den hämtas färskt.
 */
@Injectable({ providedIn: 'root' })
export class Refresh {
  private readonly cache = inject(ApiCache);
  private readonly todo = inject(Todo);
  private readonly router = inject(Router);
  private readonly reuse = inject(PageReuseStrategy);

  /** Sant medan det pågår (knappens ikon snurrar). */
  readonly busy = signal(false);

  async run(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.cache.clear();
    this.todo.refresh();
    this.reuse.reloadNext();
    try {
      await this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' });
    } finally {
      this.reuse.done();
      // Lite väntan, så att man ser att något hände även när sidan är snabb.
      setTimeout(() => this.busy.set(false), 600);
    }
  }
}
