export type Role = 'user' | 'admin';
export type Season = 'summer' | 'winter' | 'all_season';
export type Category = 'tyre' | 'rim' | 'other';
export type RimMaterial = 'alloy' | 'steel';
export type StockLevel = 'in_stock' | 'low' | 'out';
export type MovementType = 'purchase' | 'sale' | 'customer_return' | 'write_off' | 'adjustment';

export const SEASON_LABELS: Record<Season, string> = {
  summer: 'Sommar',
  winter: 'Vinter',
  all_season: 'Helår',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  tyre: 'Däck',
  rim: 'Fälgar',
  other: 'Övrigt',
};

export const RIM_MATERIAL_LABELS: Record<RimMaterial, string> = {
  alloy: 'Aluminium',
  steel: 'Plåt',
};

/** Ikon-typ för en artikel i listor. */
export const itemKind = (category: Category): 'tyre' | 'rim' | 'other' =>
  category === 'tyre' ? 'tyre' : category === 'rim' ? 'rim' : 'other';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase: 'Inköp',
  sale: 'Försäljning',
  customer_return: 'Retur',
  write_off: 'Kassering',
  adjustment: 'Inventering',
};

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  roles: Role[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
}

export interface TyreSpec {
  width: number;
  profile: number;
  rimDiameter: number;
  loadIndex?: number | null;
  speedIndex?: string | null;
  season: Season;
  studded?: boolean;
  runFlat?: boolean;
  dot?: string | null;
  sizeLabel?: string;
}

export interface RimSpec {
  diameter: number;
  width: number;
  /** Null när det inte är känt. */
  boltCount: number | null;
  boltCircle: number | null;
  centerBore?: number | null;
  offset: number | null;
  material: RimMaterial;
  color?: string | null;
  sizeLabel?: string;
}

export interface Article {
  id: string;
  /** Löpnummer per verkstad; null tills befintliga artiklar numrerats. */
  number: number | null;
  /** Utskriftsform av numret, t.ex. "ART-00042". */
  code: string | null;
  category: Category;
  label: string;
  brand: string;
  model: string;
  sku: string | null;
  /** Mått för visning, oavsett kategori (null för övrigt). */
  sizeLabel: string | null;
  tyre: TyreSpec | null;
  rim: RimSpec | null;
  location: string | null;
  typeId?: string | null;
  warehouseId?: string | null;
  locationId?: string | null;
  quantity: number;
  stockLevel: StockLevel;
  reorderLevel: number;
  /** false = enstaka del som köps in till ett jobb: ingen påminnelse, döljs när den är förbrukad. */
  stocked: boolean;
  ean: string | null;
  /** Id hos en grossists katalog, t.ex. { gummigrossen: '371383' }. */
  externalIds: Record<string, string> | null;
  /** null för personal: inköpspris visas bara för ägare. */
  averageCost: number | null;
  sellPrice: number;
  margin: number | null;
  marginPercent: number | null;
  stockValue: number | null;
  supplier: string | null;
  notes: string | null;
  active: boolean;
  lastPurchasedAt: string | null;
}

export interface ArticleInput {
  category: Category;
  brand?: string;
  model?: string;
  sku?: string;
  /** null rensar specen (vid byte av kategori). */
  tyre?: Omit<TyreSpec, 'sizeLabel'> | null;
  rim?: Omit<RimSpec, 'sizeLabel'> | null;
  location?: string;
  /** Artikeltypen (register) och platsen (lager, plats). */
  typeId?: string | null;
  warehouseId?: string | null;
  locationId?: string | null;
  reorderLevel?: number;
  stocked?: boolean;
  ean?: string | null;
  externalIds?: Record<string, string> | null;
  sellPrice: number;
  /** Inköpspris per styck, öre. */
  averageCost?: number;
  supplier?: string;
  notes?: string;
  initialQuantity?: number;
}

export type ArticleUpdate = Partial<Omit<ArticleInput, 'initialQuantity'>>;

export interface ArticleQuery {
  q?: string;
  category?: Category;
  season?: Season;
  brand?: string;
  rimDiameter?: number;
  width?: number;
  profile?: number;
  studded?: boolean;
  inStock?: boolean;
  lowStock?: boolean;
  /** Utan enstaka delar som är förbrukade. */
  hideSpent?: boolean;
  includeArchived?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface Summary {
  articles: number;
  units: number;
  stockValue: number;
  retailValue: number;
  lowStock: number;
  outOfStock: number;
  /** Det som ska beställas, utan överlapp: slut (med påminnelsenivå) och under nivån men kvar. */
  reorderSoldOut: number;
  reorderLow: number;
}

export interface FacetItem {
  value: string | number;
  articles: number;
  units: number;
}

export interface Facets {
  rimDiameters: FacetItem[];
  widths: FacetItem[];
  profiles: FacetItem[];
  brands: FacetItem[];
}

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  unitCost?: number | null;
  unitPrice?: number | null;
  reference?: string | null;
  note?: string | null;
  articleId?: string;
  articleLabel?: string;
  label?: string;
  createdAt: string;
  balanceAfter?: number;
}

export interface TradeParty {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
}

export interface TradeVehicle {
  id: string;
  code: string;
  regNo: string;
  make: string | null;
  model: string | null;
}

/** En rad i försäljnings- eller inköpsloggen: ett dokument med löpnummer. */
export interface TradeRow {
  number: number;
  code: string;
  createdAt: string;
  reference: string | null;
  /** Länk till var det köptes (inköp). */
  url?: string | null;
  /** Fri text på inköp som gjordes innan leverantörsregistret fanns. */
  supplierName: string | null;
  note: string | null;
  lines: number;
  units: number;
  /** Öre. */
  total: number;
  cost: number;
  customer: TradeParty | null;
  vehicle: TradeVehicle | null;
  supplier: TradeParty | null;
}

