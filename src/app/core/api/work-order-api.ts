import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnswerMethod,
  InvoiceKind,
  Page,
  PaymentMethod,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderInvoice,
  WorkOrderInput,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Arbetsorder: arbetsbladet till mekanikern, med rader. Priset gäller bara admin och kund. */
@Injectable({ providedIn: 'root' })
export class WorkOrderApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/work-orders`;

  list(
    query: {
      q?: string;
      status?: WorkOrderStatus | '';
      customerId?: string;
      vehicleId?: string;
      bookingId?: string;
      resourceId?: string;
      /** Order som ingen fått än. För mekaniker: dessa i stället för sina egna. */
      unassigned?: boolean;
      /** Ej klara order med en del som måste beställas. */
      needsAction?: boolean;
      /** Inlämnad eller hämtas från (inkl.) / till (exkl.), ISO-tid. */
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<WorkOrder>> {
    return this.http.get<Page<WorkOrder>>(this.base, { params: toParams(query) });
  }

  get(id: string): Observable<WorkOrderDetail> {
    return this.http.get<WorkOrderDetail>(`${this.base}/${id}`);
  }

  create(body: WorkOrderInput): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(this.base, body);
  }

  update(id: string, body: Partial<WorkOrderInput>): Observable<WorkOrderDetail> {
    return this.http.patch<WorkOrderDetail>(`${this.base}/${id}`, body);
  }

  /** Mekanikerns arbete: status, bocka av rader och lägga till rader utan pris. */
  progress(
    id: string,
    body: {
      status?: WorkOrderStatus;
      lines?: { id: string; done: boolean }[];
      add?: {
        description: string;
        type?: WorkOrderLineType;
        quantity?: number;
        toOrder?: boolean;
      }[];
    },
  ): Observable<WorkOrderDetail> {
    return this.http.patch<WorkOrderDetail>(`${this.base}/${id}/progress`, body);
  }

  /** Lämnar ett kostnadsförslag: beloppen frysas med giltighet och tillåten avvikelse. */
  giveQuote(id: string): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/${id}/quote`, {});
  }

  /** Kundens ja eller nej till hela kostnadsförslaget (null tar bort svaret). */
  setQuoteApproval(
    id: string,
    body: {
      status: 'approved' | 'declined' | null;
      method?: AnswerMethod;
      note?: string;
    },
  ): Observable<WorkOrderDetail> {
    return this.http.patch<WorkOrderDetail>(`${this.base}/${id}/quote/approval`, body);
  }

  /** Kundens ja eller nej till ett jobb (null tar bort svaret). */
  setApproval(
    id: string,
    jobId: string,
    body: {
      status: 'approved' | 'declined' | null;
      method?: AnswerMethod;
      note?: string;
    },
  ): Observable<WorkOrderDetail> {
    return this.http.patch<WorkOrderDetail>(`${this.base}/${id}/jobs/${jobId}/approval`, body);
  }

  /**
   * Lägger till en gammal faktura/kvitto: skapar en klar order och bokför den direkt. Ett kvitto
   * är alltid betalt och måste säga hur (`method`); en faktura kan vara betald eller obetald.
   */
  importInvoice(body: {
    customerId: string;
    vehicleId: string;
    date: string;
    performed: string;
    price: number;
    warranty?: string;
    kind?: InvoiceKind;
    /** Dagar till förfallodatum (faktura). Standard: betalningsvillkoren i Företaget. */
    paymentTermsDays?: number;
    paid?: boolean;
    method?: string;
  }): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/import-invoice`, body);
  }

  /** Utkastet till faktura/kvitto som det blir om det bokförs nu. Inget sparas. */
  invoicePreview(id: string): Observable<WorkOrderInvoice> {
    return this.http.get<WorkOrderInvoice>(`${this.base}/${id}/invoice-preview`);
  }

  /** Fakturerar (företag) eller kvitterar (privat) en klar order. Därefter är ordern låst. */
  issueInvoice(id: string, supplyDate?: string): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/${id}/invoice`, { supplyDate });
  }

  /** Markera fakturan betald (hur, och vilken dag; annars i dag) eller ångra. */
  setPaid(
    id: string,
    paid: boolean,
    method?: PaymentMethod,
    paidAt?: string,
  ): Observable<WorkOrderDetail> {
    return this.http.patch<WorkOrderDetail>(`${this.base}/${id}/payment`, {
      paid,
      method,
      paidAt,
    });
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /** Öppnar arbetsordern för en bokning; finns den redan får man den som finns. */
  fromBooking(bookingId: string): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/from-booking/${bookingId}`, {});
  }
}
