import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CarInquiryBody,
  CarListing,
  CarListingInput,
  ListingStatus,
  PublicCar,
  PublicSiteProfile,
  SiteSettings,
} from '../models';

/** Bilhandel: bilarna verkstaden har till salu (personalen). */
@Injectable({ providedIn: 'root' })
export class CarApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/cars`;

  list(query: { status?: ListingStatus; q?: string } = {}): Observable<CarListing[]> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.q) params = params.set('q', query.q);
    return this.http.get<CarListing[]>(this.base, { params });
  }

  get(id: string): Observable<CarListing> {
    return this.http.get<CarListing>(`${this.base}/${id}`);
  }

  /** Ett nytt utkast; registret fyller i bilens uppgifter. 409 om regnumret redan finns. */
  create(regNo: string): Observable<CarListing> {
    return this.http.post<CarListing>(this.base, { regNo });
  }

  update(id: string, body: CarListingInput): Observable<CarListing> {
    return this.http.patch<CarListing>(`${this.base}/${id}`, body);
  }

  /** Läser registret igen; pris, text och bilder behålls. */
  refresh(id: string): Observable<CarListing> {
    return this.http.post<CarListing>(`${this.base}/${id}/refresh`, {});
  }

  /** Lägger bilen på Blocket eller tar ner den; den skickas medan den är till salu. */
  setBlocket(id: string, enabled: boolean): Observable<CarListing> {
    return this.http.post<CarListing>(`${this.base}/${id}/blocket`, { enabled });
  }

  /** Läser hur Blocket gick med annonsen: publicerad, nekad eller fortfarande på gång. */
  refreshBlocket(id: string): Observable<CarListing> {
    return this.http.post<CarListing>(`${this.base}/${id}/blocket/refresh`, {});
  }

  /** Lägger en bild sist (JPEG, PNG eller WebP, högst 5 MB). */
  addImage(id: string, file: File): Observable<CarListing> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<CarListing>(`${this.base}/${id}/images`, body);
  }

  /** Sparar en köpehandling (PDF eller bild, högst 10 MB) på bilen. Aldrig publik. */
  addDocument(id: string, file: File): Observable<CarListing> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<CarListing>(`${this.base}/${id}/documents`, body);
  }

  /** Filen själv; den kräver inloggning, så den hämtas hit och inte med en vanlig länk. */
  document(id: string, name: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/documents/${name}`, { responseType: 'blob' });
  }

  removeDocument(id: string, name: string): Observable<CarListing> {
    return this.http.delete<CarListing>(`${this.base}/${id}/documents/${name}`);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

/** Verkstadens webbplats: texten ägaren skriver och domänerna plattformen kopplar. */
@Injectable({ providedIn: 'root' })
export class SiteApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/site`;

  get(): Observable<SiteSettings> {
    return this.http.get<SiteSettings>(this.base);
  }

  /** `enabled` och `slug` får bara plattformens operatör ändra (403 annars). */
  save(
    body: Partial<Pick<SiteSettings, 'enabled' | 'slug' | 'title' | 'intro' | 'hideRegNo'>> & {
      /** Delar av landningssidan; servern slår ihop och kontrollerar. */
      page?: Record<string, unknown>;
    },
  ): Observable<SiteSettings> {
    return this.http.put<SiteSettings>(this.base, body);
  }

  /** Laddar upp en bild till landningssidan (JPEG, PNG eller WebP, högst 5 MB). Ger adressen att spara. */
  uploadImage(file: File): Observable<{ url: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/images`, body);
  }

  addDomain(hostname: string): Observable<SiteSettings> {
    return this.http.post<SiteSettings>(`${this.base}/domains`, { hostname });
  }

  checkDomain(hostname: string): Observable<SiteSettings> {
    return this.http.post<SiteSettings>(
      `${this.base}/domains/${encodeURIComponent(hostname)}/check`,
      {},
    );
  }

  removeDomain(hostname: string): Observable<SiteSettings> {
    return this.http.delete<SiteSettings>(`${this.base}/domains/${encodeURIComponent(hostname)}`);
  }
}

/** Besökarens sida. `site` är adressen på plattformen (en slug) eller domänen (har en punkt). */
@Injectable({ providedIn: 'root' })
export class PublicSiteApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/public/site`;

  profile(site: string): Observable<PublicSiteProfile> {
    return this.http.get<PublicSiteProfile>(`${this.base}/${encodeURIComponent(site)}`);
  }

  cars(site: string): Observable<PublicCar[]> {
    return this.http.get<PublicCar[]>(`${this.base}/${encodeURIComponent(site)}/cars`);
  }

  car(site: string, id: string): Observable<PublicCar> {
    return this.http.get<PublicCar>(`${this.base}/${encodeURIComponent(site)}/cars/${id}`);
  }

  inquire(site: string, id: string, body: CarInquiryBody): Observable<{ saved: boolean }> {
    return this.http.post<{ saved: boolean }>(
      `${this.base}/${encodeURIComponent(site)}/cars/${id}/inquiry`,
      body,
    );
  }
}
