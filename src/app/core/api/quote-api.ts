import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnswerMethod,
  Page,
  Quote,
  QuoteDetail,
  QuoteInput,
  QuoteDocStatus,
  QuotePublic,
  QuoteSendBody,
  QuoteSendResponse,
  WorkOrderDetail,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Kostnadsförslag: säljdokumentet före arbetet. Ett ja blir en (intern) arbetsorder. */
@Injectable({ providedIn: 'root' })
export class QuoteApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/quotes`;

  list(
    query: {
      q?: string;
      status?: QuoteDocStatus;
      customerId?: string;
      vehicleId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<Quote>> {
    return this.http.get<Page<Quote>>(this.base, { params: toParams(query) });
  }

  get(id: string): Observable<QuoteDetail> {
    return this.http.get<QuoteDetail>(`${this.base}/${id}`);
  }

  create(body: QuoteInput): Observable<QuoteDetail> {
    return this.http.post<QuoteDetail>(this.base, body);
  }

  update(id: string, body: Partial<QuoteInput>): Observable<QuoteDetail> {
    return this.http.patch<QuoteDetail>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /** Lämnar förslaget till kunden: beloppet och giltigheten frysas. */
  give(id: string): Observable<QuoteDetail> {
    return this.http.post<QuoteDetail>(`${this.base}/${id}/give`, {});
  }

  /** Skickar länken till kunden som SMS och/eller e-post (lämnar förslaget först om det är ett utkast). */
  send(id: string, body: QuoteSendBody): Observable<QuoteSendResponse> {
    return this.http.post<QuoteSendResponse>(`${this.base}/${id}/send`, body);
  }

  /** Stänger kundens länk. */
  revokeLink(id: string): Observable<QuoteDetail> {
    return this.http.delete<QuoteDetail>(`${this.base}/${id}/link`);
  }

  /** Kundens egen sida: ingen inloggning, nyckeln i länken är nyckeln. */
  publicView(token: string): Observable<QuotePublic> {
    return this.http.get<QuotePublic>(`${environment.apiUrl}/inventory/public/quotes/${token}`);
  }

  publicAnswer(
    token: string,
    body: { status: 'approved' | 'declined'; name?: string; note?: string },
  ): Observable<QuotePublic> {
    return this.http.post<QuotePublic>(
      `${environment.apiUrl}/inventory/public/quotes/${token}/answer`,
      body,
    );
  }

  /** Kundens ja eller nej (null tar bort svaret). */
  setApproval(
    id: string,
    body: { status: 'approved' | 'declined' | null; method?: AnswerMethod; note?: string },
  ): Observable<QuoteDetail> {
    return this.http.patch<QuoteDetail>(`${this.base}/${id}/approval`, body);
  }

  /** Flyttar förslaget en äldre arbetsorder bär till ett eget kostnadsförslag (finns det redan returneras det). */
  fromWorkOrder(workOrderId: string): Observable<QuoteDetail> {
    return this.http.post<QuoteDetail>(`${this.base}/from-work-order/${workOrderId}`, {});
  }

  /** Gör arbetsordern av ett godkänt förslag (finns den redan returneras den). */
  createWorkOrder(id: string): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/${id}/work-order`, {});
  }
}
