import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Page,
  PaymentMethod,
  StorageDeposit,
  StorageDepositInput,
  StorageQuery,
  StorageSummary,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Däckhotell: kunders egna däck och fälgar som förvaras hos verkstaden. */
@Injectable({ providedIn: 'root' })
export class StorageApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/storage`;

  summary(): Observable<StorageSummary> {
    return this.http.get<StorageSummary>(`${this.base}/summary`);
  }

  deposits(query: StorageQuery = {}): Observable<Page<StorageDeposit>> {
    return this.http.get<Page<StorageDeposit>>(this.base, { params: toParams(query) });
  }

  deposit(id: string): Observable<StorageDeposit> {
    return this.http.get<StorageDeposit>(`${this.base}/${id}`);
  }

  create(body: StorageDepositInput): Observable<StorageDeposit> {
    return this.http.post<StorageDeposit>(this.base, body);
  }

  update(id: string, body: Partial<StorageDepositInput>): Observable<StorageDeposit> {
    return this.http.patch<StorageDeposit>(`${this.base}/${id}`, body);
  }

  pay(id: string, method: PaymentMethod, paidAt?: string): Observable<StorageDeposit> {
    return this.http.post<StorageDeposit>(`${this.base}/${id}/pay`, { method, paidAt });
  }

  pickUp(id: string, body: { pickedUpAt?: string; paymentMethod?: PaymentMethod }) {
    return this.http.post<StorageDeposit>(`${this.base}/${id}/pickup`, body);
  }

  reopen(id: string): Observable<StorageDeposit> {
    return this.http.post<StorageDeposit>(`${this.base}/${id}/reopen`, {});
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
