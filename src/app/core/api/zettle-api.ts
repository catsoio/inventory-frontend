import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Page,
  PaymentRow,
  PosProduct,
  PosSale,
  ZettleStatus,
  ZettleSyncResult,
  ZettleTerminalLink,
  ZettleTerminalStatus,
} from '../models';

/**
 * PayPal-kassan (PayPal Point of Sale, tidigare Zettle) bredvid Axle: kopplingen, köpen som slagits
 * in där och lästs in hit, och artiklarna som ligger i kassans produktlista.
 */
@Injectable({ providedIn: 'root' })
export class ZettleApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/zettle`;

  status(): Observable<ZettleStatus> {
    return this.http.get<ZettleStatus>(`${this.base}/connection`);
  }

  connect(clientId: string, apiKey: string): Observable<ZettleStatus> {
    return this.http.put<ZettleStatus>(`${this.base}/connection`, { clientId, apiKey });
  }

  disconnect(): Observable<ZettleStatus> {
    return this.http.delete<ZettleStatus>(`${this.base}/connection`);
  }

  /** Läser in nya köp från kassan nu (annars sker det av sig självt med några minuters mellanrum). */
  sync(): Observable<ZettleSyncResult> {
    return this.http.post<ZettleSyncResult>(`${this.base}/sync`, {});
  }

  sales(
    q: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ): Observable<Page<PosSale>> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<Page<PosSale>>(`${this.base}/sales`, { params });
  }

  /** Köp de senaste två dagarna som inte redan betalar ett säljkort (personalen väljer bland dem). */
  openSales(): Observable<PosSale[]> {
    return this.http.get<PosSale[]>(`${this.base}/open-sales`);
  }

  /** Bokför utkastet som betalt med köpet i kassan. */
  payCard(saleId: string, cardId: string): Observable<unknown> {
    return this.http.post(`${this.base}/sales/${saleId}/pay-card`, { cardId });
  }

  products(): Observable<PosProduct[]> {
    return this.http.get<PosProduct[]>(`${this.base}/products`);
  }

  addProducts(articleIds: string[]): Observable<PosProduct[]> {
    return this.http.post<PosProduct[]>(`${this.base}/products`, { articleIds });
  }

  pushProducts(): Observable<PosProduct[]> {
    return this.http.post<PosProduct[]>(`${this.base}/products/push`, {});
  }

  removeProduct(articleId: string): Observable<PosProduct[]> {
    return this.http.delete<PosProduct[]>(`${this.base}/products/${articleId}`);
  }

  /** Bara dev (låtsaskassan): slår in ett kortköp av artiklar som ligger i kassan och läser in det. */
  devPurchase(articleIds: string[], quantity = 1): Observable<ZettleSyncResult> {
    return this.http.post<ZettleSyncResult>(`${this.base}/dev/purchase`, { articleIds, quantity });
  }

  // ---- PayPal-terminalen (Reader Connect): kort på terminalen, startat härifrån ----

  terminals(): Observable<ZettleTerminalStatus> {
    return this.http.get<ZettleTerminalStatus>(`${this.base}/terminal`);
  }

  /** Kopplar terminalen som visar koden på sin skärm till verkstadens Zettle-konto. */
  linkTerminal(code: string, name: string): Observable<ZettleTerminalLink> {
    return this.http.post<ZettleTerminalLink>(`${this.base}/terminal/link`, { code, name });
  }

  unlinkTerminal(linkId: string): Observable<ZettleTerminalStatus> {
    return this.http.delete<ZettleTerminalStatus>(`${this.base}/terminal/${linkId}`);
  }

  /** Skickar kortets belopp till terminalen; betalningen följs sedan via `PaymentApi.forCard`. */
  payOnTerminal(
    cardId: string,
    linkId: string,
    document?: 'invoice' | 'receipt',
  ): Observable<PaymentRow> {
    return this.http.post<PaymentRow>(`${this.base}/terminal/pay`, {
      cardId,
      linkId,
      ...(document ? { document } : {}),
    });
  }

  /** Ber terminalen avbryta; betalningen tar slut när terminalen svarat. */
  cancelTerminalPayment(paymentId: string): Observable<PaymentRow | null> {
    return this.http.post<PaymentRow | null>(
      `${this.base}/terminal/payments/${paymentId}/cancel`,
      {},
    );
  }

  /** Bara dev (låtsasterminalen): kunden blippar (`tap`), banken nekar (`decline`) eller kontakten bryts (`lose`). */
  devTerminal(paymentId: string, outcome: 'tap' | 'decline' | 'lose'): Observable<unknown> {
    return this.http.post(`${this.base}/dev/terminal/${paymentId}/${outcome}`, {});
  }
}
