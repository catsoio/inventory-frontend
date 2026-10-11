import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Closing,
  ClosingEntry,
  ClosingEntryKind,
  ClosingPreview,
  ClosingStatusInfo,
  Page,
  ResetPreview,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Bokföring: stäng en period, arkivera den och lås den. */
@Injectable({ providedIn: 'root' })
export class ClosingApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/closings`;

  status(): Observable<ClosingStatusInfo> {
    return this.http.get<ClosingStatusInfo>(`${this.base}/status`);
  }

  /** `from`/`to`: YYYY-MM-DD (hela dagar, `to` inklusive) eller ISO-tidpunkt. Tomt `to` = nu. */
  preview(period: { from?: string; to?: string }): Observable<ClosingPreview> {
    return this.http.get<ClosingPreview>(`${this.base}/preview`, { params: toParams(period) });
  }

  close(body: { from?: string; to?: string; note?: string }): Observable<Closing> {
    return this.http.post<Closing>(this.base, body);
  }

  list(limit = 100, offset = 0): Observable<Page<Closing>> {
    return this.http.get<Page<Closing>>(this.base, { params: toParams({ limit, offset }) });
  }

  get(id: string): Observable<Closing> {
    return this.http.get<Closing>(`${this.base}/${id}`);
  }

  entries<T = Record<string, any>>(
    id: string,
    kind: ClosingEntryKind,
    opts: { sub?: string; limit?: number; offset?: number } = {},
  ): Observable<Page<ClosingEntry<T>>> {
    return this.http.get<Page<ClosingEntry<T>>>(`${this.base}/${id}/entries`, {
      params: toParams({ kind, ...opts }),
    });
  }

  /** Superadmin: annullera senaste bokföringen så att perioden kan bokföras om. */
  void(id: string, reason?: string): Observable<Closing> {
    return this.http.post<Closing>(`${this.base}/${id}/void`, { reason });
  }

  /** Superadmin. */
  resetPreview(): Observable<ResetPreview> {
    return this.http.get<ResetPreview>(`${this.base}/reset/preview`);
  }

  /** Superadmin: bokför allt till nu och nollställ sedan garagets data. */
  reset(body: {
    confirmName: string;
    keepStoredDeposits: boolean;
    note?: string;
  }): Observable<Closing> {
    return this.http.post<Closing>(`${this.base}/reset`, body);
  }
}
