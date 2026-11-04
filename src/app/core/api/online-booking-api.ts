import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OnlineBookingSettings,
  PublicBookingProfile,
  PublicBookingRequest,
  PublicBookingVehicleAnswer,
} from '../models';

/**
 * Verkstadens publika bokningssida. Adress och på/av sätter plattformens operatör (Inställningar →
 * Webbsida), ägaren formar sidan under Webbsida i menyn; kunden
 * använder de publika anropen utan inloggning, och adressen i länken är nyckeln.
 */
@Injectable({ providedIn: 'root' })
export class OnlineBookingApi {
  private readonly http = inject(HttpClient);
  private readonly settingsUrl = `${environment.apiUrl}/inventory/settings/online-booking`;
  private readonly publicUrl = `${environment.apiUrl}/inventory/public/booking`;

  settings(): Observable<OnlineBookingSettings> {
    return this.http.get<OnlineBookingSettings>(this.settingsUrl);
  }

  /** Ändrar det som skickas med; resten behålls. Adressen måste vara ledig (409). */
  saveSettings(
    body: Partial<
      Pick<OnlineBookingSettings, 'enabled' | 'slug' | 'intro' | 'leadDays' | 'horizonDays'>
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

  profile(slug: string): Observable<PublicBookingProfile> {
    return this.http.get<PublicBookingProfile>(`${this.publicUrl}/${encodeURIComponent(slug)}`);
  }

  vehicle(slug: string, regNo: string): Observable<PublicBookingVehicleAnswer> {
    return this.http.get<PublicBookingVehicleAnswer>(
      `${this.publicUrl}/${encodeURIComponent(slug)}/vehicle/${encodeURIComponent(regNo)}`,
    );
  }

  request(
    slug: string,
    body: PublicBookingRequest,
  ): Observable<{ code: string | null; saved: boolean }> {
    return this.http.post<{ code: string | null; saved: boolean }>(
      `${this.publicUrl}/${encodeURIComponent(slug)}/request`,
      body,
    );
  }
}
