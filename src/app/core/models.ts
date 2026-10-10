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
  boltCount: number;
  boltCircle: number;
  centerBore?: number | null;
  offset: number;
  material: RimMaterial;
  color?: string | null;
  sizeLabel?: string;
}

export interface Article {
  id: string;
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
  quantity: number;
  stockLevel: StockLevel;
  reorderLevel: number;
  averageCost: number;
  sellPrice: number;
  margin: number;
  marginPercent: number | null;
  stockValue: number;
  supplier: string | null;
  notes: string | null;
  active: boolean;
  lastPurchasedAt: string | null;
}

export interface ArticleInput {
  category: Category;
  brand: string;
  model: string;
  sku?: string;
  /** null rensar specen (vid byte av kategori). */
  tyre?: Omit<TyreSpec, 'sizeLabel'> | null;
  rim?: Omit<RimSpec, 'sizeLabel'> | null;
  location?: string;
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

export type StockAction = 'receive' | 'sell' | 'return' | 'write-off' | 'adjust';

export type GarageRole = 'owner' | 'staff';

export interface Garage {
  id: string;
  name: string;
  role: GarageRole;
  /** Plattformsoperatör: får se och ändra alla garage. */
  superAdmin?: boolean;
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
  customer: { name: string; phone: string | null; email: string | null };
  vehicle: { regNo: string; make: string | null; model: string | null };
  tyres: StoredTyres | null;
  rims: StoredRims | null;
  accessories: StorageAccessory[];
  location: string | null;
  condition: string | null;
  depositedAt: string;
  expectedPickupAt: string | null;
  pickedUpAt: string | null;
  daysStored: number;
  overdue: boolean;
  /** Öre. */
  fee: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  notes: string | null;
}

export interface StorageDepositInput {
  contents: StorageContents;
  quantity?: number;
  customer: { name: string; phone?: string; email?: string };
  vehicle: { regNo: string; make?: string; model?: string };
  tyres?: Omit<StoredTyres, 'sizeLabel'> | null;
  rims?: StoredRims | null;
  accessories?: StorageAccessory[];
  location?: string | null;
  condition?: string | null;
  depositedAt?: string;
  expectedPickupAt?: string | null;
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
