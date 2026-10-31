import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CatalogApi } from '../../core/api/catalog-api';
import { AxleApi } from '../../core/api/axle-api';
import { Auth } from '../../core/auth/auth';
import { Billing } from '../../core/billing/billing';
import {
  ACCESSORY_LABELS,
  DEPOSIT_CONDITION_LABELS,
  GARAGE_ROLE_LABELS,
  GarageMember,
  MONTH_LABELS,
  PricingSettings,
  SEASON_LABELS,
  STORAGE_CONTENTS_LABELS,
  StorageDefaults,
  Warehouse,
} from '../../core/models';
import { PRICING_PROFILES, Pricing, quoteTermsText } from '../../core/pricing';
import { AppSettings, SETTINGS_DEFAULTS, Settings } from '../../core/settings';
import { Confirm } from '../../shared/confirm';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';

/**
 * Allt som inställningssidans avsnitt delar: formulären, vad som är sparat och sparandet. Levereras
 * av sidan, så att ett osparat formulär finns kvar när man går till ett annat avsnitt och tillbaka.
 * Varje formulär har ett sparat läge (`commit`) som "Ångra" går tillbaka till.
 */
@Injectable()
export class SettingsStore {
  readonly auth = inject(Auth);
  readonly billing = inject(Billing);
  readonly roleLabels = GARAGE_ROLE_LABELS;
  private readonly settings = inject(Settings);
  private readonly snack = inject(MatSnackBar);
  private readonly api = inject(AxleApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(Confirm);
  private readonly pricing = inject(Pricing);
  private readonly catalog = inject(CatalogApi);
  private readonly fb = inject(FormBuilder);

  /** Sparat läge per formulär. */
  private readonly saved = new Map<FormGroup, unknown>();

  /** Sparar formulärets nuvarande värden som utgångsläge och markerar det som orört. */
  commit(form: FormGroup): void {
    this.saved.set(form, form.getRawValue());
    form.markAsPristine();
  }

  /** "Ångra": tillbaka till det sparade. */
  discard(form: FormGroup): void {
    form.reset(this.saved.get(form) as never);
  }

  // --- vem som ser vad ---

  readonly admin = this.auth.isAdmin();
  /** Superadmin eller en ägare med fler än ett bolag. */
  readonly showCompanies = computed(
    () => this.auth.isSuperAdmin() || this.auth.companies().length > 1,
  );

  // --- visning (personligt, ligger i webbläsaren) ---

  readonly viewForm = this.fb.nonNullable.group({
    defaultView: this.settings.value().defaultView,
    pageSize: this.settings.value().pageSize,
    dashboardDays: this.settings.value().dashboardDays,
  });

  saveView(): void {
    this.settings.save({ ...this.settings.value(), ...this.viewForm.getRawValue() } as AppSettings);
    this.commit(this.viewForm);
    this.snack.open('Visningen sparades', undefined, { duration: 2500 });
  }

  resetView(): void {
    this.confirm
      .ask({
        title: 'Återställa visningen?',
        message:
          'Standardvy, rader per hämtning och period på översikten byts mot standardvärdena.',
        confirmText: 'Återställ',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        const { defaultView, pageSize, dashboardDays } = SETTINGS_DEFAULTS;
        this.viewForm.reset({ defaultView, pageSize, dashboardDays });
        this.saveView();
      });
  }

  // --- företagets standardvärden (ägaren; gäller alla) ---

  readonly seasons = Object.entries(SEASON_LABELS);
  readonly defaultsForm = this.fb.nonNullable.group({
    defaultSeason: this.settings.value().defaultSeason,
    defaultSupplier: this.settings.value().defaultSupplier,
    defaultReorderLevel: [
      this.settings.value().defaultReorderLevel,
      [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
    ],
    markupPercent: [this.settings.value().markupPercent, [Validators.required, Validators.min(0)]],
    defaultStorageFee: [
      this.settings.value().defaultStorageFee,
      [Validators.required, Validators.min(0)],
    ],
    defaultHourlyRate: [
      this.settings.value().defaultHourlyRate,
      [Validators.required, Validators.min(0)],
    ],
    customerButtons: [this.settings.value().customerButtons],
  });

  /** Knappar som kan ligga på en kund i listan. Fler läggs till här när någon verkstad behöver dem. */
  readonly customerButtonOptions: [string, string][] = [
    ['call', 'Ring'],
    ['map', 'Visa på karta'],
  ];

  saveDefaults(): void {
    this.settings.save({
      ...this.settings.value(),
      ...this.defaultsForm.getRawValue(),
    } as AppSettings);
    this.commit(this.defaultsForm);
    this.snack.open('Standardvärdena sparades', undefined, { duration: 2500 });
  }

  // --- lösenord ---

  readonly pwBusy = signal(false);
  readonly pwForm = this.fb.nonNullable.group(
    {
      current: ['', Validators.required],
      next: ['', [Validators.required, Validators.minLength(8)]],
      repeat: ['', Validators.required],
    },
    {
      validators: (g: AbstractControl) =>
        g.get('next')?.value !== g.get('repeat')?.value ? { mismatch: true } : null,
    },
  );

  changePassword(): void {
    const { current, next } = this.pwForm.getRawValue();
    this.pwBusy.set(true);
    this.auth.changePassword(current, next).subscribe({
      next: () => {
        this.pwBusy.set(false);
        this.pwForm.reset();
        this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 });
      },
      error: () => this.pwBusy.set(false),
    });
  }

