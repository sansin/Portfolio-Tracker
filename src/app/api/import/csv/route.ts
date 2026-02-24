import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseCSV } from '@/lib/ai/parsers';
import { getHistoricalPrice } from '@/lib/services/stock-data';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const broker = formData.get('broker') as string || 'robinhood';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (max 5MB) and type
    const MAX_CSV_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
    }
    if (file.type && !file.type.includes('csv') && !file.type.includes('text/plain') && !file.type.includes('text/')) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a CSV file.' }, { status: 400 });
    }

    const csvText = await file.text();
    let result;
    try {
      result = await parseCSV(csvText, broker);
    } catch (parseErr: any) {
      return NextResponse.json({ error: parseErr.message || 'Could not parse CSV file' }, { status: 400 });
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
            id: `csv-${idx}-${Date.now()}`,
            symbol: t.symbol,
            type: t.type,
            quantity: t.quantity,
            price,
            date,
            fees,
            total,
            valid: !!(t.symbol && t.quantity > 0),
            needsAttention: !price || !date,
            error: !t.symbol ? 'Missing symbol' : t.quantity <= 0 ? 'Invalid quantity' : !price ? 'Price missing — please fill in' : undefined,
          };
        })
      );
      transactions.push(...batchResults);
    }

    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error('[import/csv] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse CSV' }, { status: 500 });
  }
}
