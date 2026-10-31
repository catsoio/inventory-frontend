import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DocumentChoice,
  Page,
  PaymentMethod,
  PublicDocument,
  SalesCardDetail,
  SalesCardInput,
  SalesCardItem,
  WorkOrderInvoice,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Säljkort: en affär med rader, rabatt, faktura eller kvitto och betalning. */
@Injectable({ providedIn: 'root' })
export class SalesCardApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/sales-cards`;

  list(
    query: {
      q?: string;
      status?: 'draft' | 'posted';
      customerId?: string;
      vehicleId?: string;
      workOrderId?: string;
      /** true = betalda, false = bokförda men obetalda. */
      paid?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<SalesCardItem>> {
    return this.http.get<Page<SalesCardItem>>(this.base, { params: toParams(query) });
  }

  /** Mejlar det bokförda dokumentet som en länk. En adress som skrivs in sparas på kunden om den saknar. */
  send(id: string, body: { email?: string; note?: string }): Observable<SalesCardDetail> {
    return this.http.post<SalesCardDetail>(`${this.base}/${id}/send`, body);
  }

  /** Kundens sida: dokumentet bakom länken, utan inloggning. */
  publicDocument(token: string): Observable<PublicDocument> {
    return this.http.get<PublicDocument>(
      `${environment.apiUrl}/inventory/public/documents/${token}`,
    );
  }

  get(id: string): Observable<SalesCardDetail> {
    return this.http.get<SalesCardDetail>(`${this.base}/${id}`);
  }

  create(body: SalesCardInput): Observable<SalesCardDetail> {
    return this.http.post<SalesCardDetail>(this.base, body);
  }

  update(id: string, body: SalesCardInput): Observable<SalesCardDetail> {
    return this.http.patch<SalesCardDetail>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /**
   * Bokför: lagret minskas och faktura eller kvitto utfärdas. Därefter är kortet låst. En faktura
   * lämnas obetald; ett kvitto betalas direkt och måste säga hur. Utan val följer dokumentet kunden
   * (företag = faktura, annars kvitto).
   */
  post(id: string, choice: DocumentChoice = {}): Observable<SalesCardDetail> {
    return this.http.post<SalesCardDetail>(`${this.base}/${id}/post`, choice);
  }

  /**
   * Återöppnar ett bokfört, obetalt kort (ägaren): delarna läggs tillbaka i lagret, dokumentet
   * dras tillbaka och fakturanumret sparas till nästa bokföring.
   */
  reopen(id: string): Observable<SalesCardDetail> {
    return this.http.post<SalesCardDetail>(`${this.base}/${id}/reopen`, {});
  }

  /** Utkastet till dokumentet som det blir om kortet bokförs nu med de här valen. Inget sparas. */
  preview(id: string, choice: DocumentChoice = {}): Observable<WorkOrderInvoice> {
    return this.http.get<WorkOrderInvoice>(`${this.base}/${id}/preview`, {
      params: toParams(choice),
    });
  }

  /** Markera betald (hur, och vilken dag; annars i dag) eller ångra. */
  setPaid(
    id: string,
    paid: boolean,
    method?: PaymentMethod,
    paidAt?: string,
  ): Observable<SalesCardDetail> {
    return this.http.patch<SalesCardDetail>(`${this.base}/${id}/payment`, {
      paid,
      method,
      paidAt,
    });
  }
}
