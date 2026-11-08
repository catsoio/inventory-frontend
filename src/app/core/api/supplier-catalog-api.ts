import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Article,
  CatalogHit,
  CatalogItem,
  CatalogOrder,
  GummigrossenStatus,
  PurchaseCard,
  SupplierStatus,
} from '../models';

/** Verkstadens grossist (Gummigrossen): inloggningen, katalogen och de tidigare beställningarna. */
@Injectable({ providedIn: 'root' })
export class SupplierCatalogApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;
  private readonly cat = `${this.base}/supplier-catalog/gummigrossen`;

  /** Ägarens inställning. */
  settings(): Observable<GummigrossenStatus> {
    return this.http.get<GummigrossenStatus>(`${this.base}/settings/gummigrossen`);
  }

  save(customerNo: string, password: string): Observable<GummigrossenStatus> {
    return this.http.put<GummigrossenStatus>(`${this.base}/settings/gummigrossen`, {
      customerNo,
      password,
    });
  }

  clear(): Observable<GummigrossenStatus> {
    return this.http.delete<GummigrossenStatus>(`${this.base}/settings/gummigrossen`);
  }

  /** Läsbar även för personalen, så att sökningen bara visas när grossisten är ansluten. */
  status(): Observable<SupplierStatus> {
    return this.http.get<SupplierStatus>(`${this.cat}/status`);
  }

  search(q: string): Observable<CatalogHit[]> {
    return this.http.get<CatalogHit[]>(`${this.cat}/search`, {
      params: new HttpParams().set('q', q),
    });
  }

  item(id: string): Observable<CatalogHit> {
    return this.http.get<CatalogHit>(`${this.cat}/items/${id}`);
  }

  /** Verkstadens artikel för produkten: hittas på streckkod, annars skapas den ur katalogen. */
  adopt(
    id: string,
  ): Observable<{ article: Article; created: boolean; item: CatalogItem; supplierId: string }> {
    return this.http.post<{
      article: Article;
      created: boolean;
      item: CatalogItem;
      supplierId: string;
    }>(`${this.cat}/items/${id}/adopt`, {});
  }

  orders(skip = 0, take = 10): Observable<{ count: number; items: CatalogOrder[] }> {
    return this.http.get<{ count: number; items: CatalogOrder[] }>(`${this.cat}/orders`, {
      params: new HttpParams().set('skip', skip).set('take', take),
    });
  }

  importOrder(id: string): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(`${this.cat}/orders/${id}/import`, {});
  }
}
