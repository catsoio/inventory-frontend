import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from '../models';

export type TowKind = 'tow' | 'roadside' | 'transport';
export type TowStatus = 'new' | 'on_the_way' | 'done' | 'cancelled';

export const TOW_KIND_LABELS: Record<TowKind, string> = {
  tow: 'Bärgning',
  roadside: 'Vägassistans',
  transport: 'Transport',
};

export const TOW_STATUS_LABELS: Record<TowStatus, string> = {
  new: 'Ny',
  on_the_way: 'På väg',
  done: 'Klar',
  cancelled: 'Avbruten',
};

export interface TowJob {
  id: string;
  number: number;
  /** BG-00007 */
  code: string;
  kind: TowKind;
  status: TowStatus;
  customerName: string;
  phone: string | null;
  regNo: string | null;
  vehicle: string | null;
  pickupAddress: string | null;
  destination: string | null;
  note: string | null;
  requestedAt: string;
  closedAt: string | null;
}

export interface TowJobInput {
  kind?: TowKind;
  status?: TowStatus;
  customerName?: string;
  phone?: string | null;
  regNo?: string | null;
  vehicle?: string | null;
  pickupAddress?: string | null;
  destination?: string | null;
  note?: string | null;
}

export interface TowSummary extends Record<TowStatus, number> {
  open: number;
}

/** Bärgning och vägassistans: uppdragen från samtal till klart. */
@Injectable({ providedIn: 'root' })
export class TowApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/tow-jobs`;

  list(f: { q?: string; status?: TowStatus | 'open'; limit?: number }): Observable<Page<TowJob>> {
    let params = new HttpParams().set('limit', String(f.limit ?? 100));
    if (f.q) params = params.set('q', f.q);
    if (f.status) params = params.set('status', f.status);
    return this.http.get<Page<TowJob>>(this.base, { params });
  }

  summary(): Observable<TowSummary> {
    return this.http.get<TowSummary>(`${this.base}/summary`);
  }

  get(id: string): Observable<TowJob> {
    return this.http.get<TowJob>(`${this.base}/${id}`);
  }

  create(body: TowJobInput): Observable<TowJob> {
    return this.http.post<TowJob>(this.base, body);
  }

  update(id: string, body: TowJobInput): Observable<TowJob> {
    return this.http.patch<TowJob>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
