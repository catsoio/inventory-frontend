import { Component, computed, inject, signal } from '@angular/core';
import { Auth } from '../auth/auth';
import { Billing, BillingPlan, PlanId } from './billing';

const MODULE_LABELS: Record<string, string> = {
  artiklar: 'Artiklar',
  dackhotell: 'Däckhotell',
  kunder: 'Kunder och bilar',
  tidsbokning: 'Tidsbokning',
  arbetsorder: 'Arbetsorder',
  bokforing: 'Bokföring',
};

@Component({
  selector: 'app-plans-dialog',
  standalone: false,
  styles: `
    .plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .plan {
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .plan.current {
      border-color: var(--mat-sys-primary, #333);
    }
    .price {
      font-size: 28px;
      font-weight: 600;
    }
    .price small {
      font-size: 13px;
      font-weight: 400;
      opacity: 0.7;
    }
    ul {
      margin: 8px 0;
      padding-left: 18px;
      flex: 1;
    }
    .note {
      opacity: 0.75;
      font-size: 13px;
    }
  `,
  template: `
    <h2 mat-dialog-title>{{ title() }}</h2>
    <mat-dialog-content>
      @if (billing.status(); as s) {
        <p class="note">
          Priserna är per månad och exkl. moms. {{ s.users.current }} användare i garaget; extra
          användare kostar {{ s.users.extraUserPriceMinor | kr }} per månad.
        </p>
        <div class="plans">
          @for (p of s.plans; track p.id) {
            <div class="plan" [class.current]="s.state === 'subscribed' && s.plan === p.id">
              <strong>{{ p.name }}</strong>
              <div class="price">{{ p.priceMinor | kr }} <small>/ mån</small></div>
              <ul>
                <li>{{ p.includedUsers }} användare ingår</li>
                @for (m of p.modules; track m) {
                  <li>{{ label(m) }}</li>
                }
              </ul>
              @if (auth.isAdmin()) {
                <button
                  mat-flat-button
                  [disabled]="busy()"
                  (click)="choose(p)"
                  [color]="p.id === 'verkstad' ? 'primary' : undefined"
                >
                  {{ s.state === 'subscribed' && s.plan === p.id ? 'Din plan' : 'Välj ' + p.name }}
                </button>
              }
            </div>
          }
        </div>
        @if (!auth.isAdmin()) {
          <p class="note">Bara garagets ägare kan välja plan. Be ägaren att göra det.</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (billing.status()?.hasPaymentMethod && auth.isAdmin()) {
        <button mat-button [disabled]="busy()" (click)="manage()">Hantera abonnemang</button>
      }
      <button mat-button mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class PlansDialog {
  readonly billing = inject(Billing);
  readonly auth = inject(Auth);
  readonly busy = signal(false);

  readonly title = computed(() => {
    const s = this.billing.status();
    if (s?.state === 'trial') return `Provperiod: ${s.trialDaysLeft} dagar kvar`;
    if (s?.state === 'trial_expired') return 'Provperioden har gått ut';
    if (s?.state === 'past_due') return 'Betalningen gick inte igenom';
    if (s?.state === 'canceled') return 'Abonnemanget är avslutat';
    return 'Din plan';
  });

  label = (m: string) => MODULE_LABELS[m] ?? m;

  choose(plan: BillingPlan): void {
    this.go(this.billing.checkout(plan.id as PlanId));
  }

  manage(): void {
    this.go(this.billing.portal());
  }

  private go(request: ReturnType<Billing['portal']>): void {
    this.busy.set(true);
    request.subscribe({ error: () => this.busy.set(false) });
  }
}
