import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { Booking } from '../../core/models';
import { BookingDialog, BookingDialogData, BookingDialogResult } from './booking-dialog';

/**
 * Öppnar bokningsdialogen: en befintlig bokning, eller en ny (nästa hela timme om ingen tid
 * anges). Samma dialog från Hem, sökningen och kalendern.
 */
export function openBooking(
  dialog: MatDialog,
  booking: Booking | null,
  from?: Date,
): Observable<BookingDialogResult | undefined> {
  const start = booking ? new Date(booking.start) : new Date(from ?? Date.now());
  if (!booking && !from) start.setHours(start.getHours() + 1, 0, 0, 0);
  const data: BookingDialogData = {
    booking,
    start,
    end: booking ? new Date(booking.end) : new Date(start.getTime() + 3600_000),
  };
  return dialog
    .open<BookingDialog, BookingDialogData, BookingDialogResult>(BookingDialog, {
      data,
      width: '1040px',
      maxWidth: '96vw',
      panelClass: 'dialog-sheet',
    })
    .afterClosed();
}
