import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Booking, BookingInput } from '../models';

/** Tidsbokning: verkstadens kalender. */
@Injectable({ providedIn: 'root' })
export class BookingApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/bookings`;

  between(from: Date, to: Date): Observable<Booking[]> {
    const params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    return this.http.get<Booking[]>(this.base, { params });
  }

  create(body: BookingInput): Observable<Booking> {
    return this.http.post<Booking>(this.base, body);
  }

  update(id: string, body: Partial<BookingInput>): Observable<Booking> {
    return this.http.patch<Booking>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