  // --- fakturauppgifter ---

  readonly sellerBusy = signal(false);
  readonly sellerForm = this.fb.nonNullable.group({
    name: [''],
    orgNo: [''],
    vatNumber: ['', Validators.pattern(/^(SE\s?\d{12})?$/i)],
    fTax: [true],
    address: [''],
    postalCode: [''],
    city: [''],
    phone: [''],
    email: [''],
    bankgiro: [''],
    bankAccount: [''],
    swish: [''],
    paymentDetails: [''],
    paymentTermsDays: [30, [Validators.min(0), Validators.max(365)]],
    footer: [''],
  });

  saveSeller(): void {
    this.sellerBusy.set(true);
    this.api.saveSeller(this.sellerForm.getRawValue()).subscribe({
      next: (s) => {
        this.auth.sellerName.set(s.name);
        this.auth.renameGarage(s.name);
        this.sellerBusy.set(false);
        this.commit(this.sellerForm);
        this.snack.open('Företagsuppgifterna sparades', undefined, { duration: 2500 });
      },
      error: () => this.sellerBusy.set(false),
    });
  }

  // --- personal ---

  readonly members = signal<GarageMember[]>([]);
  readonly inviteCode = signal<string | null>(null);
  readonly seatsFull = computed(() => {
    const u = this.billing.status()?.users;
    return !!u && u.current >= u.limit;
  });

  private loadMembers(): void {
    this.api.members().subscribe((m) => this.members.set(m));
  }

  invite(): void {
    this.api.createInvite().subscribe((i) => this.inviteCode.set(i.code));
  }

  setRole(m: GarageMember, role: 'staff' | 'mechanic'): void {
    if (m.role === role) return;
    this.api.setMemberRole(m.userId, role).subscribe({
      next: (list) => {
        this.members.set(list);
        this.snack.open(
          `${this.label(m)} är nu ${GARAGE_ROLE_LABELS[role].toLowerCase()}`,
          undefined,
          { duration: 3000 },
        );
      },
      error: () => this.loadMembers(),
    });
  }

  label(m: GarageMember): string {
    return m.name || m.email || m.phone || m.userId;
  }

  detail(m: GarageMember): string {
    const seen = m.lastSeenAt
      ? `senast inloggad ${new Date(m.lastSeenAt).toLocaleDateString('sv-SE')}`
      : 'har aldrig loggat in';
    const n = m.activeSessions ?? 0;
    const devices = n > 0 ? `${n} ${n === 1 ? 'enhet' : 'enheter'} inloggade` : null;
    return [m.name ? m.email : null, m.phone, seen, devices].filter(Boolean).join(' · ');
  }

