// ============================================================================
// Portfolio Tracker — TypeScript Types
// Mirrors supabase-schema.sql · Generated 2026-02-21
// ============================================================================

// ─── Enum const objects + union types ───────────────────────────────────────

export const AssetType = {
  STOCK: 'stock',
  ETF: 'etf',
  CRYPTO: 'crypto',
  MUTUAL_FUND: 'mutual_fund',
  OPTION: 'option',
  OTHER: 'other',
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const TransactionType = {
  BUY: 'buy',
  SELL: 'sell',
  DIVIDEND: 'dividend',
  SPLIT: 'split',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  MARGIN_INTEREST: 'margin_interest',
  OPTION_EXERCISE: 'option_exercise',
  OPTION_ASSIGNMENT: 'option_assignment',
  OPTION_EXPIRATION: 'option_expiration',
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const OptionType = {
  CALL: 'call',
  PUT: 'put',
} as const;
export type OptionType = (typeof OptionType)[keyof typeof OptionType];

/** Transaction types that represent cash movements (no underlying asset). */
export const CASH_TRANSACTION_TYPES: TransactionType[] = [
  'deposit',
  'withdrawal',
  'margin_interest',
];

export function isCashTransaction(type: string): boolean {
  return (CASH_TRANSACTION_TYPES as string[]).includes(type);
}

/** Transaction types specific to options lifecycle events. */
export const OPTION_TRANSACTION_TYPES: TransactionType[] = [
  'option_exercise',
  'option_assignment',
  'option_expiration',
];

export function isOptionTransaction(type: string): boolean {
  return (OPTION_TRANSACTION_TYPES as string[]).includes(type);
}

/**
 * Format an option symbol from its components.
 * Output: "AAPL 250C 03/21/26"
 */
export function formatOptionSymbol(
  underlying: string,
  optionType: OptionType,
  strike: number,
  expiration: string, // ISO date string
): string {
  const d = new Date(expiration + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const typeChar = optionType === 'call' ? 'C' : 'P';
  return `${underlying} ${strike}${typeChar} ${mm}/${dd}/${yy}`;
}

/**
 * Generate a unique asset symbol key for an option contract.
 * Used as the `symbol` field in the assets table.
 * Output: "AAPL_C_250_20260321"
 */
export function optionAssetSymbol(
  underlying: string,
  optionType: OptionType,
  strike: number,
  expiration: string, // ISO date
): string {
  const typeChar = optionType === 'call' ? 'C' : 'P';
  const dateStr = expiration.replace(/-/g, '');
  return `${underlying}_${typeChar}_${strike}_${dateStr}`;
}

/** Parse an option asset symbol back into components. Returns null if not an option symbol. */
export function parseOptionAssetSymbol(symbol: string): {
  underlying: string;
  optionType: OptionType;
  strike: number;
  expiration: string;
} | null {
  const m = symbol.match(/^([A-Z]+)_(C|P)_(\d+\.?\d*)_(\d{8})$/);
  if (!m) return null;
  const [, underlying, typeChar, strikeStr, dateStr] = m;
  return {
    underlying,
    optionType: typeChar === 'C' ? 'call' : 'put',
    strike: parseFloat(strikeStr),
    expiration: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
  };
}

export const BrokerSource = {
  MANUAL: 'manual',
  ROBINHOOD: 'robinhood',
  FIDELITY: 'fidelity',
  SCHWAB: 'schwab',
  OTHER: 'other',
} as const;
export type BrokerSource = (typeof BrokerSource)[keyof typeof BrokerSource];

export const ImportStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const InsightType = {
  COMPANY_SUMMARY: 'company_summary',
  EARNINGS_ANALYSIS: 'earnings_analysis',
  PORTFOLIO_HEALTH: 'portfolio_health',
  RECOMMENDATION: 'recommendation',
  NEWS_DIGEST: 'news_digest',
} as const;
export type InsightType = (typeof InsightType)[keyof typeof InsightType];

// ─── Utility helpers ────────────────────────────────────────────────────────

/** Makes every key optional and nullable (Supabase Update pattern). */
type Updatable<T> = { [K in keyof T]?: T[K] | null };

// ─── Database row types (Row / Insert / Update) ────────────────────────────

// 1. profiles ----------------------------------------------------------------

export interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string; // must match auth.users id
  display_name?: string | null;
  avatar_url?: string | null;
}

export type ProfileUpdate = Updatable<
  Omit<ProfileRow, 'id' | 'created_at' | 'updated_at'>
>;

// 2. portfolios ---------------------------------------------------------------

export interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioInsert {
  id?: string;
  user_id: string;
  name: string;
  description?: string | null;
  color?: string;
  is_default?: boolean;
}

export type PortfolioUpdate = Updatable<
  Omit<PortfolioRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

// 3. assets -------------------------------------------------------------------

export interface AssetRow {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: AssetType;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetInsert {
  id?: string;
  symbol: string;
  name?: string | null;
  asset_type?: AssetType;
  sector?: string | null;
  industry?: string | null;
  exchange?: string | null;
  logo_url?: string | null;
}

export type AssetUpdate = Updatable<
  Omit<AssetRow, 'id' | 'created_at' | 'updated_at'>
>;

// 4. transactions -------------------------------------------------------------

export interface TransactionRow {
  id: string;
  portfolio_id: string;
  asset_id: string;
  transaction_type: TransactionType;
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  fees: number;
  currency: string;
  transaction_date: string;
  notes: string | null;
  broker_source: BrokerSource;
  import_batch_id: string | null;
  created_at: string;
}

export interface TransactionInsert {
  id?: string;
  portfolio_id: string;
  asset_id: string;
  transaction_type: TransactionType;
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  fees?: number;
  currency?: string;
  transaction_date: string;
  notes?: string | null;
  broker_source?: BrokerSource;
  import_batch_id?: string | null;
}

export type TransactionUpdate = Updatable<
  Omit<TransactionRow, 'id' | 'created_at'>
>;

// 5. import_batches -----------------------------------------------------------

export interface ImportBatchRow {
  id: string;
  user_id: string;
  broker_source: BrokerSource;
  file_name: string | null;
  status: ImportStatus;
  total_rows: number;
  processed_rows: number;
  error_log: ImportErrorEntry[];
  created_at: string;
}

export interface ImportBatchInsert {
  id?: string;
  user_id: string;
  broker_source: BrokerSource;
  file_name?: string | null;
  status?: ImportStatus;
  total_rows?: number;
  processed_rows?: number;
  error_log?: ImportErrorEntry[];
}

export type ImportBatchUpdate = Updatable<
  Omit<ImportBatchRow, 'id' | 'user_id' | 'created_at'>
>;

export interface ImportErrorEntry {
  row: number;
  message: string;
  raw_data?: Record<string, unknown>;
}

// 6. asset_prices -------------------------------------------------------------

export interface AssetPriceRow {
  id: string;
  asset_id: string;
  price: number;
  price_date: string; // DATE as ISO string
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: string | null;
  created_at: string;
}

export interface AssetPriceInsert {
  id?: string;
  asset_id: string;
  price: number;
  price_date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  source?: string | null;
}

export type AssetPriceUpdate = Updatable<
  Omit<AssetPriceRow, 'id' | 'created_at'>
>;

// 7. earnings_calendar --------------------------------------------------------

export interface EarningsCalendarRow {
  id: string;
  asset_id: string;
  earnings_date: string;
  fiscal_quarter: string | null;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  created_at: string;
  updated_at: string;
}

export interface EarningsCalendarInsert {
  id?: string;
  asset_id: string;
  earnings_date: string;
  fiscal_quarter?: string | null;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  revenue_estimate?: number | null;
  revenue_actual?: number | null;
}

export type EarningsCalendarUpdate = Updatable<
  Omit<EarningsCalendarRow, 'id' | 'created_at' | 'updated_at'>
>;

// 8. ai_insights --------------------------------------------------------------

export interface AIInsightRow {
  id: string;
  asset_id: string | null;
  portfolio_id: string | null;
  insight_type: InsightType;
  content: AIInsightContent;
  ai_provider: string | null;
  model: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AIInsightInsert {
  id?: string;
  asset_id?: string | null;
  portfolio_id?: string | null;
  insight_type: InsightType;
  content: AIInsightContent;
  ai_provider?: string | null;
  model?: string | null;
  expires_at?: string | null;
}

export type AIInsightUpdate = Updatable<
  Omit<AIInsightRow, 'id' | 'created_at'>
>;

// 7b. options_contracts -------------------------------------------------------

export interface OptionsContractRow {
  id: string;
  asset_id: string;
  underlying_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string; // DATE as ISO string
  contract_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface OptionsContractInsert {
  id?: string;
  asset_id: string;
  underlying_symbol: string;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  contract_multiplier?: number;
}

export type OptionsContractUpdate = Updatable<
  Omit<OptionsContractRow, 'id' | 'asset_id' | 'created_at' | 'updated_at'>
>;

// 9. watchlist ----------------------------------------------------------------

export interface WatchlistRow {
  id: string;
  user_id: string;
  asset_id: string;
  added_at: string;
  notes: string | null;
}

export interface WatchlistInsert {
  id?: string;
  user_id: string;
  asset_id: string;
  notes?: string | null;
}

export type WatchlistUpdate = Updatable<Omit<WatchlistRow, 'id' | 'user_id' | 'asset_id' | 'added_at'>>;

// ─── Supabase Database interface (for createClient<Database>) ───────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      portfolios: {
        Row: PortfolioRow;
        Insert: PortfolioInsert;
        Update: PortfolioUpdate;
      };
      assets: {
        Row: AssetRow;
        Insert: AssetInsert;
        Update: AssetUpdate;
      };
      transactions: {
        Row: TransactionRow;
        Insert: TransactionInsert;
        Update: TransactionUpdate;
      };
      import_batches: {
        Row: ImportBatchRow;
        Insert: ImportBatchInsert;
        Update: ImportBatchUpdate;
      };
      asset_prices: {
        Row: AssetPriceRow;
        Insert: AssetPriceInsert;
        Update: AssetPriceUpdate;
      };
      earnings_calendar: {
        Row: EarningsCalendarRow;
        Insert: EarningsCalendarInsert;
        Update: EarningsCalendarUpdate;
      };
      ai_insights: {
        Row: AIInsightRow;
        Insert: AIInsightInsert;
        Update: AIInsightUpdate;
      };
      options_contracts: {
        Row: OptionsContractRow;
        Insert: OptionsContractInsert;
        Update: OptionsContractUpdate;
      };
      watchlist: {
        Row: WatchlistRow;
        Insert: WatchlistInsert;
        Update: WatchlistUpdate;
      };
    };
    Enums: {
      asset_type: AssetType;
      transaction_type: TransactionType;
      option_type: OptionType;
      broker_source: BrokerSource;
      import_status: ImportStatus;
      insight_type: InsightType;
    };
  };
}

// ─── AI Insight content shapes per insight_type ─────────────────────────────

export type AIInsightContent =
  | CompanySummaryContent
  | EarningsAnalysisContent
  | PortfolioHealthContent
  | RecommendationContent
  | NewsDigestContent;

export interface CompanySummaryContent {
  type: 'company_summary';
  summary: string;
  highlights: string[];
  risks: string[];
  competitors: string[];
  market_cap?: number;
  pe_ratio?: number;
}

export interface EarningsAnalysisContent {
  type: 'earnings_analysis';
  fiscal_quarter: string;
  summary: string;
  eps_surprise_pct: number | null;
  revenue_surprise_pct: number | null;
  guidance: string | null;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  key_takeaways: string[];
}

export interface PortfolioHealthContent {
  type: 'portfolio_health';
  overall_score: number; // 0-100
  diversification_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'very_high';
  concentration_warnings: string[];
  suggestions: string[];
  sector_balance: Record<string, number>;
}

export interface RecommendationContent {
  type: 'recommendation';
  action: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  target_price: number | null;
  reasoning: string;
  confidence: number; // 0-1
  time_horizon: string;
}

export interface NewsDigestContent {
  type: 'news_digest';
  articles: NewsArticleSummary[];
  overall_sentiment: 'bullish' | 'bearish' | 'neutral';
  generated_summary: string;
}

export interface NewsArticleSummary {
  title: string;
  source: string;
  url: string;
  published_at: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance_score: number;
}

// ─── Computed / Derived types (frontend use) ────────────────────────────────

/** A single holding in a portfolio, computed from transactions + price data. */
export interface HoldingWithMetrics {
  asset_id: string;
  symbol: string;
  name: string | null;
  asset_type: AssetType;
  logo_url: string | null;
  quantity: number;
  avg_cost_basis: number;
  current_price: number;
  total_value: number;
  total_cost: number;
  unrealized_pl: number;
  unrealized_pl_percent: number;
  realized_pl: number;
  weight: number; // % of portfolio total value
  day_change: number;
  day_change_percent: number;
  sector: string | null;
}

/** Portfolio summary with aggregated metrics. */
export interface PortfolioWithMetrics {
  portfolio: PortfolioRow;
  total_value: number;
  total_cost: number;
  total_unrealized_pl: number;
  total_unrealized_pl_percent: number;
  total_realized_pl: number;
  day_change: number;
  day_change_percent: number;
  holdings: HoldingWithMetrics[];
  holding_count: number;
  last_updated: string;
}

/** Transaction row joined with asset info for display. */
export interface TransactionWithAsset extends TransactionRow {
  asset: Pick<AssetRow, 'symbol' | 'name' | 'asset_type' | 'logo_url'>;
}

/** A parsed CSV row shown in the import preview before the user commits. */
export interface ImportPreviewRow {
  row_number: number;
  raw_data: Record<string, string>;
  parsed: {
    symbol: string;
    transaction_type: TransactionType;
    quantity: number;
    price_per_unit: number;
    total_amount: number;
    fees: number;
    transaction_date: string;
  } | null;
  errors: string[];
  warnings: string[];
  status: 'valid' | 'warning' | 'error';
}

export interface ImportPreview {
  broker_source: BrokerSource;
  file_name: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  rows: ImportPreviewRow[];
  new_symbols: string[]; // symbols not yet in the assets table
}

// ─── Chart / Analytics types ────────────────────────────────────────────────

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface OHLCDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const TimeRange = {
  ONE_DAY: '1D',
  ONE_WEEK: '1W',
  ONE_MONTH: '1M',
  THREE_MONTHS: '3M',
  SIX_MONTHS: '6M',
  YTD: 'YTD',
  ONE_YEAR: '1Y',
  FIVE_YEARS: '5Y',
  ALL: 'ALL',
} as const;
export type TimeRange = (typeof TimeRange)[keyof typeof TimeRange];

export interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  holdings_count: number;
  color: string;
}

