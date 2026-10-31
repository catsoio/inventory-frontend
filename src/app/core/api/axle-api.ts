import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PricingSettings,
  StorageDefaults,
  Article,
  ArticleInput,
  ArticleQuery,
  ArticleUpdate,
  Facets,
  Company,
  Garage,
  GarageInvite,
  Season,
  GarageListItem,
  GarageMember,
  Movement,
  MovementQuery,
  Page,
  GroupedReport,
  Report,
  ReportGroupBy,
  SellerDetails,
  StockHistoryPoint,
  TradeDocument,
  TradeKind,
  TradeRow,
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

export interface CompanySettings {
  defaultMarkupPercent: number | null;
  defaultReorderLevel: number | null;
  defaultSupplier: string | null;
  defaultSeason: Season | null;
  defaultStorageFee: number | null;
  defaultHourlyRate: number | null;
  /** Snabbknappar på en kund i listan (mobil): ring, karta. */
  customerButtons: ('call' | 'map')[] | null;
}

@Injectable({ providedIn: 'root' })
export class AxleApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_URL}/inventory`;

  /** Verkstadens uppgifter på faktura och kvitto. */
  seller(): Observable<SellerDetails> {
    return this.http.get<SellerDetails>(`${this.base}/seller`);
  }

  /** Företagets gemensamma standardvärden (gäller alla användare). */
  companySettings(): Observable<CompanySettings> {
    return this.http.get<CompanySettings>(`${this.base}/settings`);
  }

  saveCompanySettings(body: Partial<CompanySettings>): Observable<CompanySettings> {
    return this.http.put<CompanySettings>(`${this.base}/settings`, body);
  }

  /** Vad en ny däckhotellsinlämning börjar med. */
  storageDefaults(): Observable<StorageDefaults> {
    return this.http.get<StorageDefaults>(`${this.base}/settings/storage`);
  }

  saveStorageDefaults(body: Partial<StorageDefaults>): Observable<StorageDefaults> {
    return this.http.put<StorageDefaults>(`${this.base}/settings/storage`, body);
  }

  /** Hur företaget prissätter och skriver ut (Prissättning). */
  pricingSettings(): Observable<PricingSettings> {
    return this.http.get<PricingSettings>(`${this.base}/settings/pricing`);
  }

  /** Ägaren ändrar prissättningen; fält som utelämnas behåller sitt värde. */
  savePricingSettings(body: Partial<PricingSettings>): Observable<PricingSettings> {
    return this.http.put<PricingSettings>(`${this.base}/settings/pricing`, body);
  }

  saveSeller(body: Partial<SellerDetails>): Observable<SellerDetails> {
    return this.http.put<SellerDetails>(`${this.base}/seller`, body);
  }

  summary(): Observable<Summary> {
    return this.http.get<Summary>(`${this.base}/summary`);
  }

  /** Filterchips med antal; ta med aktuella filter så att antalen stämmer med listan. */
  facets(query: ArticleQuery = {}): Observable<Facets> {
    return this.http.get<Facets>(`${this.base}/facets`, { params: toParams(query) });
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

  /** Försäljnings- eller inköpsloggen, högsta nummer först. */
  tradeRows(kind: TradeKind, query: { limit?: number; offset?: number } = {}) {
    return this.http.get<Page<TradeRow>>(`${this.base}/${kind}`, { params: toParams(query) });
  }

  trade(kind: TradeKind, number: number): Observable<TradeDocument> {
    return this.http.get<TradeDocument>(`${this.base}/${kind}/${number}`);
  }

  /** Bokför alla rader under ett löpnummer, allt eller inget. */
  createTrade(kind: TradeKind, body: object): Observable<TradeDocument> {
    return this.http.post<TradeDocument>(`${this.base}/${kind}`, body);
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

  /** Alla garage (bara superadmin). */
  allGarages(): Observable<GarageListItem[]> {
    return this.http.get<GarageListItem[]>(`${this.base}/garage/all`);
  }

  /** Bolagen i ägarens organisation. */
  companies(): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.base}/garage/companies`);
  }

  /** Lägger till ett bolag i samma organisation (bara superadmin). */
  addCompany(siblingGarageId: string, name: string): Observable<Company> {
    return this.http.post<Company>(`${this.base}/garage/admin/garages`, { siblingGarageId, name });
  }

  createGarage(name: string, signupCode?: string): Observable<Garage> {
    return this.http.post<Garage>(`${this.base}/garage`, { name, signupCode });
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

  /** Superadmin: nytt lösenord åt en användare (loggar ut den överallt). */
  resetMemberPassword(userId: string, password: string): Observable<unknown> {
    return this.http.post(`${this.base}/garage/members/${userId}/password`, { password });
  }

  /** Superadmin: spärra/aktivera en användare. Returnerar uppdaterad lista. */
  setMemberBlocked(userId: string, blocked: boolean): Observable<GarageMember[]> {
    return this.http.post<GarageMember[]>(
      `${this.base}/garage/members/${userId}/${blocked ? 'block' : 'unblock'}`,
      {},
    );
  }

  /** Ägare: gör en medlem till personal eller mekaniker. Returnerar uppdaterad lista. */
  setMemberRole(userId: string, role: 'staff' | 'mechanic'): Observable<GarageMember[]> {
    return this.http.patch<GarageMember[]>(`${this.base}/garage/members/${userId}/role`, { role });
  }

  removeMember(userId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/garage/members/${userId}`);
  }

  report(from?: string, to?: string): Observable<Report> {
    return this.http.get<Report>(`${this.base}/report`, { params: toParams({ from, to }) });
  }

  /** Samma rapport uppdelad per dag, vecka, märke eller artikel (säljare först för märke och artikel). */
  reportBy(groupBy: ReportGroupBy, from?: string, to?: string): Observable<GroupedReport> {
    return this.http.get<GroupedReport>(`${this.base}/report`, {
      params: toParams({ groupBy, from, to }),
    });
  }

  /** Lagrets antal och värde i slutet av varje dag (bara ägare). */
  stockHistory(from?: string, to?: string): Observable<StockHistoryPoint[]> {
    return this.http.get<StockHistoryPoint[]>(`${this.base}/summary/history`, {
      params: toParams({ from, to }),
    });
  }
}
