export type Role = 'user' | 'admin';
export type Season = 'summer' | 'winter' | 'all_season';
export type StockLevel = 'in_stock' | 'low' | 'out';
export type MovementType = 'purchase' | 'sale' | 'customer_return' | 'write_off' | 'adjustment';

export const SEASON_LABELS: Record<Season, string> = {
  summer: 'Sommar',
  winter: 'Vinter',
  all_season: 'Helår',
};

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

export interface Article {
  id: string;
  label: string;
  brand: string;
  model: string;
  sku: string | null;
  tyre: TyreSpec;
  location: string | null;
  quantity: number;
  stockLevel: StockLevel;
  reorderLevel: number;
  averageCost: number;
  sellPrice: number;
  margin: number;
  marginPercent: number;
  stockValue: number;
  supplier: string | null;
  notes: string | null;
  active: boolean;
  lastPurchasedAt: string | null;
}

export interface ArticleInput {
  brand: string;
  model: string;
  sku?: string;
  tyre: Omit<TyreSpec, 'sizeLabel'>;
  location?: string;
  reorderLevel?: number;
  sellPrice: number;
  supplier?: string;
  notes?: string;
  initialQuantity?: number;
  initialUnitCost?: number;
}

export type ArticleUpdate = Partial<Omit<ArticleInput, 'initialQuantity' | 'initialUnitCost'>>;

export interface ArticleQuery {
  q?: string;
  category?: string;
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
}

export interface GarageMember {
  userId: string;
  garageId: string;
  role: GarageRole;
  createdAt: string;
}

export interface GarageInvite {
  code: string;
  expiresAt: string;
}
