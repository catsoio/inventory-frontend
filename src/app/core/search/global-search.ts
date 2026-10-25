import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Auth } from '../auth/auth';

/**
 * Öppnar sökningen från var som helst: sökknappen, startsidan och snabbtangenten. Själva dialogen
 * (och allt den hämtar) laddas först när den behövs, så den inte väger i det första paketet.
 */
@Injectable({ providedIn: 'root' })
export class GlobalSearch {
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(Auth);
  private opening = false;

  async open(): Promise<void> {
    // Mekanikern har inga register att söka i.
    if (this.auth.isMechanic() || this.opening) return;
    this.opening = true;
    try {
      const { GlobalSearchDialog } = await import('./global-search-dialog');
      if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof GlobalSearchDialog))
        return;
      this.dialog.open(GlobalSearchDialog, {
        width: '680px',
        maxWidth: '96vw',
        // Mobil: helskärm (global stil), så ingen förskjutning uppifrån.
        position: window.innerWidth >= 768 ? { top: '9vh' } : undefined,
        panelClass: 'search-dialog',
        ariaLabel: 'Sök',
      });
    } finally {
      this.opening = false;
    }
  }
}
