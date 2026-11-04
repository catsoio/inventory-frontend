import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentAccount, PaymentReader, PaymentRow } from '../models';

/** Betalningar via Stripe: verkstadens konto, kortläsare och betalningarna på ett säljkort. */
@Injectable({ providedIn: 'root' })
export class PaymentApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/payments`;

  account(): Observable<PaymentAccount> {
    return this.http.get<PaymentAccount>(`${this.base}/account`);
  }

  /** Startar (eller fortsätter) registreringen hos Stripe; svaret är adressen att skicka ägaren till. */
  connect(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/account/connect`, {});
  }

  setSwish(enabled: boolean): Observable<PaymentAccount> {
    return this.http.patch<PaymentAccount>(`${this.base}/account/swish`, { enabled });
  }

  readers(): Observable<PaymentReader[]> {
    return this.http.get<PaymentReader[]>(`${this.base}/readers`);
  }

  registerReader(registrationCode: string, label: string): Observable<unknown> {
    return this.http.post(`${this.base}/readers`, { registrationCode, label });
  }

  forCard(cardId: string): Observable<PaymentRow[]> {
    return this.http.get<PaymentRow[]>(`${this.base}/cards/${cardId}`);
  }

  /** Skickar kortets belopp till läsaren. Ett utkast blir kvitto när kunden betalat. */
  startReader(cardId: string, readerId: string): Observable<PaymentRow> {
    return this.http.post<PaymentRow>(`${this.base}/cards/${cardId}/reader`, { readerId });
  }

  cancel(paymentId: string): Observable<PaymentRow> {
    return this.http.post<PaymentRow>(`${this.base}/${paymentId}/cancel`, {});
  }

  /** Bokför en betalning som kom in men inte kunde bokföras (kassaregistret var nere) en gång till. */
  retry(paymentId: string): Observable<PaymentRow> {
    return this.http.post<PaymentRow>(`${this.base}/${paymentId}/retry`, {});
  }
}
