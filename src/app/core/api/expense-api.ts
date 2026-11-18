import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Auth } from '../auth/auth';
import { Page } from '../models';

export type ExpenseVatRate = 0 | 6 | 12 | 25;
export const EXPENSE_VAT_RATES: ExpenseVatRate[] = [25, 12, 6, 0];

/** `company_card` = betalt med företagets kort, `private` = betalt av personen och ska ersättas. */
export type ExpensePaidWith = 'company_card' | 'private';
export type ExpenseStatus = 'open' | 'exported';

export const EXPENSE_PAID_WITH_LABELS: Record<ExpensePaidWith, string> = {
  company_card: 'Företagskort',
  private: 'Privat (ersätts)',
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  open: 'Ej överlämnat',
  exported: 'Överlämnat',
};

/** Den del av kvittot som har en momssats. Öre. */
export interface ExpenseVat {
  rate: ExpenseVatRate;
  /** Momsen i beloppet. */
  vat: number;
  /** Beloppet med moms. */
  gross: number;
}

export interface ExpenseAttachment {
  name: string;
  label: string;
  type: string;
  size: number;
  addedAt: string;
}

/**
 * Ett utlägg: ett kvitto för något som köpts vid sidan av, sparat för bokföringen och revisorn.
 * Bara internt: aldrig lager, inköp eller något som går vidare till en kund.
 */
export interface Expense {
  id: string;
  number: number;
  /** UTL-00042 */
  code: string;
  supplier: string;
  receiptNo: string | null;
  /** ÅÅÅÅ-MM-DD */
  date: string;
  /** Öre inkl. moms. */
  totalIncl: number;
  vat: ExpenseVat[];
  paidWith: ExpensePaidWith;
  paidBy: string;
  paidByName: string | null;
  note: string | null;
  workOrder: { id: string; code: string | null } | null;
  vehicle: { id: string; regNo: string | null } | null;
  attachments: ExpenseAttachment[];
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  status: ExpenseStatus;
  exportedAt: string | null;
}

export interface ExpenseInput {
  supplier: string;
  receiptNo?: string | null;
  date: string;
  totalIncl: number;
  vat: ExpenseVat[];
  paidWith: ExpensePaidWith;
  note?: string | null;
  workOrderId?: string | null;
  vehicleId?: string | null;
}

export interface ExpenseFilter {
  from?: string;
  to?: string;
  q?: string;
  workOrderId?: string;
  paidWith?: ExpensePaidWith;
  status?: ExpenseStatus;
  limit?: number;
  offset?: number;
}

export interface ExpenseSummary {
  count: number;
  total: number;
  byRate: { rate: ExpenseVatRate; gross: number; vat: number }[];
  vat: number;
  byPaidWith: { paidWith: ExpensePaidWith; count: number; total: number }[];
  /** Hur många som väntar på att lämnas till revisorn, och hur många som är lämnade. */
  byStatus: { open: number; exported: number };
}

/** Det som lästes ur ett kvitto. Inget är sparat. */
export interface ExpenseProposal {
  /** Läsningen är avstängd här och det här är ett exempel, inte vad kvittot säger. */
  demo: boolean;
  supplier: string | null;
  receiptNo: string | null;
  date: string | null;
  totalInclVat: number | null;
  vat: ExpenseVat[];
  /** Momsraderna stämde inte med totalen (eller saknades): kontrollera dem. */
  vatMismatch: boolean;
  payment: 'card' | 'cash' | 'swish' | 'other' | null;
}

/** Momsen i ett belopp med moms: belopp × sats ÷ (100 + sats), i hela öre. */
export const vatOfGross = (gross: number, rate: number) =>
  Math.round((gross * rate) / (100 + rate));

/**
 * Utlägg. Ägare och personal når alla; en mekaniker når bara sina egna, genom en egen adress
 * (`my-expenses`) som aldrig ger summor eller andras utlägg.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private get base() {
    const path = this.auth.isMechanic() ? 'my-expenses' : 'expenses';
    return `${environment.apiUrl}/inventory/${path}`;
  }

  list(f: ExpenseFilter): Observable<Page<Expense>> {
    return this.http.get<Page<Expense>>(this.base, { params: this.params({ limit: 100, ...f }) });
  }

  /** Summor och moms per sats (ägare och personal). */
  summary(f: ExpenseFilter): Observable<ExpenseSummary> {
    return this.http.get<ExpenseSummary>(`${this.base}/summary`, { params: this.params(f) });
  }

  get(id: string): Observable<Expense> {
    return this.http.get<Expense>(`${this.base}/${id}`);
  }

  create(body: ExpenseInput): Observable<Expense> {
    return this.http.post<Expense>(this.base, body);
  }

  /** `force`: ägaren ändrar uttryckligen ett utlägg som redan lämnats till revisorn. */
  update(id: string, body: Partial<ExpenseInput>, force = false): Observable<Expense> {
    return this.http.patch<Expense>(`${this.base}/${id}`, body, { params: this.force(force) });
  }

  remove(id: string, force = false): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`, { params: this.force(force) });
  }

  // --- kvittot: fotot eller PDF:en ---

  addAttachment(id: string, file: File, force = false): Observable<Expense> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Expense>(`${this.base}/${id}/attachments`, form, {
      params: this.force(force),
    });
  }

  /** Kvittot som fil; kräver inloggning, så det hämtas som blob och inte som länk. */
  attachment(id: string, name: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/attachments/${name}`, { responseType: 'blob' });
  }

  removeAttachment(id: string, name: string, force = false): Observable<Expense> {
    return this.http.delete<Expense>(`${this.base}/${id}/attachments/${name}`, {
      params: this.force(force),
    });
  }

  /** Läser ett kvitto (foto eller PDF) till ett förslag. Sparar inget. */
  read(file: File): Observable<ExpenseProposal> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ExpenseProposal>(`${this.base}/read`, form);
  }

  // --- till revisorn (ägare och personal) ---

  /** En period som zip (kvittona och utlagg.csv) eller bara kalkylbladet. */
  exportPeriod(from: string, to: string, format: 'zip' | 'csv' = 'zip'): Observable<Blob> {
    return this.http.get(`${this.base}/export`, {
      params: this.params({ from, to, format }),
      responseType: 'blob',
    });
  }

  markExported(from: string, to: string): Observable<{ marked: number }> {
    return this.http.post<{ marked: number }>(`${this.base}/mark-exported`, { from, to });
  }

  /** `?force=true` bara för ägaren; servern ignorerar det för alla andra. */
  private force(force: boolean): HttpParams {
    return force && !this.auth.isMechanic()
      ? new HttpParams().set('force', 'true')
      : new HttpParams();
  }

  private params(query: object): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') p = p.set(k, String(v));
    return p;
  }
}
