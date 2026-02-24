/**
 * Shared holdings computation utilities
 * Used by dashboard, portfolios, portfolio detail, and analytics
 */

import { isCashTransaction, isOptionTransaction } from '@/types';

export interface ComputedHolding {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  portfolioId: string;
}

/**
 * Build holdings from a list of transactions.
 * Groups by portfolio_id + asset_id, applies buy/sell/transfer logic.
 * Returns only holdings with quantity > 0.
 */
export function buildHoldingsFromTransactions(
  transactions: any[],
  options?: { filterPortfolioId?: string }
): ComputedHolding[] {
  const holdingsMap = new Map<string, ComputedHolding>();

  for (const t of transactions) {
    if (options?.filterPortfolioId && t.portfolio_id !== options.filterPortfolioId) continue;

    // Skip cash transactions (deposit/withdrawal/margin_interest) — they don't produce holdings
    if (isCashTransaction(t.transaction_type)) continue;
    
    const key = `${t.portfolio_id}-${t.asset_id}`;
    const existing = holdingsMap.get(key) || {
      assetId: t.asset_id,
      symbol: t.asset?.symbol || '',
      name: t.asset?.name || '',
      quantity: 0,
      avgCost: 0,
      totalCost: 0,
      portfolioId: t.portfolio_id,
    };

    const qty = Number(t.quantity);
    const price = Number(t.price_per_unit);
    const fees = Number(t.fees || 0);

    if (t.transaction_type === 'buy' || t.transaction_type === 'transfer_in') {
      const txCost = price * qty + fees;
      const newTotalCost = existing.totalCost + txCost;
      const newQuantity = existing.quantity + qty;
      existing.quantity = newQuantity;
      existing.totalCost = newTotalCost;
      existing.avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
    } else if (t.transaction_type === 'sell' || t.transaction_type === 'transfer_out') {
      existing.quantity -= qty;
      existing.totalCost = Math.max(0, existing.totalCost - existing.avgCost * qty);
    } else if (t.transaction_type === 'option_exercise' || t.transaction_type === 'option_assignment') {
      // Exercise/assignment closes the option position
      existing.quantity -= qty;
      existing.totalCost = Math.max(0, existing.totalCost - existing.avgCost * qty);
    } else if (t.transaction_type === 'option_expiration') {
      // Expiration — entire position becomes worthless
      existing.quantity = 0;
      existing.totalCost = 0;
    }

    holdingsMap.set(key, existing);
  }

  return Array.from(holdingsMap.values()).filter((h) => h.quantity > 0);
}

/**
 * Compute portfolio value using live quotes.
 * Falls back to cost basis when no quote available.
 */
export function computePortfolioValues(
  holdings: ComputedHolding[],
  quotes: Record<string, any>
): {
  totalValue: number;
  totalCost: number;
  dayChange: number;
  dayChangePercent: number;
  totalGain: number;
  totalGainPercent: number;
} {
  let totalValue = 0;
  let dayChange = 0;
  const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);

  for (const h of holdings) {
    const q = quotes[h.symbol];
    if (q) {
      totalValue += q.price * h.quantity;
      dayChange += (q.price - q.previousClose) * h.quantity;
    } else {
      totalValue += h.totalCost;
    }
  }

  const dayChangePercent = totalValue - dayChange > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;
  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return { totalValue, totalCost, dayChange, dayChangePercent, totalGain, totalGainPercent };
}

/**
 * Get unique symbols from holdings
 */
export function getUniqueSymbols(holdings: ComputedHolding[]): string[] {
  return [...new Set(holdings.map((h) => h.symbol).filter(Boolean))];
}
