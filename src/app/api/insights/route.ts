import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQuote, getBulkQuotes } from '@/lib/services/stock-data';
import { analyzeStock, analyzePortfolioHealth, generateMarketSummary } from '@/lib/services/ai-insights';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'portfolio_health';
  const symbol = request.nextUrl.searchParams.get('symbol');

  try {
    // Check for cached insight (valid for 24 hours)
    const force = request.nextUrl.searchParams.get('force') === 'true';
    let cached = null;
    if (!force) {
      let cacheQuery = supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('insight_type', type)
        .gt('valid_until', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      // Filter by symbol when present to avoid returning wrong stock analysis
      if (symbol) {
        cacheQuery = cacheQuery.eq('metadata->>symbol', symbol);
      }

      const { data } = await cacheQuery.maybeSingle();
      cached = data;
    }

    if (cached) {
      return NextResponse.json({
        insight: {
          title: cached.title,
          content: cached.content,
          confidence: cached.confidence_score,
          type: cached.insight_type,
          createdAt: cached.created_at,
          cached: true,
        },
      });
    }

    let insight;

    if (type === 'stock_analysis' && symbol) {
      const quote = await getQuote(symbol);
      insight = await analyzeStock(symbol, quote);
    } else if (type === 'portfolio_health') {
      // Fetch user's holdings
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id);

      if (!portfolios?.length) {
        return NextResponse.json({ error: 'No portfolios found' }, { status: 404 });
      }

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*, asset:assets!asset_id(symbol, name, sector)')
        .in('portfolio_id', portfolios.map((p) => p.id))
        .order('transaction_date', { ascending: true });

      // Aggregate holdings
      const holdingsMap = new Map<string, { symbol: string; quantity: number; avgCost: number; sector?: string }>();
      for (const txn of transactions || []) {
        const asset = (txn as any).asset;
        if (!asset) continue;
        const h = holdingsMap.get(asset.symbol) || { symbol: asset.symbol, quantity: 0, avgCost: 0, sector: asset.sector };
        const qty = txn.quantity || 0;
        const price = txn.price_per_unit || 0;
        if (txn.transaction_type === 'buy' || txn.transaction_type === 'transfer_in') {
          const fees = (txn as any).fees || 0;
          const totalBefore = h.avgCost * h.quantity;
          h.quantity += qty;
          h.avgCost = h.quantity > 0 ? (totalBefore + qty * price + fees) / h.quantity : 0;
        } else if (txn.transaction_type === 'sell' || txn.transaction_type === 'transfer_out') {
          h.quantity = Math.max(0, h.quantity - qty);
        }
        holdingsMap.set(asset.symbol, h);
      }

      const holdings = Array.from(holdingsMap.values()).filter((h) => h.quantity > 0);
      const quotes = await getBulkQuotes(holdings.map((h) => h.symbol));

      const enriched = holdings.map((h) => ({
        ...h,
        currentPrice: quotes.get(h.symbol)?.price || h.avgCost,
      }));

      const totalValue = enriched.reduce((s, h) => s + h.quantity * h.currentPrice, 0);
      const totalCost = enriched.reduce((s, h) => s + h.quantity * h.avgCost, 0);
      const gainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

      insight = await analyzePortfolioHealth(enriched, totalValue, gainPct);
    } else if (type === 'market_summary') {
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id);

      const portfolioIds = portfolios?.map((p) => p.id) || [];

      const { data: holdings } = await supabase
        .from('transactions')
        .select('asset:assets!asset_id(symbol)')
        .in('portfolio_id', portfolioIds);

      const { data: watchlist } = await supabase
        .from('watchlist')
        .select('asset:assets!asset_id(symbol)')
        .eq('user_id', user.id);

      const holdingSymbols = [...new Set((holdings || []).map((h: any) => h.asset?.symbol).filter(Boolean))];
      const watchlistSymbols = (watchlist || []).map((w: any) => w.asset?.symbol).filter(Boolean);

      insight = await generateMarketSummary(watchlistSymbols, holdingSymbols as string[]);
    } else {
      return NextResponse.json({ error: 'Invalid insight type' }, { status: 400 });
    }

    // Cache the insight
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + 24);

    await supabase.from('ai_insights').insert({
      user_id: user.id,
      asset_id: null,
      insight_type: type,
      title: insight.title,
      content: insight.content,
      confidence_score: insight.confidence,
      valid_until: validUntil.toISOString(),
      metadata: { symbol },
    });

    return NextResponse.json({
      insight: {
        ...insight,
        createdAt: new Date().toISOString(),
        cached: false,
      },
    });
  } catch (error: any) {
    console.error('[insights] error:', error);
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 });
  }
}
