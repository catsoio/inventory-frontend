import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlanId = 'dack' | 'verkstad';

export type AccessState = 'trial' | 'subscribed' | 'past_due' | 'trial_expired' | 'canceled';

export interface BillingPlan {
  id: PlanId;
  name: string;
  /** Öre per månad, exkl. moms. */
  priceMinor: number;
  includedUsers: number;
  modules: string[];
}

export interface BillingStatus {
  state: AccessState;
  plan: PlanId | null;
  /** Vad garaget får använda just nu, t.ex. 'tidsbokning'. */
  modules: string[];
  trialDaysLeft: number;
  /** Falskt medan betalning rullas ut: inget blockeras än. */
  enforced: boolean;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
  users: { current: number; included: number; extra: number; extraUserPriceMinor: number };
  plans: BillingPlan[];
}

/** Provperiod, abonnemang och vad garaget får använda. */
@Injectable({ providedIn: 'root' })
export class Billing {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly base = `${environment.apiUrl}/inventory/billing`;

  readonly status = signal<BillingStatus | null>(null);

  /** Sant när något är blockerat eller kräver åtgärd. */
  readonly blocked = computed(() => {
    const s = this.status();
    return !!s && s.enforced && (s.state === 'trial_expired' || s.state === 'canceled');
  });

  refresh(): void {
    this.http.get<BillingStatus>(this.base).subscribe({
      next: (s) => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  /** Om fliken ingår i planen. Alltid sant tills betalning är påslaget. */
  allows(module: string): boolean {
    const s = this.status();
    return !s || !s.enforced || s.modules.includes(module);
  }

  checkout(plan: PlanId): Observable<{ url: string }> {
    return this.http
      .post<{ url: string }>(`${this.base}/checkout`, { plan })
      .pipe(tap(({ url }) => (window.location.href = url)));
  }

  portal(): Observable<{ url: string }> {
    return this.http
      .post<{ url: string }>(`${this.base}/portal`, {})
      .pipe(tap(({ url }) => (window.location.href = url)));
  }

  openPlans(): void {
    // Importeras här så att dialogen inte hamnar i första paketet.
    import('./plans-dialog').then(({ PlansDialog }) => {
      if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof PlansDialog)) return;
      this.dialog.open(PlansDialog, { width: '720px', maxWidth: '95vw' });
    });
  }
}
