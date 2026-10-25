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
  supplierName: string | null;
  note: string | null;
  units: number;
  total: number;
  customer: TradeParty | null;
  vehicle: TradeVehicle | null;
  supplier: TradeParty | null;
  lines: TradeLine[];
}

export type TradeKind = 'sales' | 'purchases';

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

export type StockAction = 'receive' | 'sell' | 'return' | 'write-off' | 'adjust';

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

export type BookingStatus = 'booked' | 'arrived' | 'done' | 'cancelled' | 'no_show';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
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
  orgNo: string | null;
  /** Momsregistreringsnummer (företag), t.ex. SE556123456701. */
  vatNumber: string | null;
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
  active: boolean;
}

export type CustomerInput = Partial<
  Pick<
    Customer,
    | 'type'
    | 'name'
    | 'orgNo'
    | 'vatNumber'
    | 'address'
    | 'postalCode'
    | 'city'
    | 'phone'
    | 'email'
    | 'notes'
    | 'labourDiscount'
    | 'partsDiscount'
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
  /** Däckdimension, t.ex. "205/55 R16". */
  tyreSize?: string | null;
  rimSize?: string | null;
  /** Alla tekniska rader från fordonsuppslaget (t.ex. första registrering). */
  specs?: Record<string, string> | null;
  /** Bestående anmärkningar som följer bilen. */
  notes: string | null;
  active: boolean;
  customer: { id: string; code: string; name: string; phone: string | null } | null;
}

export type VehicleInput = Partial<
  Pick<Vehicle, 'customerId' | 'regNo' | 'make' | 'model' | 'year' | 'vin' | 'notes' | 'active'>
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
}

export interface VehicleLookup {
  /** `unavailable`: källan gick inte att använda just nu, fyll i för hand. */
  status: 'found' | 'not_found' | 'unavailable';
  info: VehicleInfo | null;
}

/** Bilens kort: bilen med dess senaste bokningar. */
export interface VehicleDetail extends Vehicle {
  sales: TradeRow[];
  bookings: Booking[];
  workOrders: WorkOrder[];
}

export interface CustomerDetail extends Customer {
  sales: TradeRow[];
  saleCount: number;
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
  active: boolean;
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

/** Fakturan (företag) eller kvittot (privat) som låser ordern. */
export interface WorkOrderInvoice {
  /** FAK-00042. Null på ett utkast som inte är bokfört. */
  code: string | null;
  number?: number;
  /** Sant för förhandsvisningen: inget nummer, inget sparat, ordern går att ändra. */
  draft?: boolean;
  kind: 'invoice' | 'receipt';
  issuedAt: string;
  supplyDate: string;
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
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
}

/** En rubrik (jobb) på dokumentet med delsumma, öre i dokumentets prisläge. */
export interface InvoiceDocSection {
  id: string;
  title: string;
  total: number;
  /** Fast pris: raderna skrivs ut utan pris. */
  fixed: boolean;
}

/** En rad på ett utfärdat dokument. Belopp i öre, i dokumentets prisläge (`totals.pricesIncludeVat`). */
export interface InvoiceDocRow {
  code?: string | null;
  sectionId?: string | null;
  hidePrice?: boolean;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
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
  stockSales: VatSource;
  hotel: VatSource;
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
  resourceName: string | null;
  placeName: string | null;
  status: WorkOrderStatus;
  /** Startdatum (bilen lämnas in), ISO-tid. */
  receivedAt: string;
  /** Klar senast / hämtas, ISO-tid. */
  pickupAt: string | null;
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
  paidAt?: string | null;
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
export type SalesLineType = 'article' | 'service' | 'labour' | 'storage' | 'free';

export interface SalesLine {
  id: string;
  type: SalesLineType;
  code?: string | null;
  sectionId?: string | null;
  description: string;
  articleId: string | null;
  depositId: string | null;
  quantity: number;
  /** Öre per styck, i kortets prisläge. */
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  stockBooked: boolean;
  /** Vad raden kostar efter radens och kortets rabatt, öre i kortets prisläge. */
  amount: number;
}

/** En rubrik (jobb) på säljkortet. Med fast pris skrivs raderna ut utan pris. */
export interface SalesSection {
  id: string;
  title: string;
  fixedPrice: number | null;
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
  /** Att betala, öre inkl. moms. */
  total: number;
  /** FAK-00042 när kortet är bokfört. */
  invoiceCode: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  kind: 'invoice' | 'receipt' | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCardLinks {
  customer: { id: string; code: string; name: string } | null;
  vehicle: { id: string; regNo: string; label: string | null } | null;
  workOrder: { id: string; code: string } | null;
  deposits: { id: string; code: string; regNo: string }[];
}

export interface SalesCardDetail extends SalesCardItem {
  lines: SalesLine[];
  sections?: SalesSection[];
  sectionTotals?: Record<string, number>;
  pricesIncludeVat?: boolean;
  roundToKrona?: boolean;
  discount: SalesDiscount | null;
  totals: OrderTotals;
  performed: string | null;
  warranty: string | null;
  invoice: WorkOrderInvoice | null;
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
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  vatRate?: number;
}

export interface SalesCardInput {
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string;
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
  workOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Att betala, öre inkl. moms. */
  total: number;
}

export interface QuoteDetail extends Quote {
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