export interface TradeLine {
  articleId: string;
  articleLabel: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TradeDocument {
  number: number;
  code: string;
  createdAt: string;
  reference: string | null;
  url?: string | null;
  supplierName: string | null;
  note: string | null;
  units: number;
  total: number;
  customer: TradeParty | null;
  vehicle: TradeVehicle | null;
  supplier: TradeParty | null;
  lines: TradeLine[];
}

export type TradeKind = 'purchases';

export interface MovementQuery {
  type?: MovementType;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface Report {
  purchasedUnits: number;
  purchasedCost: number;
  soldUnits: number;
  soldRevenue: number;
  soldCost: number;
  grossProfit: number;
  writtenOffUnits: number;
  writtenOffCost: number;
}

/** En grupp i en rapport: en vecka (`2026-W43`), en dag, ett märke eller en artikel. */
export interface ReportGroup extends Report {
  key: string;
  label: string;
}

export type ReportGroupBy = 'day' | 'week' | 'brand' | 'article';

export interface GroupedReport extends Report {
  groups?: ReportGroup[];
}

/** Lagret i slutet av en dag (ur lagerloggen). Värde i öre, snittinköpspris exkl. moms. */
export interface StockHistoryPoint {
  /** YYYY-MM-DD */
  date: string;
  articles: number;
  units: number;
  stockValue: number;
}

export type StockAction = 'receive' | 'return' | 'write-off' | 'adjust';

export type GarageRole = 'owner' | 'staff' | 'mechanic';

export const GARAGE_ROLE_LABELS: Record<GarageRole, string> = {
  owner: 'Ägare',
  staff: 'Personal',
  mechanic: 'Mekaniker',
};

export interface Garage {
  id: string;
  name: string;
  role: GarageRole;
  /** Plattformsoperatör: får se och ändra alla garage. */
  superAdmin?: boolean;
}

/** Ett bolag i ägarens organisation (Sthlm, Luleå …). */
export interface Company {
  id: string;
  name: string;
}

export interface GarageListItem {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface GarageMember {
  userId: string;
  garageId: string;
  role: GarageRole;
  createdAt: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'blocked' | 'pending_verification' | 'deactivated' | 'deleted' | null;
  lastSeenAt?: string | null;
  /** Enheter som är inloggade just nu. */
  activeSessions?: number;
}

export interface GarageInvite {
  code: string;
  expiresAt: string;
}

export type StorageStatus = 'stored' | 'picked_up';
export type PaymentStatus = 'unpaid' | 'paid';
export type PaymentMethod = 'cash' | 'card' | 'swish' | 'invoice';
/** Faktura = kunden betalar senare (förfallodatum, betalningsuppgifter). Kvitto = betalt på stället. */
export type InvoiceKind = 'invoice' | 'receipt';

/** Vad verkstaden väljer när ett säljkort bokförs (eller förhandsgranskas). Utan val följer det kunden. */
export interface DocumentChoice {
  kind?: InvoiceKind;
  /** Dagar till förfallodatum på en faktura. Standard: betalningsvillkoren under Företaget. */
  paymentTermsDays?: number;
  /** Hur ett kvitto betalades; ett kvitto är betalt direkt. En faktura betalas senare. */
  paymentMethod?: PaymentMethod;
}
export type StorageContents = 'tyres' | 'rims' | 'complete_wheels';
export type StorageAccessory = 'hubcaps' | 'locking_nuts' | 'wheel_bolts' | 'tpms';

export const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  stored: 'Inlagrad',
  picked_up: 'Utlämnad',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Obetald',
  paid: 'Betald',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Kontant',
  card: 'Kort',
  swish: 'Swish',
  invoice: 'Faktura',
};

/**
 * Betalsätten för ett dokument. Ett kvitto är betalt på stället (kort, kontant, Swish). En faktura
 * betalas oftast in på banken, vilket här heter "Faktura" som betalsätt: betalt mot fakturan.
 */
export function paymentOptions(kind: InvoiceKind): [PaymentMethod, string][] {
  return kind === 'receipt'
    ? [
        ['card', PAYMENT_METHOD_LABELS.card],
        ['cash', PAYMENT_METHOD_LABELS.cash],
        ['swish', PAYMENT_METHOD_LABELS.swish],
      ]
    : [
        ['invoice', paymentLabel('invoice', 'invoice')],
        ['swish', PAYMENT_METHOD_LABELS.swish],
        ['card', PAYMENT_METHOD_LABELS.card],
        ['cash', PAYMENT_METHOD_LABELS.cash],
      ];
}

/** Hur en betalning läses i en mening: "Betalt med kort", "Betalt kontant", "Betalt via bank". */
export function paidWith(kind: InvoiceKind | null | undefined, method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'kontant';
    case 'card':
      return 'med kort';
    case 'swish':
      return 'med Swish';
    default:
      return kind === 'invoice' ? 'via bank' : 'mot faktura';
  }
}

/** Betalsättets namn på ett dokument: på en faktura är "Faktura" en inbetalning till banken. */
export function paymentLabel(kind: InvoiceKind | null | undefined, method: PaymentMethod): string {
  return kind === 'invoice' && method === 'invoice'
    ? 'Bank / bankgiro'
    : PAYMENT_METHOD_LABELS[method];
}

export const STORAGE_CONTENTS_LABELS: Record<StorageContents, string> = {
  tyres: 'Däck',
  rims: 'Fälgar',
  complete_wheels: 'Kompletta hjul',
};

/** Hur setet såg ut när det kom in. */
export type DepositCondition = 'good' | 'worn' | 'damaged';

export const DEPOSIT_CONDITION_LABELS: Record<DepositCondition, string> = {
  good: 'Bra',
  worn: 'Slitna',
  damaged: 'Skadade',
};

export const ACCESSORY_LABELS: Record<StorageAccessory, string> = {
  hubcaps: 'Navkapslar',
  locking_nuts: 'Låsbultar',
  wheel_bolts: 'Hjulbultar/muttrar',
  tpms: 'TPMS-sensorer',
};

export interface StoredTyres {
  brand: string | null;
  model: string | null;
  width: number | null;
  profile: number | null;
  rimDiameter: number | null;
  season: Season;
  studded: boolean;
  treadDepthMm: number | null;
  sizeLabel?: string | null;
}

export interface StoredRims {
  brand: string | null;
  material: RimMaterial;
  diameter: number | null;
}

export interface StorageDeposit {
  id: string;
  number: number;
  /** Etiketttext, t.ex. "DH-0042". */
  code: string;
  label: string;
  status: StorageStatus;
  contents: StorageContents;
  quantity: number;
  /** Kundregistret; null på inlämningar från före registren. */
  customerId: string | null;
  vehicleId: string | null;
  customer: { name: string; phone: string | null; email: string | null };
  vehicle: { regNo: string; make: string | null; model: string | null };
  tyres: StoredTyres | null;
  rims: StoredRims | null;
  accessories: StorageAccessory[];
  location: string | null;
  /** Lager (för kundgods) och plats i registret. */
  warehouseId: string | null;
  locationId: string | null;
  conditionGrade: DepositCondition | null;
  condition: string | null;
  depositedAt: string;
  expectedPickupAt: string | null;
  /** När nästa årsavgift ska betalas. */
  nextPaymentAt: string | null;
  pickedUpAt: string | null;
  daysStored: number;
  overdue: boolean;
  /** Öre. */
  fee: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  notes: string | null;
  /** Senaste inkallnings-SMS, annars null. */
  recalledAt?: string | null;
}

export interface RecallRecipient {
  phone: string;
  name: string;
  depositIds: string[];
  codes: string[];
  regNos: string[];
  recalledAt: string | null;
}

export interface RecallPreview {
  recipients: RecallRecipient[];
  withoutPhone: number;
}

export interface RecallResult {
  sent: number;
  failed: { name: string; phone: string }[];
}

export interface StorageDepositInput {
  contents: StorageContents;
  quantity?: number;
  /** Anges båda hämtas kund och bil ur registret. */
  customerId?: string;
  vehicleId?: string;
  customer: { name: string; phone?: string; email?: string };
  vehicle: { regNo: string; make?: string; model?: string };
  tyres?: Omit<StoredTyres, 'sizeLabel'> | null;
  rims?: StoredRims | null;
  accessories?: StorageAccessory[];
  location?: string | null;
  warehouseId?: string | null;
  locationId?: string | null;
  conditionGrade?: DepositCondition | null;
  condition?: string | null;
  depositedAt?: string;
  expectedPickupAt?: string | null;
  nextPaymentAt?: string | null;
  fee?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paidAt?: string | null;
  notes?: string | null;
}

export interface StorageQuery {
  q?: string;
  status?: StorageStatus;
  paymentStatus?: PaymentStatus;
  contents?: StorageContents;
  season?: Season;
  overdue?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface StorageSummary {
  stored: number;
  units: number;
  unpaid: number;
  unpaidAmount: number;
  overdue: number;
}

// --- Bokföring (periodstängning) ---

export type ClosingKind = 'period' | 'reset';
export type ClosingStatus = 'closed' | 'voided';
export type ClosingEntryKind = 'line' | 'movement' | 'deposit';

export interface StockTotals {
  articles: number;
  units: number;
  /** Öre, värderat till snittinköpspris. */
  value: number;
}

export interface InventoryFigures {
  purchasedUnits: number;
  purchasedCost: number;
  soldUnits: number;
  soldRevenue: number;
  soldCost: number;
  grossProfit: number;
  writtenOffUnits: number;
  writtenOffCost: number;
  adjustmentUnits: number;
  adjustmentValue: number;
}

export interface HotelFigures {
  received: number;
  pickedUp: number;
  feesPaid: number;
  feesPaidCount: number;
  feesByMethod: Record<PaymentMethod, number>;
  storedAtEnd: number;
  storedUnitsAtEnd: number;
  unpaidAtEnd: number;
  unpaidAmountAtEnd: number;
}

export interface ClosingSummary {
  inventory: InventoryFigures;
  stock: { opening: StockTotals; closing: StockTotals; revaluation: number };
  hotel: HotelFigures;
}

export interface ClosingCounts {
  lines: number;
  movements: number;
  deposits: number;
}

export interface Closing {
  id: string;
  number: number;
  kind: ClosingKind;
  status: ClosingStatus;
  from: string;
  /** Exklusiv slutpunkt. */
  to: string;
  closedAt: string;
  closedBy: string;
  closedByName: string | null;
  closedBySuperAdmin: boolean;
  note: string | null;
  summary: ClosingSummary;
  counts: ClosingCounts;
  reset: {
    articles: number;
    movements: number;
    deposits: number;
    keptDeposits: number;
    keepStoredDeposits: boolean;
  } | null;
  voided: { at: string; by: string; reason: string | null } | null;
}

export type ClosingWarningCode =
  | 'LONG_PERIOD'
  | 'PERIOD_ENDS_NOW'
  | 'END_CAPPED_TO_NOW'
  | 'STOCK_NOT_IN_LEDGER'
  | 'NEGATIVE_STOCK'
  | 'UNPAID_FEES'
  | 'STORED_SETS'
  | 'EMPTY_PERIOD';

export interface ClosingWarning {
  code: ClosingWarningCode;
  severity: 'info' | 'warning';
  params?: Record<string, number>;
}

export type ClosingBlocked = 'INVALID_PERIOD' | 'STARTS_AFTER_FIRST_EVENT' | 'NOTHING_TO_CLOSE';

export interface ClosingPreview {
  from: string;
  to: string;
  previous: { id: string; number: number; to: string } | null;
  firstEventAt: string | null;
  summary: ClosingSummary | null;
  counts: ClosingCounts | null;
  warnings: ClosingWarning[];
  blocked: ClosingBlocked | null;
}

export interface ClosingStatusInfo {
  lockedUntil: string | null;
  latest: Closing | null;
  suggestedFrom: string;
  firstEventAt: string | null;
  hasData: boolean;
  fromIsFixed: boolean;
}

export interface ResetPreview {
  garage: { id: string; name: string };
  closing: ClosingPreview;
  data: {
    articles: number;
    movements: number;
    deposits: number;
    storedDeposits: number;
    storedUnits: number;
    unpaidDeposits: number;
    unpaidAmount: number;
  };
}

export interface ClosingEntry<T = Record<string, any>> {
  id: string;
  kind: ClosingEntryKind;
  seq: number;
  sub: string | null;
  data: T;
}

export interface ClosingLine {
  articleId: string;
  label: string;
  /** Saknas på rader från äldre bokföringar. */
  code?: string | null;
  sku: string | null;
  category: Category | null;
  location: string | null;
  openingQty: number;
  receivedQty: number;
  returnedQty: number;
  soldQty: number;
  writtenOffQty: number;
  adjustedQty: number;
  unledgeredQty: number;
  closingQty: number;
  avgCost: number;
  closingValue: number;
  sellPrice: number | null;
}

export const closingCode = (n: number): string => `BS-${String(n).padStart(4, '0')}`;

// --- Tidsbokning ---

export type BookingStatus = 'requested' | 'booked' | 'arrived' | 'done' | 'cancelled' | 'no_show';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: 'Förfrågan',
  booked: 'Bokad',
  arrived: 'Anlänt',
  done: 'Klar',
  cancelled: 'Avbokad',
  no_show: 'Uteblev',
};

export interface Booking {
  id: string;
  /** TID-00042 */
  code: string;
  number: number;
  /** Null på bokningar som gjordes innan kund- och bilregistret fanns. */
  customerId: string | null;
  vehicleId: string | null;
  resourceId: string | null;
  /** Lyft eller plats, vid sidan av mekanikern i resourceId. */
  placeId: string | null;
  serviceTypeId: string | null;
  title: string;
  /** Namn och regnr är kopior från när bokningen gjordes. */
  customerName: string;
  phone: string | null;
  regNo: string | null;
  vehicle: string | null;
  resourceName: string | null;
  placeName: string | null;
  /** ISO-tid. */
  start: string;
  end: string;
  /** Klar senast (dagar senare), om jobbet tar längre än tiden. */
  dueAt: string | null;
  status: BookingStatus;
  /** Öre. */
  priceFrom: number | null;
  priceTo: number | null;
  notes: string | null;
  /** Arbetsordern bokningen är planeringen för, om den har en. */
  workOrder: BookingOrder | null;
}

/** Det kalendern behöver veta om bokningens arbetsorder. */
export interface BookingOrder {
  id: string;
  /** AO-00042 */
  code: string;
  status: WorkOrderStatus;
  hasMissing: boolean;
}

export interface BookingInput {
  customerId: string;
  vehicleId: string;
  resourceId: string | null;
  /** Lyft eller plats, vid sidan av mekanikern i resourceId. */
  placeId?: string | null;
  serviceTypeId: string | null;
  title: string;
  start: string;
  end: string;
  dueAt?: string | null;
  status: BookingStatus;
  priceFrom: number | null;
  priceTo: number | null;
  notes: string | null;
  /** Arbetsordern bokningen planerar (tiden, mekanikern och platsen följer bokningen); null släpper den. */
  workOrderId?: string | null;
}

// --- Kunder, bilar och verkstadens resurser ---

export type CustomerType = 'private' | 'company';

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  private: 'Privat',
  company: 'Företag',
};

