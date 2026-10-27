import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DocumentChoice,
  Page,
  PaymentMethod,
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
