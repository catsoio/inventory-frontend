import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OnlineBookingSettings } from '../models';

/**
 * Verkstadens publika bokningssida. På/av sätter plattformens operatör (Inställningar →
 * Onlinebokning), ägaren formar sidan under Onlinebokning i menyn. Kunden bokar på verkstadens
 * webbplats (`/boka`), som `catso-sites` renderar.
 */
@Injectable({ providedIn: 'root' })
export class OnlineBookingApi {
  private readonly http = inject(HttpClient);
  private readonly settingsUrl = `${environment.apiUrl}/inventory/settings/online-booking`;

  settings(): Observable<OnlineBookingSettings> {
    return this.http.get<OnlineBookingSettings>(this.settingsUrl);
  }

  /** Ändrar det som skickas med; resten behålls. */
  saveSettings(
    body: Partial<
      Pick<OnlineBookingSettings, 'enabled' | 'intro' | 'leadDays' | 'horizonDays'>
    >,
  ): Observable<OnlineBookingSettings> {
    return this.http.put<OnlineBookingSettings>(this.settingsUrl, body);
  }

  /** Laddar upp en bild (JPEG, PNG eller WebP, högst 5 MB); svaret är filnamnet som sparas på åtgärden. */
  uploadImage(file: File): Observable<{ image: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ image: string }>(`${this.settingsUrl}/images`, body);
  }
}
