import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCompanyProfile } from '@/lib/services/stock-data';

interface TransactionRow {
  id: string;
  symbol: string;
  type: 'buy' | 'sell' | 'dividend' | 'transfer_in' | 'transfer_out';
  quantity: number;
  price: number;
  date: string;
  fees: number;
  total: number;
  valid: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { transactions, portfolioId, broker, source } = (await request.json()) as {
      transactions: TransactionRow[];
      portfolioId: string;
      broker: string;
      source: string;
    };

    if (!transactions?.length || !portfolioId) {
      return NextResponse.json(
        { error: 'Missing transactions or portfolio ID' },
        { status: 400 }
      );
    }

    // Verify user owns this portfolio
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    // Filter to valid transactions only and re-validate server-side
    const validTxns = transactions.filter((t) => {
      if (!t.symbol || typeof t.symbol !== 'string') return false;
      if (!t.quantity || t.quantity <= 0) return false;
      if (!t.price || t.price <= 0) return false;
      if (t.date && new Date(t.date) > new Date()) return false;
      return t.valid;
    });

    if (validTxns.length === 0) {
      return NextResponse.json(
        { error: 'No valid transactions to import' },
        { status: 400 }
      );
    }

    // Create import batch record
    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        user_id: user.id,
        broker_source: broker || 'other',
        file_name: source || 'import',
        status: 'processing',
        total_rows: transactions.length,
        processed_rows: 0,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Pre-fetch company profiles for unique symbols to avoid N+1
    const uniqueSymbols = [...new Set(validTxns.map(t => t.symbol.toUpperCase()))];
    const profileMap = new Map<string, { sector: string } | null>();
    await Promise.all(uniqueSymbols.map(async (sym) => {
      try {
        const profile = await getCompanyProfile(sym);
        profileMap.set(sym, profile);
      } catch { profileMap.set(sym, null); }
    }));

    let successCount = 0;
    let failCount = 0;
    const errors: { symbol: string; error: string }[] = [];

    for (const txn of validTxns) {
      try {
        // Upsert asset (with sector from Finnhub)
        const symbolUpper = txn.symbol.toUpperCase();
        const sector = profileMap.get(symbolUpper)?.sector ?? null;

        const { data: asset, error: assetError } = await supabase
          .from('assets')
          .upsert(
            {
              symbol: symbolUpper,
              name: symbolUpper,
              asset_type: 'stock',
              ...(sector ? { sector } : {}),
            },
            { onConflict: 'symbol' }
          )
          .select('id')
          .single();

        if (assetError) throw assetError;

        // Insert transaction
        const { error: txnError } = await supabase.from('transactions').insert({
          portfolio_id: portfolioId,
          asset_id: asset.id,
          transaction_type: txn.type,
          quantity: txn.quantity,
          price_per_unit: txn.price,
          total_amount: txn.total,
          fees: txn.fees || 0,
          transaction_date: new Date(txn.date).toISOString(),
          broker_source: broker || 'manual',
          import_batch_id: batch.id,
        });

        if (txnError) throw txnError;
        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push({ symbol: txn.symbol, error: err.message });
      }
    }

    // Update batch status
    await supabase
      .from('import_batches')
      .update({
        status: failCount === validTxns.length ? 'failed' : 'completed',
        processed_rows: successCount,
        error_log: errors.length > 0 ? errors : [],
      })
      .eq('id', batch.id);

    if (successCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `All ${failCount} transaction(s) failed to import`,
          batchId: batch.id,
          imported: 0,
          failed: failCount,
          skipped: transactions.length - validTxns.length,
          errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      imported: successCount,
      failed: failCount,
      skipped: transactions.length - validTxns.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[import/confirm] error:', error);
    return NextResponse.json(
      { error: 'Failed to import transactions' },
      { status: 500 }
    );
  }
}
