import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseScreenshot } from '@/lib/ai/parsers';
import { getHistoricalPrice } from '@/lib/services/stock-data';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const broker = formData.get('broker') as string || 'robinhood';

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file size (max 10MB) and type
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
    if (image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image too large. Maximum size is 10MB.' }, { status: 400 });
    }
    if (image.type && !image.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type. Please upload an image.' }, { status: 400 });
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    const result = await parseScreenshot(base64, broker);

    // Backfill missing fields: fetch historical closing price
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
              const historicalPrice = await getHistoricalPrice(t.symbol.toUpperCase(), date);
              priceCache.set(cacheKey, historicalPrice);
              price = historicalPrice ?? 0;
            }
          }

          const total = t.total ?? price * t.quantity + fees;
          const idx = i + j;

          return {
            id: `img-${idx}-${Date.now()}`,
            symbol: t.symbol,
            type: t.type || 'buy',
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
    console.error('[import/screenshot] error:', error);
    return NextResponse.json({ error: 'Failed to parse screenshot' }, { status: 500 });
  }
}
