import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePastedText } from '@/lib/ai/parsers';
import { getHistoricalPrice } from '@/lib/services/stock-data';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { text, broker } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    let result;
    try {
      result = await parsePastedText(text, broker || 'robinhood');
    } catch (parseErr: any) {
      return NextResponse.json({ error: parseErr.message || 'Could not parse input text' }, { status: 400 });
    }

    // Backfill missing prices and dates
    const defaultDate = new Date().toISOString().split('T')[0];
    const priceCache = new Map<string, number | null>();
    const BATCH_SIZE = 10;
    const transactions: any[] = [];

    for (let i = 0; i < result.transactions.length; i += BATCH_SIZE) {
      const batch = result.transactions.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (t, j) => {
          let price = t.price || 0;
          const date = t.date || defaultDate;
          const fees = t.fees || 0;

          if (!price && t.symbol) {
            const cacheKey = `${t.symbol.toUpperCase()}:${date}`;
            if (priceCache.has(cacheKey)) {
              price = priceCache.get(cacheKey) ?? 0;
            } else {
              try {
                const historicalPrice = await getHistoricalPrice(t.symbol.toUpperCase(), date);
                priceCache.set(cacheKey, historicalPrice);
                price = historicalPrice ?? 0;
              } catch {
                priceCache.set(cacheKey, null);
                price = 0;
              }
            }
          }

          const total = t.total || price * t.quantity + fees;
          const idx = i + j;

          return {
            id: `paste-${idx}-${Date.now()}`,
            symbol: t.symbol,
            type: t.type,
            quantity: t.quantity,
            price,
            date,
            fees,
            total,
            valid: !!(t.symbol && t.quantity > 0 && price > 0),
            error: !t.symbol ? 'Missing symbol' : t.quantity <= 0 ? 'Invalid quantity' : price <= 0 ? 'Could not fetch price' : undefined,
          };
        })
      );
      transactions.push(...batchResults);
    }

    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error('[import/paste] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse text' }, { status: 500 });
  }
}
