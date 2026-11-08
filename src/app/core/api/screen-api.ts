import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ScreenStatus, ScreenStyle, ScreenView } from '../models';

/** Skärmen i verkstadens hall: ägarens av/på-knapp och själva väggsidan (utan inloggning). */
@Injectable({ providedIn: 'root' })
export class ScreenApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;

  status(): Observable<ScreenStatus> {
    return this.http.get<ScreenStatus>(`${this.base}/screen`);
  }

  enable(): Observable<ScreenStatus> {
    return this.http.put<ScreenStatus>(`${this.base}/screen`, {});
  }

  /** En ny länk; den gamla slutar fungera. */
  renew(): Observable<ScreenStatus> {
    return this.http.post<ScreenStatus>(`${this.base}/screen/renew`, {});
  }

  setStyle(style: ScreenStyle): Observable<ScreenStatus> {
    return this.http.patch<ScreenStatus>(`${this.base}/screen`, { style });
  }

  disable(): Observable<ScreenStatus> {
    return this.http.delete<ScreenStatus>(`${this.base}/screen`);
  }

  view(token: string): Observable<ScreenView> {
    return this.http.get<ScreenView>(`${this.base}/public/screen/${token}`);
  }
}
