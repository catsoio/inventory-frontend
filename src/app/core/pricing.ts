import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AxleApi } from './api/axle-api';
import { PricingSettings } from './models';

/** Som backend `DEFAULT_PRICING`: däck och service, ett pris per order, inkl. moms. */
export const PRICING_DEFAULTS: PricingSettings = {
  profile: 'service',
  priceEntry: 'order',
  privatePricesIncludeVat: true,
  companyPricesIncludeVat: true,
  roundToKrona: false,
  consumablesPercent: null,
  consumablesMax: null,
  consumablesText: 'Förbrukningsmaterial',
  quoteValidDays: 30,
  quoteTolerancePercent: 15,
  quoteTerms: null,
  defaultJobLimit: null,
  showVin: true,
  showMileage: true,
  requireMileage: false,
  internalHourlyCost: null,
  stockOut: 'work_order_done',
  purchaseVatRate: 25,
};

/**
 * Färdiga profiler som fyller i allt med ett klick; ägaren justerar sedan enstaka val.
 * Inga priser sätts av en profil (förbrukningsmaterial, gränser), bara arbetssättet.
 */
export const PRICING_PROFILES: Record<'service' | 'workshop', Partial<PricingSettings>> = {
  service: {
    profile: 'service',
    priceEntry: 'order',
    privatePricesIncludeVat: true,
    companyPricesIncludeVat: true,
    roundToKrona: false,
    stockOut: 'work_order_done',
  },
  workshop: {
    profile: 'workshop',
    priceEntry: 'lines',
    privatePricesIncludeVat: true,
    companyPricesIncludeVat: true,
    roundToKrona: true,
    stockOut: 'sales_card_posted',
  },
};

/** Inköpsmomsen som gäller nu; följer Prissättning när den laddas. */
let purchaseRate = PRICING_DEFAULTS.purchaseVatRate;

/**
 * Inköpspris inkl. moms (öre) ur det som lagras. Snittkostnad och inköpspris lagras utan moms,
 * eftersom ingående moms dras av, men visas och skrivs alltid inkl. moms. För kod utanför
 * komponenter (t.ex. listkolumner); i komponenter går `Pricing.costIncl` lika bra.
 */
export const costInclOre = (netOre: number) => netOre + Math.round((netOre * purchaseRate) / 100);

/** Standardtexten under ett kostnadsförslag, när ägaren inte skrivit en egen. */
export const quoteTermsText = (s: PricingSettings) =>
  s.quoteTerms ??
  `Kostnaden kan variera med max +/- ${s.quoteTolerancePercent} % från förslaget. ` +
    `Kostnadsförslaget är giltigt i ${s.quoteValidDays} dagar.`;

/** Företagets prissättning, laddas vid start (Shell) och gäller alla användare. */
@Injectable({ providedIn: 'root' })
export class Pricing {
  private readonly api = inject(AxleApi);
  readonly value = signal<PricingSettings>({ ...PRICING_DEFAULTS });

  load(): void {
    this.api.pricingSettings().subscribe({
      next: (s) => this.set(s),
      error: () => {},
    });
  }

  save(body: Partial<PricingSettings>): Observable<PricingSettings> {
    return this.api.savePricingSettings(body).pipe(tap((s) => this.set(s)));
  }

  private set(s: PricingSettings) {
    this.value.set({ ...PRICING_DEFAULTS, ...s });
    purchaseRate = this.value().purchaseVatRate;
  }

  /** Inköpspris inkl. moms (öre) ur det som lagras (utan moms). */
  costIncl(netOre: number): number {
    return costInclOre(netOre);
  }

  /** Inköpspris utan moms (öre) ur ett inskrivet pris inkl. moms. */
  costNet(grossOre: number): number {
    const rate = this.value().purchaseVatRate;
    return grossOre - Math.round((grossOre * rate) / (100 + rate));
  }

  /** Priser anges alltid inkl. moms. */
  includeVatFor(_company: boolean): boolean {
    return true;
  }
}
