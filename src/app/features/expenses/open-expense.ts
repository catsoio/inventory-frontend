import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { ExpenseDialogData, ExpenseDialogResult } from './expense-dialog';

/**
 * Öppnar bladet för ett utlägg. Dialogen laddas först när någon vill lägga till ett kvitto, så den
 * ligger utanför första paketet. Svarar med det som hände (sparat eller borttaget) eller inget alls
 * när bladet stängdes utan ändring.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseOpener {
  private readonly dialog = inject(MatDialog);

  async open(data: ExpenseDialogData = {}): Promise<ExpenseDialogResult | undefined> {
    const { ExpenseDialog } = await import('./expense-dialog');
    return firstValueFrom(
      this.dialog
        .open<unknown, ExpenseDialogData, ExpenseDialogResult>(ExpenseDialog, {
          width: '560px',
          maxWidth: '100vw',
          autoFocus: false,
          data,
        })
        .afterClosed(),
    );
  }
}
