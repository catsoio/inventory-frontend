import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, PurchaseCard, PurchaseCardInput } from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Inköpskort: ett inköp som utkast tills det bokförs in i lagret. */
@Injectable({ providedIn: 'root' })
export class PurchaseCardApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/purchase-cards`;

  list(
    query: {
      q?: string;
      status?: 'draft' | 'posted';
      supplierId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<PurchaseCard>> {
    return this.http.get<Page<PurchaseCard>>(this.base, { params: toParams(query) });
  }

  get(id: string): Observable<PurchaseCard> {
    return this.http.get<PurchaseCard>(`${this.base}/${id}`);
  }

  create(body: PurchaseCardInput): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(this.base, body);
  }

  update(id: string, body: PurchaseCardInput): Observable<PurchaseCard> {
    return this.http.patch<PurchaseCard>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`);
  }

  post(id: string): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(`${this.base}/${id}/post`, {});
  }

  drafts(): Observable<{ drafts: number }> {
    return this.http.get<{ drafts: number }>(`${this.base}/drafts`);
  }
}
