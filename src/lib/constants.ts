export const APP_NAME = 'Folio';
export const APP_DESCRIPTION = 'Smart portfolio tracking with AI-powered insights';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  PORTFOLIOS: '/portfolios',
  PORTFOLIO: (id: string) => `/portfolios/${id}` as const,
  TRANSACTIONS: '/transactions',
  IMPORT: '/import',
  ANALYTICS: '/analytics',
  WATCHLIST: '/watchlist',
  INSIGHTS: '/insights',
  SETTINGS: '/settings',
} as const;

export const PORTFOLIO_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
] as const;

export const TIME_RANGES = {
  '1D': { label: '1D', days: 1 },
  '1W': { label: '1W', days: 7 },
  '1M': { label: '1M', days: 30 },
  '3M': { label: '3M', days: 90 },
  '6M': { label: '6M', days: 180 },
  'YTD': { label: 'YTD', days: 0 }, // calculated dynamically
  '1Y': { label: '1Y', days: 365 },
  '5Y': { label: '5Y', days: 1825 },
  'ALL': { label: 'ALL', days: 0 }, // all available data
} as const;

export const ITEMS_PER_PAGE = 25;

export const AI_INSIGHT_TTL_HOURS = {
  company_summary: 24,
  earnings_analysis: 12,
  portfolio_health: 6,
  recommendation: 12,
  news_digest: 4,
} as const;

export const SUPPORTED_BROKERS = [
  { id: 'robinhood', name: 'Robinhood', color: '#00C805' },
  { id: 'fidelity', name: 'Fidelity', color: '#4B8B3B' },
  { id: 'schwab', name: 'Charles Schwab', color: '#00A2E8' },
] as const;