export interface Customer {
  id: string;
  /** KU-0001 */
  code: string;
  number: number;
  type: CustomerType;
  name: string;
  /** Organisationsnummer för ett företag, personnummer för en privatperson (skrivs aldrig på fakturan). */
  orgNo: string | null;
  /** Momsregistreringsnummer (företag), t.ex. SE556123456701. */
  vatNumber: string | null;
  /** Vem man pratar med på ett företag. */
  contactPerson: string | null;
  /** Faktureringsadress – krävs på en företagsfaktura. */
  address: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Kundrabatt i % på arbete; förifylls på nya rader. */
  labourDiscount?: number | null;
  /** Kundrabatt i % på delar. */
  partsDiscount?: number | null;
  /**
   * Samlingsfaktura: klara arbetsorder lämnas ut med följesedel och faktureras tillsammans, en
   * faktura i månaden, med bil, referens och datum för varje order.
   */
  collectiveInvoice?: boolean;
  /** Kundens egna betalningsvillkor i dagar; null = företagets (Inställningar → Företaget). */
  paymentTermsDays?: number | null;
  active: boolean;
}

export type CustomerInput = Partial<
  Pick<
    Customer,
    | 'type'
    | 'name'
    | 'orgNo'
    | 'vatNumber'
    | 'contactPerson'
    | 'address'
    | 'postalCode'
    | 'city'
    | 'phone'
    | 'email'
    | 'notes'
    | 'labourDiscount'
    | 'partsDiscount'
    | 'collectiveInvoice'
    | 'paymentTermsDays'
    | 'active'
  >
>;

export interface Vehicle {
  id: string;
  /** BIL-0001 */
  code: string;
  number: number;
  customerId: string;
  regNo: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  /** Färgen enligt fordonsregistret, t.ex. "Svart". */
  color?: string | null;
  /** Däckdimension fram, t.ex. "205/55 R16". */
  tyreSize?: string | null;
  rimSize?: string | null;
  /** Däck och fälg bak, när bilen har andra mått där. */
  tyreSizeRear?: string | null;
  rimSizeRear?: string | null;
  /** Alla tekniska rader från fordonsuppslaget (t.ex. första registrering). */
  specs?: Record<string, string> | null;
  /** De typade uppgifterna från registret; saknas på bilar som inte uppdaterats än. */
  tech?: VehicleTech | null;
  /** Allt källan visar om bilen, som tabeller; följer bara med bilens eget kort. */
  details?: VehicleDetails | null;
  /** När registret senast lästes för bilen (ISO). */
  registryFetchedAt?: string | null;
  /** Prisklass satt för hand; null = det registret säger. */
  classOverride?: VehicleClass | null;
  /** Bestående anmärkningar som följer bilen. */
  notes: string | null;
  active: boolean;
  customer: { id: string; code: string; name: string; phone: string | null } | null;
}

/** Prisklasser, samma som backend (`VEHICLE_CLASSES`). */
export type VehicleClass = 'passenger' | 'large' | 'trailer' | 'heavy' | 'motorcycle' | 'other';

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  passenger: 'Personbil',
  large: 'Större bil',
  trailer: 'Husvagn / släp',
  heavy: 'Lastbil / buss',
  motorcycle: 'MC / moped',
  other: 'Övrigt',
};

/** Ett däckmått uppdelat: "195/65 R15 91H". `raw` finns alltid, delarna kan saknas. */
export interface TyreSize {
  raw: string;
  width: number | null;
  profile: number | null;
  diameter: number | null;
  loadIndex: number | null;
  speedIndex: string | null;
}

/** Ett fälgmått uppdelat: "6Jx15 ET43". */
export interface RimSize {
  raw: string;
  width: number | null;
  diameter: number | null;
  offset: number | null;
}

/** En axel, fram först. */
export interface AxleTech {
  tyre: TyreSize | null;
  rim: RimSize | null;
  maxLoadKg: number | null;
  trackMm: number | null;
}

/** Bilens byggnad enligt registret. Aldrig ägaruppgifter. Mätarställningen är i km. */
export interface CarInfoStatus {
  connected: boolean;
  email: string | null;
}

/** Verkstadens anslutning till Blocket; aldrig nyckeln. `live` falskt = annonserna skickas dolda. */
export interface BlocketStatus {
  connected: boolean;
  dealerCode: string | null;
  live: boolean;
}

/** Verkstadens nyckel för att läsa sina egna annonser hos Blocket och Bytbil; aldrig nyckeln. */
export interface BlocketAccessStatus {
  /** Det finns en nyckel och en handlare (eller grupp) att försöka läsa med. */
  connected: boolean;
  dealerCode: string | null;
  /** Handlargruppen när nyckeln är en gruppnyckel; handlarkoden smalnar då av till en handlare. */
  group: string | null;
  /** Vems nyckel som läser: en egen läsnyckel, annars den som skickar annonser (Bytbil kan neka den). */
  source: 'own' | 'sending' | null;
}

/** Vad en annons hos Blocket blir vid inläsning: ny bil, finns redan, skickad härifrån eller hoppas över. */
export type BlocketImportAction = 'new' | 'exists' | 'ours' | 'skipped';

export interface BlocketImportRow {
  adId: string | null;
  regNo: string | null;
  label: string;
  action: BlocketImportAction;
  /** Varför annonsen hoppas över eller bilen inte gick att läsa in. */
  reason: string | null;
  warnings: string[];
  images: number;
  /** Öre. */
  price: number | null;
  mileageKm: number | null;
  carId: string | null;
}

export interface BlocketImportPreview {
  rows: BlocketImportRow[];
  counts: Record<BlocketImportAction, number>;
  /** Hur Blockets miltal läses av servern. */
  milageUnit: 'km' | 'mil';
}

export interface BlocketImportResult {
  created: BlocketImportRow[];
  failed: BlocketImportRow[];
  /** Nya bilar som väntar på nästa körning. */
  remaining: number;
}

/** Var en bils annons står hos Blocket. `off` = aldrig skickad. */
export type BlocketAdState = 'off' | 'pending' | 'live' | 'hidden' | 'removed' | 'error';

export const BLOCKET_STATE_LABELS: Record<BlocketAdState, string> = {
  off: 'Inte på Blocket',
  pending: 'Skickas till Blocket…',
  live: 'Publicerad på Blocket',
  hidden: 'Utkast hos Blocket',
  removed: 'Borttagen från Blocket',
  error: 'Gick inte att skicka',
};

/** Bilens annons hos Blocket, som servern håller den i takt med bilen. */
export interface CarBlocket {
  /** Säljaren vill ha bilen på Blocket (den skickas medan den är till salu). */
  enabled: boolean;
  /**
   * Publicerad (synlig på Blocket och Bytbil) eller utkast (dold, syns bara i Blockets adminpanel).
   * En bil skickas alltid som utkast först. Null = inte valt, bara äldre bilar.
   */
  published: boolean | null;
  blocketAdId: string | null;
  state: BlocketAdState;
  /** Senaste felet, eller en anmärkning om något som inte kunde skickas. */
  message: string | null;
  syncedAt: string | null;
}

/** `heading`: underrubrik i en grupp. `columns`: rubrikrad i en tabell med flera värden per rad. */
export interface DetailRow {
  label: string;
  cells: string[];
  kind?: 'heading' | 'columns';
  level?: number;
}

export interface DetailGroup {
  title: string;
  /** Det en verkstad tittar på först; resten är ihopfällt tills man öppnar. */
  important: boolean;
  rows: DetailRow[];
}

export interface DetailSection {
  title: string;
  important: boolean;
  groups: DetailGroup[];
}

export interface VehicleDetails {
  source: string;
  sections: DetailSection[];
}