export interface AssetAllocation {
  asset_id: string;
  symbol: string;
  name: string | null;
  asset_type: AssetType;
  value: number;
  percentage: number;
}

export interface PerformanceSummary {
  time_range: TimeRange;
  start_value: number;
  end_value: number;
  absolute_change: number;
  percent_change: number;
  data_points: ChartDataPoint[];
}

// ─── API / network types ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationParams {
  page: number;
  page_size: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface SortParams<T = string> {
  sort_by: T;
  sort_direction: 'asc' | 'desc';
}

export interface TransactionFilters {
  portfolio_id?: string;
  asset_id?: string;
  transaction_type?: TransactionType | TransactionType[];
  broker_source?: BrokerSource | BrokerSource[];
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string; // symbol / notes
}

export type TransactionSortField =
  | 'transaction_date'
  | 'total_amount'
  | 'quantity'
  | 'symbol'
  | 'transaction_type';

// ─── Watchlist types ────────────────────────────────────────────────────────

export interface WatchlistItemWithAsset extends WatchlistRow {
  asset: AssetRow;
  current_price: number | null;
  day_change: number | null;
  day_change_percent: number | null;
}

// ─── Earnings types ─────────────────────────────────────────────────────────

export interface EarningsCalendarWithAsset extends EarningsCalendarRow {
  asset: Pick<AssetRow, 'symbol' | 'name' | 'logo_url'>;
}

export interface UpcomingEarnings {
  today: EarningsCalendarWithAsset[];
  this_week: EarningsCalendarWithAsset[];
  next_week: EarningsCalendarWithAsset[];
}