  resetPassword(m: GarageMember): void {
    this.dialog
      .open<ResetPasswordDialog, GarageMember, boolean>(ResetPasswordDialog, {
        data: m,
        width: '440px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(
        (ok) => ok && this.snack.open('Lösenordet är bytt', undefined, { duration: 3000 }),
      );
  }

  toggleBlocked(m: GarageMember): void {
    const block = m.status !== 'blocked';
    const run = () =>
      this.api.setMemberBlocked(m.userId, block).subscribe((list) => this.members.set(list));
    if (!block) {
      run();
      return;
    }
    this.confirm
      .ask({
        title: `Spärra ${this.label(m)}?`,
        message: 'Personen kan inte logga in förrän du aktiverar kontot igen.',
        confirmText: 'Spärra',
        danger: true,
      })
      .subscribe((ok) => ok && run());
  }

  remove(m: GarageMember): void {
    this.confirm
      .ask({
        title: `Ta bort ${this.label(m)}?`,
        message: 'Personen förlorar åtkomsten till garaget. Det går inte att ångra.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => ok && this.api.removeMember(m.userId).subscribe(() => this.loadMembers()));
  }

  // --- bolag ---

  readonly companyName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });
  readonly companyBusy = signal(false);

  addCompany(): void {
    const id = this.auth.garage()?.id;
    if (!id) return;
    this.companyBusy.set(true);
    this.api.addCompany(id, this.companyName.value).subscribe({
      next: (c) => {
        this.companyBusy.set(false);
        this.companyName.reset('');
        this.snack.open(`${c.name} lades till`, undefined, { duration: 2500 });
        this.api.allGarages().subscribe((l) => this.auth.garages.set(l));
      },
      error: () => this.companyBusy.set(false),
    });
  }

  // --- prissättning ---

  readonly pricingBusy = signal(false);
  readonly pricingForm = this.fb.group({
    profile: ['service' as PricingSettings['profile']],
    priceEntry: ['order' as PricingSettings['priceEntry']],
    privatePricesIncludeVat: [true],
    companyPricesIncludeVat: [true],
    roundToKrona: [false],
    consumablesPercent: [null as number | null, [Validators.min(0), Validators.max(100)]],
    consumablesMax: [null as number | null, Validators.min(0)],
    consumablesText: ['Förbrukningsmaterial'],
    quoteValidDays: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    quoteTolerancePercent: [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    quoteTerms: [''],
    defaultJobLimit: [null as number | null, Validators.min(0)],
    showVin: [true],
    showMileage: [true],
    requireMileage: [false],
    internalHourlyCost: [null as number | null, Validators.min(0)],
    stockOut: ['work_order_done' as PricingSettings['stockOut']],
    purchaseVatRate: [25],
  });
  readonly defaultTerms = computed(() =>
    quoteTermsText({ ...this.pricing.value(), quoteTerms: null }),
  );

  /** Pengar i kronor i formuläret, öre i backend. */
  private fillPricing(p: PricingSettings): void {
    const kr = (o: number | null) => (o == null ? null : o / 100);
    this.pricingForm.reset({
      ...p,
      consumablesMax: kr(p.consumablesMax),
      defaultJobLimit: kr(p.defaultJobLimit),
      internalHourlyCost: kr(p.internalHourlyCost),
      quoteTerms: p.quoteTerms ?? '',
    });
    this.commit(this.pricingForm);
  }

  /** Fyller i profilens arbetssätt; inget sparas förrän man trycker Spara. */
  applyProfile(p: 'service' | 'workshop'): void {
    this.pricingForm.patchValue(PRICING_PROFILES[p]);
    this.pricingForm.markAsDirty();
  }

  /** Stämmer valen inte längre med profilen är arbetssättet "Anpassat". */
  private syncProfile(): void {
    const cur = this.pricingForm.controls.profile.value;
    if (cur !== 'service' && cur !== 'workshop') return;
    // Momsvalen finns inte längre och räknas inte.
    const {
      profile: _p,
      privatePricesIncludeVat: _a,
      companyPricesIncludeVat: _b,
      ...want
    } = PRICING_PROFILES[cur] as Record<string, unknown>;
    const have = this.pricingForm.getRawValue() as Record<string, unknown>;
    if (Object.entries(want).some(([k, v]) => have[k] !== v)) {
      this.pricingForm.controls.profile.setValue('custom', { emitEvent: false });
    }
  }

  savePricing(): void {
    const v = this.pricingForm.getRawValue();
    const ore = (kr: number | null | undefined) =>
      kr == null || (kr as unknown) === '' ? null : Math.round(Number(kr) * 100);
    const num = (n: number | null | undefined) =>
      n == null || (n as unknown) === '' ? null : Number(n);
    this.pricingBusy.set(true);
    this.pricing
      .save({
        // Ändrar ägaren något efter en profil är det ett eget arbetssätt.
        profile: v.profile ?? 'custom',
        priceEntry: v.priceEntry ?? 'order',
        // Priser anges alltid inkl. moms; valen finns inte längre.
        privatePricesIncludeVat: true,
        companyPricesIncludeVat: true,
        roundToKrona: !!v.roundToKrona,
        consumablesPercent: num(v.consumablesPercent),
        consumablesMax: ore(v.consumablesMax),
        consumablesText: v.consumablesText || 'Förbrukningsmaterial',
        quoteValidDays: Number(v.quoteValidDays),
        quoteTolerancePercent: Number(v.quoteTolerancePercent),
        quoteTerms: v.quoteTerms?.trim() || null,
        defaultJobLimit: ore(v.defaultJobLimit),
        showVin: !!v.showVin,
        showMileage: !!v.showMileage,
        requireMileage: !!v.requireMileage,
        internalHourlyCost: ore(v.internalHourlyCost),
        stockOut: v.stockOut ?? 'work_order_done',
        purchaseVatRate: Number(v.purchaseVatRate ?? 25),
      })
      .subscribe({
        next: (p) => {
          this.pricingBusy.set(false);
          this.fillPricing(p);
          this.snack.open('Prissättningen sparades', undefined, { duration: 2500 });
        },
        error: () => this.pricingBusy.set(false),
      });
  }

  // --- däckhotellets förval ---

  readonly storageContents = Object.entries(STORAGE_CONTENTS_LABELS);
  readonly storageConditions = Object.entries(DEPOSIT_CONDITION_LABELS);
  readonly storageAccessories = Object.entries(ACCESSORY_LABELS);
  readonly months = MONTH_LABELS;
  readonly storageBusy = signal(false);
  readonly storageWarehouses = signal<Warehouse[]>([]);
  readonly storageWarehouseId = signal<string | null>(null);
  readonly storagePlaces = computed(
    () => this.storageWarehouses().find((w) => w.id === this.storageWarehouseId())?.locations ?? [],
  );
  readonly storageForm = this.fb.group({
    contents: ['complete_wheels' as string],
    quantity: [4, [Validators.required, Validators.min(1), Validators.max(12)]],
    studded: [false],
    condition: ['good' as string],
    accessories: [[] as string[]],
    warehouseId: [null as string | null],
    locationId: [null as string | null],
    winterPickupMonth: [10],
    summerPickupMonth: [4],
    paymentCycleMonths: [12, [Validators.required, Validators.min(1), Validators.max(60)]],
  });

  saveStorage(): void {
    this.storageBusy.set(true);
    const v = this.storageForm.getRawValue();
    this.api
      .saveStorageDefaults({
        ...v,
        quantity: Number(v.quantity),
        paymentCycleMonths: Number(v.paymentCycleMonths),
        locationId: v.warehouseId ? v.locationId : null,
      } as Partial<StorageDefaults>)
      .subscribe({
        next: (d) => {
          this.storageBusy.set(false);
          this.storageForm.reset(d as never);
          this.commit(this.storageForm);
          this.snack.open('Förvalen sparades', undefined, { duration: 2500 });
        },
        error: () => this.storageBusy.set(false),
      });
  }

  // --- osparat ---

  private readonly forms = [
    this.viewForm,
    this.defaultsForm,
    this.pwForm,
    this.sellerForm,
    this.pricingForm,
    this.storageForm,
  ];

  /** Något formulär har ändringar som inte sparats (lösenordet räknas inte). */
  hasUnsaved(): boolean {
    return this.forms.some((f) => f !== this.pwForm && f.dirty);
  }

  constructor() {
    for (const f of this.forms) this.commit(f);
    this.pricingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncProfile());
    if (!this.admin) return;
    this.loadMembers();
    this.api.pricingSettings().subscribe((p) => this.fillPricing(p));
    this.catalog
      .warehouses()
      .subscribe((all) =>
        this.storageWarehouses.set(all.filter((w) => w.active && w.kind === 'customer')),
      );
    this.api.storageDefaults().subscribe((d) => {
      this.storageForm.reset(d as never);
      this.storageWarehouseId.set(d.warehouseId);
      this.commit(this.storageForm);
    });
    this.storageForm.controls.warehouseId.valueChanges.pipe(takeUntilDestroyed()).subscribe((w) => {
      this.storageWarehouseId.set(w);
      const places = this.storageWarehouses().find((x) => x.id === w)?.locations ?? [];
      if (!places.some((p) => p.id === this.storageForm.controls.locationId.value)) {
        this.storageForm.controls.locationId.setValue(null);
      }
    });
    this.api.seller().subscribe((s) => {
      this.sellerForm.patchValue({
        ...s,
        // Tomt namn fylls i med garagets namn så ägaren bara behöver komplettera.
        name: s.name || this.auth.garage()?.name || '',
        vatNumber: s.vatNumber ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        bankgiro: s.bankgiro ?? '',
        bankAccount: s.bankAccount ?? '',
        swish: s.swish ?? '',
        paymentDetails: s.paymentDetails ?? '',
        footer: s.footer ?? '',
      });
      this.commit(this.sellerForm);
    });
  }
}
