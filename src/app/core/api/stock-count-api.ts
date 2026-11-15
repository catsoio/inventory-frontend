import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from '../models';

/** Vad en skannad kod är. Appen öppnar det, eller använder det som hyllan man räknar på. */
export type ScanHit =
  | { kind: 'deposit'; id: string; code: string; label: string }
  | {
      kind: 'location';
      warehouseId: string;
      locationId: string;
      label: string;
      warehouseKind: 'own' | 'customer';
    }
  | { kind: 'article'; id: string; code: string | null; label: string }
  | { kind: 'work_order' | 'sales_card' | 'quote'; id: string; code: string }
  | { kind: 'vehicle'; id: string; code: string; label: string }
  | { kind: 'none'; code: string };

/** Texten i en hyllettikets QR-kod. Servern känner igen den. */
export const LOCATION_CODE_PREFIX = 'HYLLA:';

export type StockCountKind = 'articles' | 'hotel';
export type StockCountStatus = 'open' | 'posted';

export interface StockCountSummary {
  lines: number;
  counted: number;
  differing: number;
  open: number;
  added: number;
  moved: number;
}

export interface StockCountHeader {
  id: string;
  number: number;
  /** INV-0007 */
  code: string;
  kind: StockCountKind;
  status: StockCountStatus;
  warehouseId: string;
  locationId: string | null;
  scopeLabel: string;
  note: string | null;
  summary: StockCountSummary;
  createdAt: string;
  postedAt: string | null;
}

export interface StockCountLine {
  id: string;
  code: string | null;
  label: string;
  detail: string | null;
  place: string | null;
  expected: number;
  counted: number | null;
  foundWarehouseId?: string | null;
  foundLocationId?: string | null;
  foundPlace?: string | null;
  added: boolean;
  /** Däckhotell: hittad på en annan hylla än registret säger. */
  moved: boolean;
}

export interface StockCount extends StockCountHeader {
  lines: StockCountLine[];
}

export interface StartStockCount {
  kind: StockCountKind;
  warehouseId: string;
  locationId?: string | null;
  note?: string | null;
}

/** Skanningsslagning och inventering. */
@Injectable({ providedIn: 'root' })
export class StockCountApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;

  scan(code: string): Observable<ScanHit> {
    return this.http.get<ScanHit>(`${this.base}/scan`, {
      params: new HttpParams().set('code', code),
    });
  }

  list(status?: StockCountStatus): Observable<Page<StockCountHeader>> {
    let params = new HttpParams().set('limit', '100');
    if (status) params = params.set('status', status);
    return this.http.get<Page<StockCountHeader>>(`${this.base}/stock-counts`, { params });
  }

  get(id: string): Observable<StockCount> {
    return this.http.get<StockCount>(`${this.base}/stock-counts/${id}`);
  }

  start(body: StartStockCount): Observable<StockCount> {
    return this.http.post<StockCount>(`${this.base}/stock-counts`, body);
  }

  /** En skanning eller ett inskrivet antal. */
  countLine(
    id: string,
    body: { refId: string; counted?: number; delta?: number; locationId?: string | null },
  ): Observable<{ line: StockCountLine; count: StockCountHeader }> {
    return this.http.put<{ line: StockCountLine; count: StockCountHeader }>(
      `${this.base}/stock-counts/${id}/lines`,
      body,
    );
  }

  clearLine(id: string, refId: string): Observable<StockCountHeader> {
    return this.http.delete<StockCountHeader>(`${this.base}/stock-counts/${id}/lines/${refId}`);
  }

  post(id: string, zeroUncounted = false): Observable<StockCount> {
    return this.http.post<StockCount>(`${this.base}/stock-counts/${id}/post`, { zeroUncounted });
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/stock-counts/${id}`);
  }
}