export interface VehicleTech {
  vehicleClass: VehicleClass;
  vehicleType: string | null;
  euCategory: string | null;
  bodyCode: string | null;
  bodyText: string | null;
  fuels: string[];
  electrified: boolean | null;
  gearbox: string | null;
  powerKw: number | null;
  powerHp: number | null;
  displacementCc: number | null;
  fourWheelDrive: boolean | null;
  seats: number | null;
  maxSpeedKmh: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  wheelbaseMm: number | null;
  serviceWeightKg: number | null;
  grossWeightKg: number | null;
  maxLoadKg: number | null;
  maxTrailerBrakedKg: number | null;
  maxTrailerUnbrakedKg: number | null;
  axles: AxleTech[];
  odometerKm: number | null;
  odometerAt: string | null;
  inspectionLast: string | null;
  inspectionDue: string | null;
  inspectionStatus: string | null;
  previousInspection: string | null;
  previousOdometerKm: number | null;
  firstRegisteredAt: string | null;
  inTrafficSwedenAt: string | null;
  manufacturedAt: string | null;
  statusText: string | null;
  typeApprovalNo: string | null;
}

export type VehicleInput = Partial<
  Pick<
    Vehicle,
    | 'customerId'
    | 'regNo'
    | 'make'
    | 'model'
    | 'year'
    | 'vin'
    | 'notes'
    | 'classOverride'
    | 'active'
  >
>;

/** Vad fordonsregistret vet om ett regnr. Aldrig ägaruppgifter. */
export interface VehicleInfo {
  regNo: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  color: string | null;
  tyreSize: string | null;
  rimSize: string | null;
  tyreSizeRear?: string | null;
  rimSizeRear?: string | null;
  specs?: Record<string, string>;
  tech?: VehicleTech | null;
}

export interface VehicleLookup {
  /** `unavailable`: källan gick inte att använda just nu, fyll i för hand. */
  status: 'found' | 'not_found' | 'unavailable';
  info: VehicleInfo | null;
  /** När registret lästes (ISO); null när okänt. */
  fetchedAt?: string | null;
}

/** Bilens kort: bilen med dess senaste bokningar. */
export interface VehicleDetail extends Vehicle {
  bookings: Booking[];
  workOrders: WorkOrder[];
}

export interface CustomerDetail extends Customer {
  vehicles: Vehicle[];
  bookings: Booking[];
  workOrders: WorkOrder[];
}

export type ResourceKind = 'mechanic' | 'lift' | 'bay';

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  mechanic: 'Mekaniker',
  lift: 'Lyft',
  bay: 'Plats',
};

export interface Resource {
  id: string;
  /** RES-001 */
  code: string;
  number: number;
  name: string;
  kind: ResourceKind;
  color: string;
  /** Inloggning som mekanikern använder, om någon. */
  userId?: string | null;
  active: boolean;
}

export interface ServiceType {
  id: string;
  /** ATG-001 */
  code: string;
  number: number;
  name: string;
  durationMinutes: number;
  /** Öre. */
  priceFrom: number | null;
  priceTo: number | null;
  /** Operationskod på dokumenten, t.ex. 01500060. */
  opCode?: string | null;
  /** Mallrader som läggs på ett jobb på en gång. */
  lines?: ServiceTemplateLine[];
  /** Pris per fordonsklass och fälgstorlek, per bil eller per hjul. Tom = ett pris för alla. */
  prices?: PriceRule[];
  /** Ett tillfälligt pris eller en procent av, med datum. */
  campaign?: PriceCampaign | null;
  /** Det lägsta priset åtgärden kan kosta i dag, det "från" som visas. Räknas av servern. */
  from?: ServicePrice | null;
  /** Hur åtgärden ser ut på bokningssidan; null = visas inte där. */
  online?: ServiceOnline | null;
  active: boolean;
}

/** Åtgärdens ansikte på verkstadens publika bokningssida. */
export interface ServiceOnline {
  published: boolean;
  /** Rubriken på sidan; null = åtgärdens namn. */
  title: string | null;
  description: string | null;
  /** Plats på sidan, lägst först. */
  order: number;
  /** Uppladdad bild (filnamn, se `OnlineBookingSettings.mediaPath`); null = ingen. */
  image?: string | null;
}

/** Den publika bokningssidans inställningar (Webbsida). */
export interface OnlineBookingSettings {
  enabled: boolean;
  intro: string | null;
  leadDays: number;
  horizonDays: number;
  /** Där verkstadens bilder ligger (lägg till `/<filnamn>`; ligger under `environment.apiUrl`). */
  mediaPath: string;
}

/** `vehicle` = ett pris för bilen, `wheel` = ett pris per hjul (punktering, husvagn). */
export type PriceUnit = 'vehicle' | 'wheel';

/** En prisrad. Priser i öre inkl. moms. Samma som backend (`service-pricing.ts`). */
export interface PriceRule {
  /** Gäller bara den klassen; null = alla. */
  vehicleClass: VehicleClass | null;
  /** Fälgstorlek i tum, båda ändar med; null = öppet. Båda null = alla storlekar. */
  rimFrom: number | null;
  rimTo: number | null;
  unit: PriceUnit;
  /** Per hjul: hur många hjul en order börjar med (1 punktering, 2 husvagn, 4 bil). */
  quantity: number;
  /** Öre inkl. moms per enhet. */
  price: number;
}

export interface PriceCampaign {
  /** Öre per enhet medan den gäller; null när procent används. */
  price: number | null;
  /** 1–99 % av; null när pris används. */
  percent: number | null;
  /** Första och sista dagen (YYYY-MM-DD, båda med); null = öppet. */
  from: string | null;
  to: string | null;
  /** Vad kunden får veta: "Höstkampanj". */
  label: string | null;
}

/** Vad en åtgärd kostar för en bil. */
export interface ServicePrice {
  unit: PriceUnit;
  quantity: number;
  /** Öre per enhet efter eventuell kampanj. */
  unitPrice: number;
  /** Öre per enhet före kampanjen. */
  listUnitPrice: number;
  total: number;
  campaign: { label: string | null; to: string | null } | null;
  basis: 'rule' | 'service';
}

/** En mallrad på en åtgärd (som Standard Service Line i Business Central). */
export interface ServiceTemplateLine {
  type: 'labour' | 'part' | 'fee';
  code: string | null;
  description: string;
  articleId: string | null;
  quantity: number;
  /** Öre per styck INKL. moms; null = artikelns eget pris. */
  unitPrice: number | null;
  /** Tid, bara internt. */
  minutes: number | null;
}

// --- Prissättning ---

/** Hur verkstaden prissätter och skriver ut (Inställningar → Prissättning). */
export interface PricingSettings {
  profile: 'service' | 'workshop' | 'custom';
  /** order = ett pris för hela ordern; lines = jobb med prissatta rader. */
  priceEntry: 'order' | 'lines';
  privatePricesIncludeVat: boolean;
  companyPricesIncludeVat: boolean;
  roundToKrona: boolean;
  consumablesPercent: number | null;
  /** Öre. */
  consumablesMax: number | null;
  consumablesText: string;
  quoteValidDays: number;
  quoteTolerancePercent: number;
  quoteTerms: string | null;
  /** Öre. */
  defaultJobLimit: number | null;
  showVin: boolean;
  showMileage: boolean;
  requireMileage: boolean;
  /** Öre exkl. moms per timme, bara internt. */
  internalHourlyCost: number | null;
  stockOut: 'work_order_done' | 'sales_card_posted';
  /** Moms på inköp, %. Inköpspriser skrivs och visas inkl. den, lagras utan. */
  purchaseVatRate: number;
}

// --- Arbetsorder ---

export type WorkOrderStatus = 'open' | 'in_progress' | 'waiting_parts' | 'done' | 'cancelled';

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: 'Öppen',
  in_progress: 'Pågår',
  waiting_parts: 'Väntar på del',
  done: 'Klar',
  cancelled: 'Avbruten',
};

export type WorkOrderLineType = 'labour' | 'part' | 'environment_fee' | 'fee' | 'other';

export const WORK_ORDER_LINE_LABELS: Record<WorkOrderLineType, string> = {
  labour: 'Arbete',
  part: 'Del',
  environment_fee: 'Miljöavgift',
  fee: 'Avgift',
  other: 'Annat',
};

/** Moms per momssats: underlag (netto) och momsbelopp, öre. */
export interface VatBucket {
  rate: number;
  base: number;
  vat: number;
}

/** Summor för en order eller faktura. Alla belopp i öre. */
export interface OrderTotals {
  /** Före rabatt och fasta priser, i dokumentets prisläge. */
  gross: number;
  /** Vad rabatter och fasta priser tog bort (negativt om ett fast pris är högre än raderna). */
  discount: number;
  /** Momspliktigt belopp efter rabatt, exkl. moms. */
  net: number;
  vat: number;
  /** Öresutjämning; saknas på äldre dokument. */
  rounding?: number;
  /** Att betala, inkl. moms och öresutjämning. */
  total: number;
  byRate: VatBucket[];
  /** Satt när dokumentet säljer en bil med vinstmarginalbeskattning: momsen visas inte, den redovisas härifrån. */
  margin?: { sales: number; purchase: number; vat: number };
  /** Hur dokumentet var prissatt; saknas på äldre dokument = inkl. moms. */
  pricesIncludeVat?: boolean;
}

export interface InvoiceSeller {
  name: string;
  orgNo: string;
  vatNumber: string | null;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  email: string | null;
  fTax: boolean;
  bankgiro?: string | null;
  bankAccount?: string | null;
  swish?: string | null;
  paymentDetails: string | null;
  footer: string | null;
}

export interface InvoiceBuyer {
  type: CustomerType;
  customerCode?: string;
  name: string;
  orgNo: string | null;
  vatNumber: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
}

