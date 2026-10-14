import { Component, computed, effect, inject } from '@angular/core';
import { Auth } from '../auth/auth';
import { Billing } from './billing';

/** Liten pill i sidhuvudet som talar om hur länge provperioden räcker eller vad som saknas. */
@Component({
  selector: 'app-billing-banner',
  standalone: false,
  styles: `
    :host {
      display: contents;
    }
    @media (max-width: 767px) {
      :host {
        display: none;
      }
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 2px 4px 2px 12px;
      border-radius: 999px;
      background: rgb(255 255 255 / 0.18);
      color: #fff;
      font-size: 13px;
      white-space: nowrap;
    }
    .bar span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar.warn {
      background: #b3261e;
    }
  `,
  template: `
    @if (message(); as m) {
      <div class="bar" [class.warn]="warn()" role="status">
        <span>{{ m }}</span>
        <button mat-flat-button class="!h-7" (click)="billing.openPlans()">
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
