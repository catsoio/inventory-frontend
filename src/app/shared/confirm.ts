import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { ConfirmData, ConfirmDialog } from './confirm-dialog/confirm-dialog';

/** Frågar användaren innan något farligt eller svårt att ångra. Svarar true vid bekräftelse. */
@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly dialog = inject(MatDialog);

  ask(data: ConfirmData): Observable<boolean> {
    return this.dialog
      .open(ConfirmDialog, { data, width: '440px', maxWidth: '95vw' })
      .afterClosed()
      .pipe(map((ok) => ok === true));
  }
}