/** Fakturan eller kvittot som låser ordern eller säljkortet. */
export interface WorkOrderInvoice {
  /** FAK-00042. Null på ett utkast som inte är bokfört. */
  code: string | null;
  /** Satt på en kreditfaktura (KRE-…): vilket dokument den upphäver. Alla belopp är negativa. */
  credit?: { credits: string; reason: string };
  number?: number;
  /** Sant för förhandsvisningen: inget nummer, inget sparat, ordern går att ändra. */
  draft?: boolean;
  kind: InvoiceKind;
  issuedAt: string;
  supplyDate: string;
  /** Er referens från arbetsordern dokumentet fakturerar (en samlingsfaktura har en per order). */
  reference?: string | null;
  /** Förfallodatum. Bara en faktura har ett. */
  dueAt: string | null;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  totals: OrderTotals;
  /** Vad som gjorts och eventuell garanti, som det står på dokumentet. */
  performed: string | null;
  warranty: string | null;
  /** Rad för rad, när dokumentet kommer från ett säljkort. */
  rows?: InvoiceDocRow[];
  /** Jobben raderna är grupperade under, med delsumma. */
  sections?: InvoiceDocSection[];
  /**
   * En samlingsfaktura (två arbetsorder eller fler): orderna den gäller, var och en som ett eget
   * block med bil, referens och datum då arbetet utfördes (varje leverans ska dateras).
   */
  orders?: InvoiceDocOrder[];
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  /** Satt när kvittot är registrerat i kassaregistret: dess nummer, kontrollkod och kassa. */
  register?: RegisteredReceiptRef;
}

/** Det ett registrerat kvitto bär med sig, så att det kan skrivas ut med kontrollkod och nummer. */
export interface RegisteredReceiptRef {
  unitId: string;
  /** Kassabeteckning. */
  label: string;
  manufacturingNumber: string;
  receiptNumber: number;
  /** Z-rapporten kvittot räknas i. */
  zNumber: number;
  occurredAt: string;
  code: string;
  codeType: 'avstamningskod' | 'kontrollkod';
  controlSerial: string;
  registerVersion: string;
  /** Falskt för utvecklingsläget: ett sådant kvitto är inte giltigt. */
  certified: boolean;
  provider: string;
}

/** En rubrik (jobb) på dokumentet med delsumma, öre i dokumentets prisläge. */
export interface InvoiceDocSection {
  id: string;
  title: string;
  total: number;
  /** Fast pris: raderna skrivs ut utan pris. */
  fixed: boolean;
  /** Arbetsordern jobbet hör till, på en samlingsfaktura. */
  orderId?: string | null;
}

/** En arbetsorder på en samlingsfaktura, så som den skrivs ut. */
export interface InvoiceDocOrder {
  id: string;
  /** AO-00042. */
  code: string;
  regNo: string | null;
  vehicle: string | null;
  /** När arbetet utfördes: leveransens datum. */
  date: string;
  /** Er referens: den som lämnade bilen, eller kundens eget ordernummer. */
  reference: string | null;
  performed: string | null;
  /** Orderns rader efter sina rabatter, före en rabatt på hela kortet (öre). */
  total: number;
}

/** En rad på ett utfärdat dokument. Belopp i öre, i dokumentets prisläge (`totals.pricesIncludeVat`). */
export interface InvoiceDocRow {
  code?: string | null;
  sectionId?: string | null;
  /** Arbetsordern raden fakturerar, på en samlingsfaktura. */
  orderId?: string | null;
  hidePrice?: boolean;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  /** En bil såld med vinstmarginalbeskattning: skrivs utan momsbelopp. */
  vmb?: boolean;
  total: number;
}

/** Verkstadens uppgifter på fakturan. */
export interface SellerDetails extends Omit<InvoiceSeller, 'footer' | 'paymentDetails'> {
  bankgiro: string | null;
  bankAccount: string | null;
  swish: string | null;
  paymentDetails: string | null;
  footer: string | null;
  /** Dagar till förfallodatum på företagsfaktura. */
  paymentTermsDays: number;
}

export interface VatSource {
  count: number;
  net: number;
  vat: number;
  byRate: VatBucket[];
}

/** Utgående moms för en period. */
export interface VatReport {
  from: string;
  to: string;
  invoices: VatSource;
  receipts: VatSource;
  stockSales: VatSource;
  hotel: VatSource;
  /** Bilar sålda med vinstmarginalbeskattning: momsen på vinsten, aldrig på fakturan. */
  margin: { count: number; sales: number; purchase: number; base: number; vat: number };
  total: { net: number; vat: number; gross: number; byRate: VatBucket[] };
  doneNotInvoiced: number;
}

/** Kundens svar på ett jobb i kostnadsförslaget. */
export interface JobApproval {
  status: 'approved' | 'declined';
  at: string;
  method: 'phone' | 'sms' | 'email' | 'in_person' | 'link' | null;
  note: string | null;
}

export const APPROVAL_METHOD_LABELS: Record<NonNullable<JobApproval['method']>, string> = {
  phone: 'Telefon',
  sms: 'SMS',
  email: 'E-post',
  in_person: 'På plats / underskriven utskrift',
  link: 'Länk',
};

/** Hur en admin kan skriva ner ett svar (länken sätts av kundens egen sida). */
export type AnswerMethod = Exclude<NonNullable<JobApproval['method']>, 'link'>;

/** Läget på ett kostnadsförslag. */
export type QuoteStatus = 'none' | 'given' | 'approved' | 'declined';

/** Ett jobb på ordern: ett kundklagomål och vad som görs (KUND ANM). */
export interface WorkOrderJob {
  id: string;
  /** Kundens ord, t.ex. "Motorlampa lyser, går som vanligt". */
  title: string;
  /** Instruktion till mekanikern, t.ex. "Felsök / rep max 3000 kr". */
  instruction: string | null;
  /** Kunden ska godkänna innan jobbet blir dyrare än så här. Öre, orderns prisläge. */
  limit?: number | null;
  /** Jobbet kostar exakt så här. Öre, orderns prisläge. */
  fixedPrice?: number | null;
  approval?: JobApproval | null;
}

/** Ett kostnadsförslag som det lämnades. */
export interface WorkOrderQuote {
  givenAt: string;
  validUntil: string;
  tolerancePercent: number;
  total: number;
  net: number;
  jobs: { id: string; title: string; total: number }[];
  /** Kundens svar på hela förslaget; saknas medan vi väntar. */
  approval?: JobApproval | null;
}

/** Vad jobbet tjänade, bara internt. Öre exkl. moms. */
export interface AfterCalculation {
  revenue: number;
  partsCost: number;
  minutes: number;
  labourCost: number | null;
  margin: number;
}

/** En rad på arbetsordern: arbete, en del eller en avgift. Priset står aldrig på arbetsbladet. */
export interface WorkOrderLine {
  id: string;
  position: number;
  type: WorkOrderLineType;
  description: string;
  articleId: string | null;
  /** Timmar för arbete, antal för delar. */
  quantity: number;
  /** Extra instruktion till mekanikern, visas under raden. */
  instruction: string | null;
  /** Avbockad av mekanikern. */
  done: boolean;
  /** Tillagd av mekanikern under jobbet. */
  addedByStaff?: boolean;
  /** Delen saknas och måste beställas hem. */
  toOrder?: boolean;
  /** Delen är uttagen ur lagret (bokförd som försäljning när ordern blev klar). */
  stockBooked?: boolean;
  jobId?: string | null;
  /** Operations- eller artikelkod. */
  code?: string | null;
  /** Öre per styck i orderns prisläge; null = utan pris. */
  unitPrice?: number | null;
  discountPercent?: number;
  vatRate?: number;
  /** Används men debiteras inte (garanti, goodwill). */
  noCharge?: boolean;
  /** Tid i minuter, bara internt. */
  minutes?: number | null;
  /** Systemets rad (förbrukningsmaterial), räknas om vid varje sparning. */
  system?: boolean;
}

export interface WorkOrder {
  id: string;
  /** AO-00042 */
  code: string;
  number: number;
  customerId: string;
  vehicleId: string;
  bookingId: string | null;
  resourceId: string | null;
  /** Lyft eller plats, vid sidan av mekanikern i resourceId. */
  placeId: string | null;
  customerName: string;
  phone: string | null;
  regNo: string;
  vehicle: string | null;
  /** Bilens färg ur bilkortet (bara i listan). */
  vehicleColor?: string | null;
  resourceName: string | null;
  placeName: string | null;
  status: WorkOrderStatus;
  /** Startdatum (bilen lämnas in), ISO-tid. */
  receivedAt: string;
  /** Klar senast / hämtas, ISO-tid. */
  pickupAt: string | null;
  /** När ordern blev Klar (leveransens datum på fakturan); null medan den inte är klar. */
  doneAt?: string | null;
  /** Ett överenskommet pris för hela ordern, öre i orderns prisläge. Syns aldrig på arbetsbladet. */
  price: number | null;
  priceNote: string | null;
  /** Priserna på ordern är inkl. moms (standard) eller exkl. moms. */
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  /** Mätarställning, km. */
  mileage?: number | null;
  yourReference?: string | null;
  ourReference?: string | null;
  jobs?: WorkOrderJob[];
  quote?: WorkOrderQuote | null;
  /** Inget förslag, lämnat (väntar på svar), godkänt eller nekat. */
  quoteStatus?: QuoteStatus;
  /** Kostnadsförslaget (KF-…) som ordern gjordes av. */
  quoteId?: string | null;
  /** Fakturerad (gammal faktura eller bokfört säljkort): ordern är låst. */
  locked?: boolean;
  /** Vad som gjorts (kvittot). */
  performed: string | null;
  warranty: string | null;
  /** Någon rad är en del som måste beställas. */
  hasMissing?: boolean;
  remarks: string | null;
  notes: string | null;
  /** FAK-00042 när ordern är fakturerad (då är den låst). */
  invoiceCode?: string | null;
  invoicedAt?: string | null;
  /** Vad dokumentet är och vad det begär, för fakturalistan. */
  invoiceKind?: InvoiceKind | null;
  invoiceDueAt?: string | null;
  /** Att betala enligt dokumentet, öre inkl. moms. */
  invoiceTotal?: number | null;
  paidAt?: string | null;
  paymentMethod?: PaymentMethod | null;
}

