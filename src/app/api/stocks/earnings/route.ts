import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEarningsCalendar } from '@/lib/services/stock-data';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all user's holding symbols
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', user.id);

    if (!portfolios?.length) {
      return NextResponse.json({ earnings: [] });
    }

    const portfolioIds = portfolios.map((p) => p.id);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('portfolio_id, quantity, transaction_type, asset:assets!asset_id(symbol)')
      .in('portfolio_id', portfolioIds);

    if (!transactions?.length) {
      return NextResponse.json({ earnings: [] });
    }

    // Aggregate holdings to find symbols with positive quantity
    const holdingsMap = new Map<string, number>();
    for (const txn of transactions) {
      const symbol = (txn as any).asset?.symbol;
      if (!symbol) continue;
      const qty = txn.quantity || 0;
      const current = holdingsMap.get(symbol) || 0;
      if (txn.transaction_type === 'buy' || txn.transaction_type === 'transfer_in') {
        holdingsMap.set(symbol, current + qty);
      } else if (txn.transaction_type === 'sell' || txn.transaction_type === 'transfer_out') {
        holdingsMap.set(symbol, current - qty);
      }
    }

    const ownedSymbols = Array.from(holdingsMap.entries())
      .filter(([, qty]) => qty > 0)
      .map(([symbol]) => symbol);

    if (ownedSymbols.length === 0) {
      return NextResponse.json({ earnings: [] });
    }

    // Fetch earnings for the next 14 days, filtered to owned symbols
    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const earnings = await getEarningsCalendar(from, to, ownedSymbols);

    return NextResponse.json({ earnings });
  } catch (error: any) {
    console.error('[stocks/earnings] error:', error);
    return NextResponse.json({ error: 'Failed to fetch earnings calendar' }, { status: 500 });
  }
}
