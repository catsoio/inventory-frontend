import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, WorkOrder, WorkOrderDetail, WorkOrderInput, WorkOrderStatus } from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Arbetsorder: lappen mekanikern får, med rader och summa. */
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

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /** Öppnar arbetsordern för en bokning; finns den redan får man den som finns. */
  fromBooking(bookingId: string): Observable<WorkOrderDetail> {
    return this.http.post<WorkOrderDetail>(`${this.base}/from-booking/${bookingId}`, {});
  }
}