export interface WorkOrderDetail extends WorkOrder {
  lines: WorkOrderLine[];
  /** Att betala, öre inkl. moms. */
  total: number;
  /** Netto, moms per sats och belopp att betala. */
  totals: OrderTotals;
  /** Vad varje rad kostar efter rabatt och fasta priser, per rad-id. */
  amounts?: Record<string, number>;
  /** Delsumma per jobb. */
  jobTotals?: Record<string, number>;
  /** Jobb över sin gräns som kunden inte godkänt. */
  needsApproval?: string[];
  /** Över kostnadsförslaget med mer än det tillät. */
  overQuote?: boolean;
  afterCalculation?: AfterCalculation | null;
  invoice: WorkOrderInvoice | null;
  /** Lagerdelar på en klar order som inte kunde tas ur lagret (saknas eller arkiverad). */
  stockMissing?: number;
}

export interface WorkOrderLineInput {
  /** Befintlig rad, så att dess lageruttag behålls när raderna ersätts. */
  id?: string;
  articleId?: string | null;
  toOrder?: boolean;
  type: WorkOrderLineType;
  description: string;
  quantity: number;
  instruction?: string | null;
  done: boolean;
  jobId?: string | null;
  code?: string | null;
  unitPrice?: number | null;
  discountPercent?: number;
  vatRate?: number;
  noCharge?: boolean;
  minutes?: number | null;
}

export interface WorkOrderJobInput {
  id: string;
  title: string;
  instruction?: string | null;
  limit?: number | null;
  fixedPrice?: number | null;
}

export interface WorkOrderInput {
  customerId: string;
  vehicleId: string;
  resourceId: string | null;
  /** Lyft eller plats, vid sidan av mekanikern i resourceId. */
  placeId?: string | null;
  status: WorkOrderStatus;
  receivedAt: string;
  pickupAt: string | null;
  price: number | null;
  priceNote: string | null;
  performed: string | null;
  warranty: string | null;
  remarks: string | null;
  notes: string | null;
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  mileage?: number | null;
  yourReference?: string | null;
  ourReference?: string | null;
  jobs?: WorkOrderJobInput[];
  lines: WorkOrderLineInput[];
}

export interface Supplier {
  id: string;
  /** LEV-0001 */
  code: string;
  number: number;
  name: string;
  orgNo: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}

export type SupplierInput = Partial<
  Pick<Supplier, 'name' | 'orgNo' | 'phone' | 'email' | 'notes' | 'active'>
>;

export interface SupplierDetail extends Supplier {
  purchases: TradeRow[];
  purchaseCount: number;
}

// --- Säljkort ---

export type SalesCardStatus = 'draft' | 'posted';
export type SalesLineType = 'article' | 'service' | 'labour' | 'storage' | 'free' | 'car';

export interface SalesLine {
  id: string;
  type: SalesLineType;
  code?: string | null;
  sectionId?: string | null;
  description: string;
  articleId: string | null;
  depositId: string | null;
  /** Bilen på en `car`-rad. */
  carId?: string | null;
  /** Vad bilen kostade verkstaden (öre) när raden skapades; satt = vinstmarginalbeskattning (VMB). */
  vmbPurchase?: number | null;
  quantity: number;
  /** Öre per styck, i kortets prisläge. */
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  stockBooked: boolean;
  /** Vad raden kostar efter radens och kortets rabatt, öre i kortets prisläge. */
  amount: number;
  /** Arbetsordern raden kommer från (servern håller den); rader som lagts till på kortet har ingen. */
  workOrderId?: string | null;
}

/** En rubrik (jobb) på säljkortet. Med fast pris skrivs raderna ut utan pris. */
export interface SalesSection {
  id: string;
  title: string;
  fixedPrice: number | null;
  /** Arbetsordern jobbet kommer från (servern håller den). */
  workOrderId?: string | null;
}

/** En arbetsorder som säljkortet fakturerar, så som den var när den lades på kortet. */
export interface SalesCardOrder {
  id: string;
  number: number;
  /** AO-00042. */
  code: string;
  regNo: string | null;
  vehicle: string | null;
  /** När arbetet blev klart. */
  doneAt: string;
  yourReference: string | null;
  performed: string | null;
  /** Orderns delsumma på kortet (öre, före kortrabatt). */
  total: number;
}

/** En klar arbetsorder som väntar på att faktureras (levererat ej fakturerat). */
export interface UnbilledOrder {
  id: string;
  code: string;
  regNo: string;
  vehicle: string | null;
  doneAt: string;
  yourReference: string | null;
  /** Vad kunden betalar för den, öre inkl. moms. */
  total: number;
  /** Ett utkast till säljkort den redan ligger på; null = ingen faktura påbörjad. */
  card: { id: string; code: string } | null;
}

/** En kunds klara, ofakturerade arbetsorder. */
export interface UnbilledCustomer {
  customer: {
    id: string;
    code: string;
    name: string;
    type: CustomerType;
    collectiveInvoice: boolean;
    paymentTermsDays: number | null;
  };
  orders: UnbilledOrder[];
  total: number;
}

export interface SalesDiscount {
  type: 'percent' | 'amount';
  /** Procent, eller öre inkl. moms. */
  value: number;
  reason: string | null;
}

