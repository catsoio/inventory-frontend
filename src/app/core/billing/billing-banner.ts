import { Component, computed, effect, inject } from '@angular/core';
import { Auth } from '../auth/auth';
import { Billing } from './billing';

/** Smal rad längst ner som talar om hur länge provperioden räcker eller vad som saknas. */
@Component({
  selector: 'app-billing-banner',
  standalone: false,
  styles: `
    .bar {
      position: fixed;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 8px 20px;
      border-radius: var(--radius-ui);
      background: #1c1b1f;
      color: #fff;
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
      max-width: 95vw;
      font-size: 14px;
    }
    .bar.warn {
      background: #b3261e;
    }
  `,
  template: `
    @if (message(); as m) {
      <div class="bar" [class.warn]="warn()" role="status">
        <span>{{ m }}</span>
        <button mat-flat-button (click)="billing.openPlans()">
          {{ warn() ? 'Välj plan' : 'Se planer' }}
        </button>
      </div>
    }
  `,
})
export class BillingBanner {
  readonly billing = inject(Billing);
  private readonly auth = inject(Auth);

  constructor() {
    effect(() => {
      // Plattformsoperatörer tittar i andras garage; deras status är inte garagets.
      if (this.auth.garage() && !this.auth.isSuperAdmin()) this.billing.refresh();
    });
  }

  readonly warn = computed(() => {
    const s = this.billing.status();
    return !!s && (this.billing.blocked() || s.state === 'past_due');
  });

  readonly message = computed(() => {
    const s = this.billing.status();
    if (!s || this.auth.isSuperAdmin()) return null;
    switch (s.state) {
      case 'trial':
        return s.enforced
          ? `Provperiod: ${s.trialDaysLeft} ${s.trialDaysLeft === 1 ? 'dag' : 'dagar'} kvar`
          : null;
      case 'trial_expired':
        return s.enforced ? 'Provperioden har gått ut. Välj en plan för att fortsätta.' : null;
      case 'canceled':
        return s.enforced ? 'Abonnemanget är avslutat. Välj en plan för att fortsätta.' : null;
      case 'past_due':
        return 'Betalningen gick inte igenom. Uppdatera betalsättet.';
      default:
        return null;
    }
  });
}
