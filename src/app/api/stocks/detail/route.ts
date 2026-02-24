import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQuote, getCompanyProfile } from '@/lib/services/stock-data';
import { isKnownCryptoSymbol, getCryptoDetail } from '@/lib/services/crypto-data';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function finnhubToken(): string {
  return process.env.FINNHUB_API_KEY || '';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const sym = symbol.toUpperCase();

    // Route crypto symbols to CoinGecko
    if (isKnownCryptoSymbol(sym)) {
      const detail = await getCryptoDetail(sym);
      if (!detail) {
        return NextResponse.json({ error: 'Crypto not found' }, { status: 404 });
      }
      return NextResponse.json({
        ...detail,
        peRatio: 0,
        beta: null,
        dividendYield: null,
        exchange: 'Crypto',
        logo: null,
      });
    }

    // Fetch quote, profile, and basic financials in parallel
    const [quote, profile, metricsRes] = await Promise.all([
      getQuote(sym),
      getCompanyProfile(sym),
      fetch(`${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${finnhubToken()}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ]);

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const metric = metricsRes?.metric || {};

    return NextResponse.json({
      ...quote,
      sector: profile?.sector || null,
      industry: profile?.industry || null,
      exchange: metricsRes?.series ? undefined : (metric.exchangeShortName || null),
      week52High: metric['52WeekHigh'] ?? null,
      week52Low: metric['52WeekLow'] ?? null,
      beta: metric['beta'] ?? null,
      dividendYield: metric['dividendYieldIndicatedAnnual'] ?? null,
      logo: null, // Finnhub free tier doesn't reliably provide logos
    });
  } catch (error: any) {
    console.error('[stocks/detail] error:', error);
    return NextResponse.json({ error: 'Failed to fetch stock details' }, { status: 500 });
  }
}