/** Säljkortet i listor. */
export interface SalesCardItem {
  id: string;
  number: number;
  /** SK-00042. */
  code: string;
  customerId: string | null;
  vehicleId: string | null;
  customerName: string | null;
  regNo: string | null;
  vehicle: string | null;
  workOrderId: string | null;
  status: SalesCardStatus;
  lineCount: number;
  /** Hur många arbetsorder kortet fakturerar; två eller fler = en samlingsfaktura. */
  orderCount?: number;
  /** Att betala, öre inkl. moms. */
  total: number;
  /** Numret på det kortet bokfördes som: FAK-00042 för en faktura, KV-00042 för ett kvitto. */
  documentCode: string | null;
  /** Bara en faktura har ett fakturanummer (FAK-); ett kvitto har ett kvittonummer (KV-). */
  invoiceCode: string | null;
  receiptCode: string | null;
  invoicedAt: string | null;
  /** Förfallodatum, när kortet blev en faktura. */
  dueAt: string | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  /** Kreditfakturans nummer (KRE-…) och datum när dokumentet har krediterats. */
  creditCode?: string | null;
  creditedAt?: string | null;
  kind: InvoiceKind | null;
  /** Bilhandelns (Hall) om kortet har en bilrad, annars verkstadens (Axle). */
  product: 'axle' | 'hall';
  /** Bilen på kortet så som raden lyder ("Volvo V70 (ABC123)"); null utan bil. */
  carLabel: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCardLinks {
  customer: { id: string; code: string; name: string; type: CustomerType } | null;
  vehicle: { id: string; regNo: string; label: string | null } | null;
  workOrder: { id: string; code: string; regNo?: string | null } | null;
  /** Alla arbetsorder kortet fakturerar. */
  workOrders?: { id: string; code: string; regNo: string | null }[];
  deposits: { id: string; code: string; regNo: string }[];
}

export interface SalesCardDetail extends SalesCardItem {
  lines: SalesLine[];
  sections?: SalesSection[];
  /** Arbetsorderna kortet fakturerar; två eller fler = en samlingsfaktura med ett block per order. */
  orders?: SalesCardOrder[];
  sectionTotals?: Record<string, number>;
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  discount: SalesDiscount | null;
  totals: OrderTotals;
  performed: string | null;
  warranty: string | null;
  /** Det kortet bokfördes som, en faktura eller ett kvitto (null medan det är ett utkast). */
  document: WorkOrderInvoice | null;
  invoice: WorkOrderInvoice | null;
  receipt: WorkOrderInvoice | null;
  /** På ett återöppnat utkast: numret (och typen) det tar tillbaka när det bokförs igen. */
  reservedDocumentCode?: string | null;
  reservedKind?: InvoiceKind | null;
  reopenings?: { at: string; by: string; kind: InvoiceKind; number: number }[];
  /** Satt när ett registrerat kvitto har tagits tillbaka med en retur. */
  returned?: {
    at: string;
    by: string;
    receiptNumber: number;
    reason: string;
    total: number;
  } | null;
  /** Satt när hela fakturan eller kvittot har krediterats: kreditfakturan, med minusbelopp. */
  credit?: {
    code: string;
    number: number;
    issuedAt: string;
    reason: string;
    /** FAK-… eller KV-… som kreditfakturan upphäver. */
    creditsCode: string;
    restocked: boolean;
    document: WorkOrderInvoice;
  } | null;
  /** Vid retur: hur återbetalningen av en kortbetalning gick. */
  refunds?: { paymentId: string; status: 'done' | 'failed'; error?: string }[];
  /** Gånger dokumentet mejlats till kunden; ett skickat dokument kan inte återöppnas. */
  sends?: { channel: 'email'; to: string; at: string }[];
  /** När kunden först öppnade länken. */
  viewedAt?: string | null;
  links: SalesCardLinks;
}

export interface SalesLineInput {
  id?: string;
  type: SalesLineType;
  code?: string | null;
  sectionId?: string | null;
  description?: string;
  articleId?: string;
  depositId?: string;
  carId?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  vatRate?: number;
}

export interface SalesCardInput {
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string;
  /** Flera klara arbetsorder för samma kund på ett kort: en samlingsfaktura. */
  workOrderIds?: string[];
  lines?: SalesLineInput[];
  discount?: { type: 'percent' | 'amount'; value: number; reason?: string } | null;
  note?: string;
  performed?: string;
  warranty?: string;
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  sections?: SalesSection[];
}

// --- Artikeltyper och lager ---

export type ArticleField = 'brand' | 'model' | 'sku' | 'supplier' | 'warehouse';
/** Krävs, valfritt eller dolt på artikelkortet för en typ. */
export type FieldMode = 'required' | 'optional' | 'hidden';
export type ArticleSpec = 'tyre' | 'rim' | 'none';

export const ARTICLE_FIELD_LABELS: Record<ArticleField, string> = {
  brand: 'Märke',
  model: 'Benämning / modell',
  sku: 'Artikelnummer',
  supplier: 'Leverantör',
  warehouse: 'Lager och plats',
};
export const FIELD_MODE_LABELS: Record<FieldMode, string> = {
  required: 'Krävs',
  optional: 'Valfritt',
  hidden: 'Dölj',
};
export const SPEC_LABELS: Record<ArticleSpec, string> = {
  tyre: 'Däckmått',
  rim: 'Fälgmått',
  none: 'Inga mått',
};

/** En artikeltyp (register): styr vilka fält artikelkortet kräver och vilka mått det frågar efter. */
export interface ArticleType {
  id: string;
  /** TYP-001 */
  code: string;
  number: number;
  name: string;
  spec: ArticleSpec;
  fields: Record<ArticleField, FieldMode>;
  /** Vad nya artiklar av typen börjar med i "Påminn när det är kvar"; 0 = enstaka delar. */
  reorderLevel: number | null;
  active: boolean;
}

export type WarehouseKind = 'own' | 'customer';
export const WAREHOUSE_KIND_LABELS: Record<WarehouseKind, string> = {
  own: 'Eget lager (varor att sälja)',
  customer: 'Kundgods (t.ex. däckhotell)',
};

export interface WarehouseLocation {
  id: string;
  name: string;
}

/** Ett lager med sina platser (hyllor, rum). */
export interface Warehouse {
  id: string;
  /** LAG-001 */
  code: string;
  number: number;
  name: string;
  kind: WarehouseKind;
  notes: string | null;
  locations: WarehouseLocation[];
  active: boolean;
}

// --- Kostnadsförslag ---

/** Var förslaget står. `expired` = lämnat men giltighetstiden har gått ut. */
export type QuoteDocStatus = 'draft' | 'given' | 'approved' | 'declined';
export type QuoteShownStatus = QuoteDocStatus | 'expired';

export const QUOTE_STATUS_LABELS: Record<QuoteShownStatus, string> = {
  draft: 'Utkast',
  given: 'Väntar på svar',
  approved: 'Godkänt',
  declined: 'Nekat',
  expired: 'Utgånget',
};

export interface QuoteJob {
  id: string;
  title: string;
  /** Öre i förslagets prisläge. */
  fixedPrice: number | null;
}

export interface QuoteLine {
  id: string;
  jobId: string | null;
  type: WorkOrderLineType;
  description: string;
  articleId: string | null;
  code: string | null;
  quantity: number;
  /** Öre per styck i förslagets prisläge. */
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  system: boolean;
}

/** En gång förslaget skickades till kunden. */
export interface QuoteSend {
  channel: 'sms' | 'email';
  to: string;
  at: string;
}

export interface Quote {
  id: string;
  number: number;
  /** KF-00042 */
  code: string;
  customerId: string;
  vehicleId: string;
  customerName: string;
  phone: string | null;
  regNo: string;
  vehicle: string | null;
  status: QuoteDocStatus;
  shownStatus: QuoteShownStatus;
  pricesIncludeVat: boolean;
  roundToKrona: boolean;
  remarks: string | null;
  mileage: number | null;
  yourReference: string | null;
  ourReference: string | null;
  givenAt: string | null;
  validUntil: string | null;
  tolerancePercent: number;
  givenTotal: number | null;
  approval: JobApproval | null;
  /** Kunden har en länk som fungerar. */
  shared: boolean;
  sends: QuoteSend[];
  /** När kunden först öppnade länken. */
  viewedAt: string | null;
  workOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Att betala, öre inkl. moms. */
  total: number;
}

export interface QuoteDetail extends Quote {
  /** Adressen kunden öppnar (null tills förslaget lämnats). */
  shareUrl: string | null;
  jobs: QuoteJob[];
  lines: QuoteLine[];
  totals: OrderTotals;
  /** Vad varje rad kostar efter rabatt, per rad-id. */
  amounts: Record<string, number>;
  /** Delsumma per jobb. */
  jobTotals: Record<string, number>;
}

export interface QuoteInput {
  customerId: string;
  vehicleId: string;
  remarks?: string | null;
  mileage?: number | null;
  yourReference?: string | null;
  ourReference?: string | null;
  pricesIncludeVat?: boolean;
  jobs?: { id: string; title: string; fixedPrice?: number | null }[];
  lines?: {
    id?: string;
    jobId: string | null;
    type: WorkOrderLineType;
    description: string;
    articleId: string | null;
    code: string | null;
    quantity: number;
    unitPrice: number | null;
    discountPercent: number;
    vatRate: number;
  }[];
}

// --- Däckhotell: förval ---

/** Vad en ny inlämning börjar med (Inställningar → Däckhotell). */
export interface StorageDefaults {
  contents: StorageContents;
  quantity: number;
  studded: boolean;
  condition: DepositCondition;
  accessories: StorageAccessory[];
  warehouseId: string | null;
  locationId: string | null;
  winterPickupMonth: number;
  summerPickupMonth: number;
  paymentCycleMonths: number;
}

export const MONTH_LABELS = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December',
];

export interface QuoteSendBody {
  channels: ('sms' | 'email')[];
  phone?: string;
  email?: string;
  smsText?: string;
  emailNote?: string;
}

export interface QuoteSendResponse {
  quote: QuoteDetail;
  results: { channel: 'sms' | 'email'; to: string; ok: boolean }[];
}

/** En rad på kundens sida: priser är null när jobbet har fast pris. */
export interface QuotePublicRow {
  id: string;
  type: WorkOrderLineType;
  description: string;
  quantity: number;
  unitPrice: number | null;
  discountPercent: number;
  amount: number | null;
}

/** Förslaget som kunden ser det på `/q/<nyckel>`. */
export interface QuotePublic {
  code: string;
  /** open = väntar på kunden. */
  state: 'open' | 'approved' | 'declined' | 'expired';
  seller: {
    name: string;
    orgNo: string;
    address: string;
    postalCode: string;
    city: string;
    phone: string | null;
    email: string | null;
  };
  customerName: string;
  regNo: string;
  vehicle: string | null;
  remarks: string | null;
  mileage: number | null;
  givenAt: string | null;
  validUntil: string | null;
  tolerancePercent: number;
  pricesIncludeVat: boolean;
  terms: string;
  jobs: {
    id: string;
    title: string;
    fixedPrice: boolean;
    total: number;
    rows: QuotePublicRow[];
  }[];
  otherRows: QuotePublicRow[];
  totals: OrderTotals;
  answer: { status: 'approved' | 'declined'; at: string } | null;
}

/** Det kunden ser på sin länk `/i/<nyckel>`: dokumentet och bilen, inget internt. */
export interface PublicDocument {
  document: WorkOrderInvoice;
  regNo: string | null;
  vehicle: string | null;
  /** Kan kunden betala fakturan här, och hur. */
  payment?: { available: boolean; paid: boolean; methods: ('card' | 'swish')[] };
}

// --- Kassaregister och betalningar ---

/** Kassaregistrets läge för verkstaden. */
export interface RegisterStatus {
  configured: boolean;
  version: string;
  model: string;
  program: string;
  registerNumber: string | null;
  unit: {
    id: string;
    label: string;
    manufacturingNumber: string;
    status: 'active' | 'suspended';
    company: { name: string; orgNo: string; address: string };
    control: { provider: string; serial: string; certified: boolean };
  } | null;
  counters: {
    seq: number;
    receipt: number;
    copy: number;
    z: number;
    grandSales: number;
    grandReturns: number;
  } | null;
  control: {
    reachable: boolean;
    certified: boolean;
    provider: string;
    detail: string | null;
  } | null;
}

export interface RegisterReport {
  kind: 'X' | 'Z';
  number: number | null;
  from: string | null;
  to: string;
  totalSales: number;
  vat: { rate: number; vat: number }[];
  goodsSold: number;
  servicesSold: number;
  receipts: number;
  copies: number;
  copiesAmount: number;
  payments: { means: 'card' | 'swish' | 'cash'; amount: number }[];
  returns: number;
  returnsAmount: number;
  discounts: number;
  grandTotalSales: number;
  grandTotalReturns: number;
  grandTotalNet: number;
}

/** En rad i kassaregistrets journal. */
export interface RegisterEntry {
  seq: number;
  kind: 'start' | 'sale' | 'return' | 'copy' | 'x_report' | 'z_report';
  occurredAt: string;
  operator: string | null;
  code: string | null;
  receiptNumber: number | null;
  returnOf: number | null;
  zNumber: number | null;
  reason: string | null;
  receipt: {
    total: number;
    totalVat: number;
    payments: { means: string; amount: number }[];
  } | null;
  report: RegisterReport | null;
  signature: { certified: boolean; controlSerial: string } | null;
  registerVersion: string;
  hash: string;
}

export type RegisterChain =
  { ok: true; entries: number } | { ok: false; brokenAtSeq: number; reason: string };

export interface PaymentAccount {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  ready: boolean;
  swish: boolean;
  terminalLocationId: string | null;
  readers: { id: string; label: string }[];
  feePercent: number;
}

export interface PaymentReader {
  id: string;
  label: string;
  deviceType: string | null;
  status: 'online' | 'offline';
  busy: boolean;
}

