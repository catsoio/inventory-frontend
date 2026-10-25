import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ArticleType, Warehouse } from '../models';

interface Archived {
  archived: boolean;
}

/** Artikeltyper och lager: två vanliga register som artikelkortet pekar på. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;

  private flag(includeArchived: boolean) {
    return new HttpParams().set('includeArchived', String(includeArchived));
  }

  articleTypes(includeArchived = false): Observable<ArticleType[]> {
    return this.http.get<ArticleType[]>(`${this.base}/article-types`, {
      params: this.flag(includeArchived),
    });
  }

  createArticleType(body: Partial<ArticleType>): Observable<ArticleType> {
    return this.http.post<ArticleType>(`${this.base}/article-types`, body);
  }

  updateArticleType(id: string, body: Partial<ArticleType>): Observable<ArticleType> {
    return this.http.patch<ArticleType>(`${this.base}/article-types/${id}`, body);
  }

  removeArticleType(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/article-types/${id}`);
  }

  warehouses(includeArchived = false): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>(`${this.base}/warehouses`, {
      params: this.flag(includeArchived),
    });
  }

  createWarehouse(body: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.post<Warehouse>(`${this.base}/warehouses`, body);
  }

  updateWarehouse(id: string, body: Partial<Warehouse>): Observable<Warehouse> {
    return this.http.patch<Warehouse>(`${this.base}/warehouses/${id}`, body);
  }

  removeWarehouse(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/warehouses/${id}`);
  }
}
