import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, PosProduct, PosSale, ZettleStatus, ZettleSyncResult } from '../models';

/**
 * PayPal-kassan (PayPal Point of Sale, tidigare Zettle) bredvid Axle: kopplingen, köpen som slagits
 * in där och lästs in hit, och artiklarna som ligger i kassans produktlista.
 */
@Injectable({ providedIn: 'root' })
export class ZettleApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/zettle`;

  status(): Observable<ZettleStatus> {
    return this.http.get<ZettleStatus>(`${this.base}/connection`);
  }

  connect(clientId: string, apiKey: string): Observable<ZettleStatus> {
    return this.http.put<ZettleStatus>(`${this.base}/connection`, { clientId, apiKey });
  }

  disconnect(): Observable<ZettleStatus> {
    return this.http.delete<ZettleStatus>(`${this.base}/connection`);
  }

  /** Läser in nya köp från kassan nu (annars sker det av sig självt med några minuters mellanrum). */
  sync(): Observable<ZettleSyncResult> {
    return this.http.post<ZettleSyncResult>(`${this.base}/sync`, {});
  }

  sales(
    q: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ): Observable<Page<PosSale>> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<Page<PosSale>>(`${this.base}/sales`, { params });
  }

  products(): Observable<PosProduct[]> {
    return this.http.get<PosProduct[]>(`${this.base}/products`);
  }

  addProducts(articleIds: string[]): Observable<PosProduct[]> {
    return this.http.post<PosProduct[]>(`${this.base}/products`, { articleIds });
  }

  pushProducts(): Observable<PosProduct[]> {
    return this.http.post<PosProduct[]>(`${this.base}/products/push`, {});
  }

  removeProduct(articleId: string): Observable<PosProduct[]> {
    return this.http.delete<PosProduct[]>(`${this.base}/products/${articleId}`);
  }

  /** Bara dev (låtsaskassan): slår in ett kortköp av artiklar som ligger i kassan och läser in det. */
  devPurchase(articleIds: string[], quantity = 1): Observable<ZettleSyncResult> {
    return this.http.post<ZettleSyncResult>(`${this.base}/dev/purchase`, { articleIds, quantity });
  }
}
