import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBulkQuotes, getQuote } from '@/lib/services/stock-data';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbols = request.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  try {
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    if (symbolList.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 symbols per request' }, { status: 400 });
    }
    
    if (symbolList.length === 1) {
      const quote = await getQuote(symbolList[0]);
      return NextResponse.json({ quotes: quote ? { [symbolList[0]]: quote } : {} });
    }

    const quotes = await getBulkQuotes(symbolList);
    const quotesObj: Record<string, any> = {};
    quotes.forEach((v, k) => { quotesObj[k] = v; });

    return NextResponse.json({ quotes: quotesObj });
  } catch (error: any) {
    console.error('[stocks/quote] error:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
