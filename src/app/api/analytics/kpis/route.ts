import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBulkQuotes } from '@/lib/services/stock-data';
import { isCashTransaction } from '@/types';
import {
  calculatePerformance,
  calculateSectorAllocation,
  calculateAllocation,
  calculateRiskMetrics,
  findOverlappingHoldings,
  type HoldingData,
} from '@/lib/analytics/calculations';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all user portfolios with their transactions
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('user_id', user.id);

    if (!portfolios?.length) {
      return NextResponse.json({
        performance: null,
        allocation: [],
        sectorAllocation: [],
        riskMetrics: null,
        overlaps: [],
      });
    }

    const portfolioIds = portfolios.map((p) => p.id);

    // Fetch all transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*, asset:assets!asset_id(symbol, name, sector)')
      .in('portfolio_id', portfolioIds)
      .order('transaction_date', { ascending: true });

    if (!transactions?.length) {
      return NextResponse.json({
        performance: null,
        allocation: [],
        sectorAllocation: [],
        riskMetrics: null,
        overlaps: [],
      });
    }

    // Aggregate holdings per portfolio
    const holdingsMap = new Map<string, Map<string, HoldingData>>();
    const cashMap = new Map<string, number>(); // portfolioId -> cash balance
    const allSymbols = new Set<string>();

    for (const txn of transactions) {
      const asset = (txn as any).asset;
      if (!asset) continue;

      const pId = txn.portfolio_id;

      // Track cash transactions separately
      if (isCashTransaction(txn.transaction_type)) {
        let cash = cashMap.get(pId) || 0;
        const qty = Number(txn.quantity || 0);
        const price = Number(txn.price_per_unit || 0);
        const amount = qty * price;
        if (txn.transaction_type === 'deposit') {
          cash += amount;
        } else if (txn.transaction_type === 'withdrawal') {
          cash -= amount;
        } else if (txn.transaction_type === 'margin_interest') {
          cash -= Math.abs(amount);
        }
        cashMap.set(pId, cash);
        continue;
      }

      const symbol = asset.symbol;
      allSymbols.add(symbol);

      if (!holdingsMap.has(pId)) holdingsMap.set(pId, new Map());
      const pHoldings = holdingsMap.get(pId)!;

      if (!pHoldings.has(symbol)) {
        pHoldings.set(symbol, {
          symbol,
          name: asset.name || symbol,
          quantity: 0,
          avgCost: 0,
          currentPrice: 0,
          sector: asset.sector || undefined,
        });
      }

      const h = pHoldings.get(symbol)!;
      const qty = txn.quantity || 0;
      const price = txn.price_per_unit || 0;
      const fees = (txn as any).fees || 0;

      if (txn.transaction_type === 'buy' || txn.transaction_type === 'transfer_in') {
        const totalCostBefore = h.avgCost * h.quantity;
        h.quantity += qty;
        h.avgCost = h.quantity > 0 ? (totalCostBefore + qty * price + fees) / h.quantity : 0;
      } else if (txn.transaction_type === 'sell' || txn.transaction_type === 'transfer_out') {
        h.quantity = Math.max(0, h.quantity - qty);
      }
    }

    // Add synthetic cash holdings per portfolio
    for (const [pId, cash] of cashMap.entries()) {
      if (cash === 0) continue;
      if (!holdingsMap.has(pId)) holdingsMap.set(pId, new Map());
      holdingsMap.get(pId)!.set('CASH', {
        symbol: 'CASH',
        name: 'Cash',
        quantity: cash,
        avgCost: 1,
        currentPrice: 1,
        sector: undefined,
      });
    }

    // Fetch live quotes
    const quotes = await getBulkQuotes(Array.from(allSymbols));

    // Set current prices
    const allHoldings: HoldingData[] = [];
    const portfolioHoldings: { id: string; name: string; holdings: HoldingData[] }[] = [];

    for (const [pId, pHoldings] of holdingsMap) {
      const portfolio = portfolios.find((p) => p.id === pId);
      const pHoldingList: HoldingData[] = [];

      for (const [symbol, h] of pHoldings) {
        if (h.quantity <= 0) continue;
        const quote = quotes.get(symbol);
        h.currentPrice = quote?.price || h.avgCost;
        allHoldings.push(h);
        pHoldingList.push(h);
      }

      portfolioHoldings.push({
        id: pId,
        name: portfolio?.name || 'Unknown',
        holdings: pHoldingList,
      });
    }

    // Calculate all analytics
    const performance = calculatePerformance(allHoldings, quotes);
    const allocation = calculateAllocation(allHoldings);
    const sectorAllocation = calculateSectorAllocation(allHoldings);
    const riskMetrics = calculateRiskMetrics(allHoldings, portfolios.length);
    const overlaps = findOverlappingHoldings(portfolioHoldings);

    // Build symbol-quantity pairs for chart (exclude CASH — no market data)
    const holdingsList = allHoldings
      .filter((h) => h.symbol !== 'CASH' && h.symbol !== '$CASH')
      .map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
      }));

    // ── holdingsTable: per-holding detail rows (aggregated by symbol) ──
    const totalPortfolioValue = allHoldings.reduce(
      (sum, h) => sum + h.quantity * h.currentPrice,
      0
    );

    // Aggregate allHoldings by symbol for the table (avoid duplicate rows)
    const aggregatedMap = new Map<string, { symbol: string; name: string; sector?: string; quantity: number; totalCost: number; currentPrice: number }>();
    for (const h of allHoldings) {
      const existing = aggregatedMap.get(h.symbol);
      if (existing) {
        existing.totalCost += h.quantity * h.avgCost;
        existing.quantity += h.quantity;
      } else {
        aggregatedMap.set(h.symbol, {
          symbol: h.symbol,
          name: h.name,
          sector: h.sector,
          quantity: h.quantity,
          totalCost: h.quantity * h.avgCost,
          currentPrice: h.currentPrice,
        });
      }
    }

    const holdingsTable = Array.from(aggregatedMap.values()).map((h) => {
      const quote = quotes.get(h.symbol);
      const avgCost = h.quantity > 0 ? h.totalCost / h.quantity : 0;
      const marketValue = h.quantity * h.currentPrice;
      const costBasis = h.totalCost;
      const unrealizedPL = marketValue - costBasis;
      const unrealizedPLPercent =
        costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
      const weight =
        totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0;
      const dayChange = quote
        ? h.quantity * (quote.price - quote.previousClose)
        : 0;
      const dayChangePercent = quote?.changePercent ?? 0;

      return {
        symbol: h.symbol,
        name: h.name,
        sector: h.sector ?? null,
        quantity: h.quantity,
        avgCost,
        currentPrice: h.currentPrice,
        marketValue,
        costBasis,
        unrealizedPL,
        unrealizedPLPercent,
        weight,
        dayChange,
        dayChangePercent,
      };
    });

    // ── portfolioBreakdown: per-portfolio summary ──
    const portfolioBreakdown = portfolioHoldings.map((p) => {
      const totalValue = p.holdings.reduce(
        (sum, h) => sum + h.quantity * h.currentPrice,
        0
      );
      const totalCost = p.holdings.reduce(
        (sum, h) => sum + h.quantity * h.avgCost,
        0
      );
      const gainLoss = totalValue - totalCost;
      const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

      return {
        id: p.id,
        name: p.name,
        totalValue,
        totalCost,
        gainLoss,
        gainLossPercent,
        holdingsCount: p.holdings.length,
      };
    });

    // ── monthlyReturns: approximate using transactions + current prices ──
    const monthlyMap = new Map<string, { costBasis: number }>();

    for (const txn of transactions) {
      const asset = (txn as any).asset;
      if (!asset) continue;

      // Skip cash transactions for monthly returns calculation
      if (isCashTransaction(txn.transaction_type)) continue;

      const date = new Date(txn.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthlyMap.get(monthKey) || { costBasis: 0 };

      const qty = txn.quantity || 0;
      const price = txn.price_per_unit || 0;

      if (txn.transaction_type === 'buy' || txn.transaction_type === 'transfer_in') {
        entry.costBasis += qty * price;
      } else if (txn.transaction_type === 'sell' || txn.transaction_type === 'transfer_out') {
        entry.costBasis -= qty * price;
      }

      monthlyMap.set(monthKey, entry);
    }

    // Accumulate running cost basis and compute approximate return per month
    const sortedMonths = Array.from(monthlyMap.keys()).sort();
    let runningCostBasis = 0;
    const monthlyReturns: { month: string; return: number }[] = [];

    for (const month of sortedMonths) {
      const entry = monthlyMap.get(month)!;
      runningCostBasis += entry.costBasis;

      // Approximate return: compare current total value against cumulative cost basis up to that month
      // This is an approximation since we don't have historical price data
      const approxReturn =
        runningCostBasis > 0
          ? ((totalPortfolioValue - runningCostBasis) / runningCostBasis) * 100
          : 0;

      monthlyReturns.push({ month, return: Math.round(approxReturn * 100) / 100 });
    }

    // ── topMovers: top 5 by absolute day change percent ──
    const topMovers = allHoldings
      .map((h) => {
        const quote = quotes.get(h.symbol);
        return {
          symbol: h.symbol,
          name: h.name,
          dayChange: quote ? h.quantity * (quote.price - quote.previousClose) : 0,
          dayChangePercent: quote?.changePercent ?? 0,
        };
      })
      .sort((a, b) => Math.abs(b.dayChangePercent) - Math.abs(a.dayChangePercent))
      .slice(0, 5);

    return NextResponse.json({
      performance,
      allocation,
      sectorAllocation,
      riskMetrics,
      overlaps,
      holdingsCount: allHoldings.length,
      portfolioCount: portfolios.length,
      holdings: holdingsList,
      holdingsTable,
      portfolioBreakdown,
      monthlyReturns,
      topMovers,
    });
  } catch (error: any) {
    console.error('[analytics/kpis] error:', error);
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