/** En betalning via Stripe för ett säljkort. */
export interface PaymentRow {
  id: string;
  cardId: string;
  purpose: 'invoice' | 'receipt';
  channel: 'checkout' | 'reader';
  amount: number;
  applicationFee: number;
  method: PaymentMethod | null;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  failureReason: string | null;
  /** Hur det gick att bokföra betalningen på kortet; `failed` = pengarna är inne men kvittot kunde inte utfärdas. */
  receipt: 'not_needed' | 'pending' | 'done' | 'failed';
  receiptError: string | null;
  refundedAt: string | null;
  refundError: string | null;
  createdAt: string;
  paidAt: string | null;
}

// ---- Bilhandel: bilar till salu och verkstadens publika webbplats ----

export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Inköpt',
  active: 'Till salu',
  reserved: 'Reserverad',
  sold: 'Såld',
};

export interface ListingInquiry {
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  at: string;
}

/**
 * Hur momsen på försäljningen hanteras. `margin` = vinstmarginalbeskattning (VMB): moms bara på
 * vinstmarginalen, inget momsbelopp på fakturan; kräver ett inköp utan moms. `standard` = 25 % på
 * hela priset.
 */
export type VatScheme = 'margin' | 'standard';

/** Vad bilen kostade: öre som betalades säljaren, med moms om köpehandlingen har någon. */
export interface CarPurchase {
  price: number;
  /** Momsen på köpehandlingen: 0 = ingen, 25 = faktura med avdragsgill moms. */
  vatRate: number;
  date: string | null;
  seller: string | null;
  /** Säljarens person- eller organisationsnummer, som skrivet. */
  sellerId: string | null;
}

/** Pengar som lagts på bilen efter köpet (däck, reparation, transport). Öre som betalades, inkl. moms. */
export interface CarCost {
  id: string;
  label: string;
  amount: number;
  /** Momsen i beloppet; 0 = ingen. */
  vatRate: number;
}

/** Vad bilen ger, räknat av servern (spegel: `shared/car-economy.ts`). Öre. */
export interface CarEconomy {
  basis: 'sold' | 'asking' | null;
  salePrice: number | null;
  purchaseNet: number | null;
  costsNet: number;
  totalCost: number | null;
  outputVat: number | null;
  inputVat: number;
  vatToPay: number | null;
  profit: number | null;
  marginPercent: number | null;
  markupPercent: number | null;
}

/** En bil till salu, som personalen ser den. Priset är öre; null = pris på förfrågan. */
export interface CarListing {
  id: string;
  regNo: string;
  heading: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  title: string | null;
  description: string | null;
  price: number | null;
  mileageKm: number | null;
  color: string | null;
  fuel: string | null;
  gearbox: string | null;
  powerHp: number | null;
  bodyText: string | null;
  fourWheelDrive: boolean | null;
  inspectionDue: string | null;
  equipment: string[];
  /** Filnamn, i den ordning de visas; första är omslagsbild. */
  images: string[];
  /** Adresser till bilderna (under `environment.apiUrl`), i samma ordning. */
  imageUrls: (string | null)[];
  status: ListingStatus;
  inquiries: ListingInquiry[];
  purchase: CarPurchase | null;
  costs: CarCost[];
  vatScheme: VatScheme;
  /** Köpehandlingar (filnamn) som ligger på bilen; hämtas med inloggning, aldrig publika. */
  purchaseDocuments: string[];
  /** Säljkortet bilen är såld på; satt = bilens pengar är låsta. */
  soldCardId: string | null;
  /** Utkastet på säljkort som håller bilen (då är den Reserverad). */
  dealCardId?: string | null;
  soldPrice: number | null;
  soldAt: string | null;
  blocket: CarBlocket;
  economy: CarEconomy;
  createdAt: string;
  updatedAt: string;
}

export type CarListingInput = Partial<
  Pick<
    CarListing,
    | 'make'
    | 'model'
    | 'variant'
    | 'year'
    | 'title'
    | 'description'
    | 'price'
    | 'mileageKm'
    | 'color'
    | 'fuel'
    | 'gearbox'
    | 'powerHp'
    | 'bodyText'
    | 'fourWheelDrive'
    | 'inspectionDue'
    | 'equipment'
    | 'images'
    | 'status'
    | 'purchase'
    | 'costs'
    | 'vatScheme'
    | 'soldPrice'
    | 'soldAt'
  >
>;

export type DomainStatus = 'pending' | 'active' | 'error';

export interface DnsRecord {
  type: 'CNAME' | 'TXT' | 'A';
  name: string;
  value: string;
}

export interface SiteDomain {
  hostname: string;
  status: DomainStatus;
  records: DnsRecord[];
  error: string | null;
  /** Catso har skapat DNS-posterna åt domänen (den ligger i vårt konto). */
  autoDns?: boolean;
}

export interface SiteInfoPage {
  title: string;
  body: string;
}

/** Landningssidans utseende och text. `seo` och `analytics` sätter bara Catso. */
export type SiteTemplate = 'editorial' | 'showroom' | 'market' | 'local';

export interface SitePageContent {
  template: SiteTemplate;
  theme: 'dark' | 'light';
  accent: string;
  logoUrl: string | null;
  hero: {
    eyebrow: string | null;
    headline: string | null;
    emphasis: string | null;
    text: string | null;
    imageUrl: string | null;
  };
  hours: string[];
  financing: SiteInfoPage | null;
  tradeIn: SiteInfoPage | null;
  about: SiteInfoPage | null;
  faq: { q: string; a: string }[];
  seo: {
    title: string | null;
    description: string | null;
    city: string | null;
    ogImage: string | null;
  };
  analytics: { gaId: string | null };
}

/** Verkstadens publika webbplats: påslagen och vilka domäner som leder dit. */
export interface SiteSettings {
  page: SitePageContent;
  enabled: boolean;
  title: string | null;
  intro: string | null;
  /** Dölj regnumret för besökare. */
  hideRegNo: boolean;
  domains: SiteDomain[];
}

/** En rad på ett inköpskort; kostnaden är öre exkl. moms, som den lagras på artikeln. */
export interface PurchaseCardLine {
  id: string;
  articleId: string;
  quantity: number;
  unitCost: number;
  /** Artikeln som den ser ut nu (bara när kortet öppnas, inte i listan). */
  article: Article | null;
}

/** Inköpskortet: ett inköp som utkast tills det bokförs in i lagret. */
export interface PurchaseCard {
  id: string;
  /** IK-00042 */
  code: string;
  number: number;
  status: 'draft' | 'posted';
  supplierId: string | null;
  supplier: { id: string; code: string; name: string } | null;
  /** Leverantörens faktura- eller ordernummer. */
  reference: string | null;
  url: string | null;
  note: string | null;
  purchasedAt: string | null;
  lines: PurchaseCardLine[];
  units: number;
  /** Öre exkl. moms. */
  total: number;
  /** INK-00007 när kortet är bokfört. */
  documentCode: string | null;
  documentNumber: number | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseCardInput {
  supplierId?: string | null;
  reference?: string | null;
  url?: string | null;
  note?: string | null;
  purchasedAt?: string | null;
  lines?: { id?: string; articleId: string; quantity: number; unitCost: number }[];
}

/** Grossistens katalog (Gummigrossen), läst med verkstadens egen inloggning. Pengar i öre. */
export interface SupplierStatus {
  connected: boolean;
  name: string | null;
}

export interface GummigrossenStatus extends SupplierStatus {
  customerNo: string | null;
}

export interface CatalogTyre {
  width: number;
  profile: number;
  rimDiameter: number;
  loadIndex: number | null;
  speedIndex: string | null;
  season: Season;
  studded: boolean;
  runFlat: boolean;
}

export interface CatalogItem {
  source: 'gummigrossen';
  sourceId: string;
  kind: 'tyre' | 'rim' | 'other';
  title: string;
  brand: string;
  model: string;
  ean: string | null;
  partNo: string | null;
  tyre: CatalogTyre | null;
  /** Vad verkstaden betalar per styck exkl. moms; med miljöavgift när costFinal. */
  costExVat: number;
  costFinal: boolean;
  /** Rekommenderat konsumentpris inkl. moms. */
  retailInclVat: number | null;
  available: number;
  incoming: number;
  stock: { warehouse: string; quantity: number }[];
  nextDelivery: string | null;
  label: {
    fuel: string | null;
    wetGrip: string | null;
    noiseClass: string | null;
    noiseDb: number | null;
  } | null;
  imageId: number | null;
}

/** En träff: produkten och verkstadens egen artikel för den, om den finns. */
export interface CatalogHit extends CatalogItem {
  articleId: string | null;
  inStock: number | null;
  /** Från Axles egen katalog: inget pris eller lager än, det hämtas när däcket väljs. */
  fromCatalog?: boolean;
}

export interface CatalogOrder {
  id: string;
  date: string;
  status: string;
  totalExVat: number;
  reference: string | null;
  imported: { id: string; number: number } | null;
}

/** Så här kan väggskärmen se ut. Samma order i alla; ägaren väljer. */
export type ScreenStyle = 'board' | 'light' | 'list' | 'mechanics';

/** Skärmen i verkstaden: på eller av, hemligheten i länken (`/s/<nyckel>`) och utseendet. */
export interface ScreenStatus {
  enabled: boolean;
  token: string | null;
  style: ScreenStyle;
}

/** En order som väggskärmen visar: inget om kunden och inga priser. */
export interface ScreenOrder {
  id: string;
  code: string;
  status: 'open' | 'in_progress' | 'waiting_parts';
  regNo: string;
  vehicle: string | null;
  vehicleColor: string | null;
  mechanic: string | null;
  place: string | null;
  startAt: string;
  dueAt: string | null;
  overdue: boolean;
  remarks: string | null;
  jobs: { id: string; title: string; instruction: string | null }[];
  progress: { done: number; total: number };
  missingParts: boolean;
}

export interface ScreenView {
  style: ScreenStyle;
  garageName: string;
  at: string;
  orders: ScreenOrder[];
  hidden: number;
}
