import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Article,
  ArticleInput,
  ArticleQuery,
  ArticleUpdate,
  Facets,
  Garage,
  GarageInvite,
  GarageMember,
  Movement,
  MovementQuery,
  Page,
  Report,
  StockAction,
  Summary,
} from '../models';

export const API_URL = environment.apiUrl;

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_URL}/inventory`;

  summary(): Observable<Summary> {
    return this.http.get<Summary>(`${this.base}/summary`);
  }

  facets(): Observable<Facets> {
    return this.http.get<Facets>(`${this.base}/facets`);
  }

  articles(query: ArticleQuery = {}): Observable<Page<Article>> {
    return this.http.get<Page<Article>>(`${this.base}/articles`, { params: toParams(query) });
  }

  article(id: string): Observable<Article> {
    return this.http.get<Article>(`${this.base}/articles/${id}`);
  }

  createArticle(body: ArticleInput): Observable<Article> {
    return this.http.post<Article>(`${this.base}/articles`, body);
  }

  updateArticle(id: string, body: ArticleUpdate): Observable<Article> {
    return this.http.patch<Article>(`${this.base}/articles/${id}`, body);
  }

  archiveArticle(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/articles/${id}`);
  }

  restoreArticle(id: string): Observable<Article> {
    return this.http.post<Article>(`${this.base}/articles/${id}/restore`, {});
  }

  stockAction(id: string, action: StockAction, body: object): Observable<Article> {
    return this.http.post<Article>(`${this.base}/articles/${id}/${action}`, body);
  }

  articleMovements(id: string, query: MovementQuery = {}): Observable<Page<Movement>> {
    return this.http.get<Page<Movement>>(`${this.base}/articles/${id}/movements`, {
      params: toParams({ limit: query.limit, offset: query.offset }),
    });
  }

  movements(query: MovementQuery = {}): Observable<Page<Movement>> {
    return this.http.get<Page<Movement>>(`${this.base}/movements`, { params: toParams(query) });
  }

  garage(): Observable<Garage> {
    return this.http.get<Garage>(`${this.base}/garage`);
  }

  createGarage(name: string): Observable<Garage> {
    return this.http.post<Garage>(`${this.base}/garage`, { name });
  }

  joinGarage(code: string): Observable<Garage> {
    return this.http.post<Garage>(`${this.base}/garage/join`, { code });
  }

  createInvite(): Observable<GarageInvite> {
    return this.http.post<GarageInvite>(`${this.base}/garage/invites`, {});
  }

  members(): Observable<GarageMember[]> {
    return this.http.get<GarageMember[]>(`${this.base}/garage/members`);
  }

  removeMember(userId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/garage/members/${userId}`);
  }

  report(from?: string, to?: string): Observable<Report> {
    return this.http.get<Report>(`${this.base}/report`, { params: toParams({ from, to }) });
  }
}
