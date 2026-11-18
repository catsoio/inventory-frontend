import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiCache } from './api-cache';
import { environment } from '../../../environments/environment';
import {
  DocumentProposal,
  Page,
  PurchaseCard,
  PurchaseCardInput,
  PurchaseCardStatus,
} from '../models';

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Inköpskort: ett inköp som utkast tills det bokförs in i lagret. */
@Injectable({ providedIn: 'root' })
export class PurchaseCardApi {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(ApiCache);
  private readonly base = `${environment.apiUrl}/inventory/purchase-cards`;

  list(
    query: {
      q?: string;
      status?: PurchaseCardStatus;
      supplierId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<PurchaseCard>> {
    return this.http.get<Page<PurchaseCard>>(this.base, { params: toParams(query) });
  }

  get(id: string): Observable<PurchaseCard> {
    return this.http.get<PurchaseCard>(`${this.base}/${id}`);
  }

  create(body: PurchaseCardInput): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(this.base, body);
  }

  update(id: string, body: PurchaseCardInput): Observable<PurchaseCard> {
    return this.http.patch<PurchaseCard>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`);
  }

  post(id: string): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(`${this.base}/${id}/post`, {});
  }

  /** Lägger utkastet hos leverantören: det blir en beställning som tas emot i delar. */
  order(id: string): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(`${this.base}/${id}/order`, {});
  }

  /** Det som kom nu på en beställning; `close` stänger den fast rader saknas. */
  receive(
    id: string,
    body: {
      lines: { lineId: string; quantity: number }[];
      place?: { warehouseId: string; locationId: string } | null;
      close?: boolean;
    },
  ): Observable<PurchaseCard> {
    return this.http.post<PurchaseCard>(`${this.base}/${id}/receive`, body);
  }

  /** Hur många av varje artikel som är beställda och inte kommit, som { artikel-id: antal }. */
  onOrder(): Observable<Record<string, number>> {
    return this.cache.get(
      'purchase-cards/on-order',
      () => this.http.get<Record<string, number>>(`${this.base}/on-order`),
      { ttl: 60_000, tags: ['inventory/purchase-cards'] },
    );
  }

  drafts(): Observable<{ drafts: number; ordered: number }> {
    return this.http.get<{ drafts: number; ordered: number }>(`${this.base}/drafts`);
  }

  // --- papper: fotot på följesedeln, kvittot eller fakturan ---

  addAttachment(id: string, file: File): Observable<PurchaseCard> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<PurchaseCard>(`${this.base}/${id}/attachments`, form);
  }

  /** Pappret som fil; kräver inloggning, så det hämtas som blob och inte som länk. */
  attachment(id: string, name: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/attachments/${name}`, { responseType: 'blob' });
  }

  removeAttachment(id: string, name: string): Observable<PurchaseCard> {
    return this.http.delete<PurchaseCard>(`${this.base}/${id}/attachments/${name}`);
  }

  /** Läser ett papper (foto eller PDF) till rader med artikeln var och en troligast är. Sparar inget. */
  readDocument(file: File): Observable<DocumentProposal> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<DocumentProposal>(`${this.base}/read-document`, form);
  }
}
