import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RegisterChain, RegisterEntry, RegisterStatus } from '../models';

/** Kassaregistret: uppsättning, X- och Z-rapport, journal och export. */
@Injectable({ providedIn: 'root' })
export class RegisterApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/register`;

  status(): Observable<RegisterStatus> {
    return this.http.get<RegisterStatus>(this.base);
  }

  setup(label?: string): Observable<unknown> {
    return this.http.post(`${this.base}/setup`, { label });
  }

  setActive(active: boolean): Observable<unknown> {
    return this.http.patch(`${this.base}/active`, { active });
  }

  refreshCompany(): Observable<unknown> {
    return this.http.post(`${this.base}/company`, {});
  }

  xReport(): Observable<RegisterEntry> {
    return this.http.post<RegisterEntry>(`${this.base}/x-report`, {});
  }

  zReport(): Observable<RegisterEntry> {
    return this.http.post<RegisterEntry>(`${this.base}/z-report`, {});
  }

  journal(query: { from?: string; to?: string; kind?: string } = {}): Observable<RegisterEntry[]> {
    return this.http.get<RegisterEntry[]>(`${this.base}/journal`, { params: this.params(query) });
  }

  verify(): Observable<RegisterChain> {
    return this.http.get<RegisterChain>(`${this.base}/journal/verify`);
  }

  /** Journalen som XML (SKVFS 2021:16), som en fil att spara. */
  exportXml(query: { from?: string; to?: string }): Observable<Blob> {
    return this.http.get(`${this.base}/journal/export`, {
      params: this.params(query),
      responseType: 'blob',
    });
  }

  copy(receiptNumber: number): Observable<RegisterEntry> {
    return this.http.post<RegisterEntry>(`${this.base}/receipts/${receiptNumber}/copy`, {});
  }

  private params(query: object): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(query)) if (v) p = p.set(k, String(v));
    return p;
  }
}
