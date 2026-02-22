import type { StockQuote } from '@/lib/services/stock-data';

export interface HoldingData {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  sector?: string;
}

export interface PortfolioAllocation {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface PerformanceMetrics {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
  bestPerformer: { symbol: string; gainPercent: number } | null;
  worstPerformer: { symbol: string; gainPercent: number } | null;
}

export interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  holdings: number;
  color: string;
}

export interface RiskMetrics {
  diversificationScore: number; // 0-100
  topHoldingConcentration: number; // percentage
  sectorConcentration: number; // Herfindahl index
  portfolioCount: number;
}

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
];

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#6366f1',
  Healthcare: '#22c55e',
  'Financial Services': '#f97316',
  'Consumer Cyclical': '#ec4899',
  'Consumer Defensive': '#14b8a6',
  Energy: '#ef4444',
  Industrials: '#3b82f6',
  'Real Estate': '#a855f7',
  Utilities: '#eab308',
  'Communication Services': '#d946ef',
  'Basic Materials': '#06b6d4',
  Other: '#71717a',
};

/**
 * Calculate portfolio allocation by holding
 */
export function calculateAllocation(holdings: HoldingData[]): PortfolioAllocation[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
  if (totalValue === 0) return [];

  return holdings
    .map((h, i) => ({
      symbol: h.symbol,
      name: h.name,
      value: h.quantity * h.currentPrice,
      percentage: ((h.quantity * h.currentPrice) / totalValue) * 100,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate sector allocation
 */
export function calculateSectorAllocation(holdings: HoldingData[]): SectorAllocation[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
  if (totalValue === 0) return [];

  const sectors = new Map<string, { value: number; holdings: number }>();

  for (const h of holdings) {
    const sector = h.sector || 'Other';
    const current = sectors.get(sector) || { value: 0, holdings: 0 };
    current.value += h.quantity * h.currentPrice;
    current.holdings += 1;
    sectors.set(sector, current);
  }

  return Array.from(sectors.entries())
    .map(([sector, data]) => ({
      sector,
      value: data.value,
      percentage: (data.value / totalValue) * 100,
      holdings: data.holdings,
      color: SECTOR_COLORS[sector] || SECTOR_COLORS.Other,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate performance metrics from holdings + quotes
 */
export function calculatePerformance(
  holdings: HoldingData[],
  quotes: Map<string, StockQuote>
): PerformanceMetrics {
  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;
  let bestPerformer: { symbol: string; gainPercent: number } | null = null;
  let worstPerformer: { symbol: string; gainPercent: number } | null = null;

  for (const h of holdings) {
    const quote = quotes.get(h.symbol);
    const price = quote?.price || h.currentPrice;
    const prevClose = quote?.previousClose || price;
    const holdingValue = h.quantity * price;
    const holdingCost = h.quantity * h.avgCost;

    totalValue += holdingValue;
    totalCost += holdingCost;
    dayChange += h.quantity * (price - prevClose);

    const gainPct = h.avgCost > 0 ? ((price - h.avgCost) / h.avgCost) * 100 : 0;

    if (!bestPerformer || gainPct > bestPerformer.gainPercent) {
      bestPerformer = { symbol: h.symbol, gainPercent: gainPct };
    }
    if (!worstPerformer || gainPct < worstPerformer.gainPercent) {
      worstPerformer = { symbol: h.symbol, gainPercent: gainPct };
    }
  }

  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const dayChangePercent = totalValue - dayChange > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    bestPerformer,
    worstPerformer,
  };
}

/**
 * Calculate risk/diversification metrics
 */
export function calculateRiskMetrics(
  holdings: HoldingData[],
  portfolioCount: number
): RiskMetrics {
  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
  if (totalValue === 0 || holdings.length === 0) {
    return { diversificationScore: 0, topHoldingConcentration: 0, sectorConcentration: 0, portfolioCount };
  }

  // Top holding concentration
  const holdingPcts = holdings.map((h) => ((h.quantity * h.currentPrice) / totalValue) * 100);
  holdingPcts.sort((a, b) => b - a);
  const topHoldingConcentration = holdingPcts[0] || 0;

  // Sector HHI (Herfindahl-Hirschman Index)
  const sectorPcts = new Map<string, number>();
  for (const h of holdings) {
    const sector = h.sector || 'Other';
    const pct = ((h.quantity * h.currentPrice) / totalValue) * 100;
    sectorPcts.set(sector, (sectorPcts.get(sector) || 0) + pct);
  }
  const sectorConcentration = Array.from(sectorPcts.values()).reduce(
    (sum, pct) => sum + (pct / 100) ** 2,
    0
  );

  // Diversification score (0-100, higher = more diversified)
  const holdingCountScore = Math.min(holdings.length / 20, 1) * 30;
  const concentrationScore = (1 - topHoldingConcentration / 100) * 30;
  const sectorScore = (1 - sectorConcentration) * 40;
  const diversificationScore = Math.round(holdingCountScore + concentrationScore + sectorScore);

  return {
    diversificationScore: Math.max(0, Math.min(100, diversificationScore)),
    topHoldingConcentration,
    sectorConcentration: sectorConcentration * 10000, // normalized HHI
    portfolioCount,
  };
}

/**
 * Find overlapping holdings across portfolios
 */
export function findOverlappingHoldings(
  portfolios: { id: string; name: string; holdings: HoldingData[] }[]
): { symbol: string; portfolios: string[]; totalQuantity: number; totalValue: number }[] {
  const symbolMap = new Map<string, { portfolios: string[]; totalQty: number; totalVal: number }>();

  for (const p of portfolios) {
    for (const h of p.holdings) {
      const existing = symbolMap.get(h.symbol) || { portfolios: [], totalQty: 0, totalVal: 0 };
      existing.portfolios.push(p.name);
      existing.totalQty += h.quantity;
      existing.totalVal += h.quantity * h.currentPrice;
      symbolMap.set(h.symbol, existing);
    }
  }

  return Array.from(symbolMap.entries())
    .filter(([, data]) => data.portfolios.length > 1)
    .map(([symbol, data]) => ({
      symbol,
      portfolios: data.portfolios,
      totalQuantity: data.totalQty,
      totalValue: data.totalVal,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}
