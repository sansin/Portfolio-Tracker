import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCompanyProfile } from '@/lib/services/stock-data';
import { isCashTransaction, isOptionTransaction, optionAssetSymbol, formatOptionSymbol } from '@/types';
import { isKnownCryptoSymbol } from '@/lib/services/crypto-data';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolio_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25') || 25, 1), 100);
  const offset = (page - 1) * limit;

  // Get user's portfolio IDs for auth filtering
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id);

  const portfolioIds = portfolios?.map((p) => p.id) || [];
  if (portfolioIds.length === 0) {
    return NextResponse.json({ data: [], total: 0 });
  }

  let query = supabase
    .from('transactions')
    .select(`
      *,
      asset:assets!asset_id (id, symbol, name, asset_type, logo_url, sector),
      portfolio:portfolios!portfolio_id (id, name, color)
    `, { count: 'exact' })
    .in('portfolio_id', portfolioIds)
    .order('transaction_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (portfolioId) {
    query = query.eq('portfolio_id', portfolioId);
  }

  const type = searchParams.get('type');
  if (type) query = query.eq('transaction_type', type);

  const broker = searchParams.get('broker');
  if (broker) query = query.eq('broker_source', broker);

  const dateFrom = searchParams.get('date_from');
  if (dateFrom) query = query.gte('transaction_date', dateFrom);

  const dateTo = searchParams.get('date_to');
  if (dateTo) query = query.lte('transaction_date', dateTo);

  const { data, error, count } = await query;

  if (error) {
    console.error('[transactions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Input validation
  const validTypes = ['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out', 'deposit', 'withdrawal', 'margin_interest', 'option_exercise', 'option_assignment', 'option_expiration'];
  if (!validTypes.includes(body.transaction_type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 });
  }

  const isCash = isCashTransaction(body.transaction_type);
  const isOption = body.asset_type === 'option' || body.option_type;

  // Cash transactions (deposit/withdrawal/margin_interest) only require amount
  if (isCash) {
    if (typeof body.total_amount !== 'number' || body.total_amount === 0 || !isFinite(body.total_amount)) {
      return NextResponse.json({ error: 'Amount must be a non-zero number' }, { status: 400 });
    }
  } else {
    if (!body.symbol || typeof body.symbol !== 'string' || body.symbol.trim().length === 0 || body.symbol.length > 10) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }
    if (typeof body.quantity !== 'number' || body.quantity <= 0 || !isFinite(body.quantity)) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }
    if (typeof body.price_per_unit !== 'number' || body.price_per_unit <= 0 || !isFinite(body.price_per_unit)) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 });
    }
  }
  if (body.fees !== undefined && body.fees !== null && (typeof body.fees !== 'number' || body.fees < 0)) {
    return NextResponse.json({ error: 'Fees must be non-negative' }, { status: 400 });
  }
  if (body.transaction_date && isNaN(Date.parse(body.transaction_date))) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  // Verify portfolio belongs to user
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', body.portfolio_id)
    .eq('user_id', user.id)
    .single();

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  }

  // Upsert asset — for cash transactions use a synthetic $CASH symbol
  // For options, create a unique symbol encoding the contract details
  let symbolUpper: string;
  let assetName: string;
  let assetType: string;

  if (isCash) {
    symbolUpper = '$CASH';
    assetName = 'Cash';
    assetType = 'other';
  } else if (isOption) {
    // Validate option-specific fields
    if (!body.underlying_symbol || !body.option_type || !body.strike_price || !body.expiration_date) {
      return NextResponse.json({ error: 'Options require underlying_symbol, option_type, strike_price, expiration_date' }, { status: 400 });
    }
    const underlying = body.underlying_symbol.toUpperCase();
    symbolUpper = optionAssetSymbol(underlying, body.option_type, body.strike_price, body.expiration_date);
    assetName = formatOptionSymbol(underlying, body.option_type, body.strike_price, body.expiration_date);
    assetType = 'option';
  } else {
    symbolUpper = body.symbol.toUpperCase();
    assetName = body.asset_name || symbolUpper;
    const isCrypto = isKnownCryptoSymbol(symbolUpper);
    assetType = isCrypto ? 'crypto' : (body.asset_type || 'stock');
  }

  const isCrypto = !isCash && !isOption && isKnownCryptoSymbol(symbolUpper);
  let sector: string | null = null;
  if (!isCash && !isCrypto && !isOption) {
    try {
      const profile = await getCompanyProfile(symbolUpper);
      if (profile) sector = profile.sector;
    } catch { /* non-critical */ }
  }
  if (isCrypto) sector = 'Cryptocurrency';
  if (isOption) sector = 'Options';

  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .upsert(
      {
        symbol: symbolUpper,
        name: assetName,
        asset_type: assetType,
        ...(sector ? { sector } : {}),
      },
      { onConflict: 'symbol' }
    )
    .select('id')
    .single();

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
  }

  // Upsert options contract metadata if this is an option
  if (isOption) {
    const { error: contractError } = await supabase
      .from('options_contracts')
      .upsert(
        {
          asset_id: asset.id,
          underlying_symbol: body.underlying_symbol.toUpperCase(),
          option_type: body.option_type,
          strike_price: body.strike_price,
          expiration_date: body.expiration_date,
          contract_multiplier: body.contract_multiplier || 100,
        },
        { onConflict: 'asset_id' }
      );

    if (contractError) {
      console.error('[transactions] Options contract upsert error:', contractError);
    }
  }

  // For cash transactions: quantity=1, price_per_unit=amount, total_amount=amount
  // Withdrawals & margin_interest are stored as negative total_amount
  const cashAmount = isCash ? body.total_amount : undefined;
  const quantity = isCash ? 1 : body.quantity;
  const pricePerUnit = isCash ? Math.abs(cashAmount!) : body.price_per_unit;
  const totalAmount = isCash
    ? cashAmount!
    : body.quantity * body.price_per_unit + (body.fees || 0);

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      portfolio_id: body.portfolio_id,
      asset_id: asset.id,
      transaction_type: body.transaction_type,
      quantity,
      price_per_unit: pricePerUnit,
      total_amount: totalAmount,
      fees: body.fees || 0,
      transaction_date: body.transaction_date,
      notes: body.notes || null,
      broker_source: body.broker_source || 'manual',
    })
    .select(`
      *,
      asset:assets!asset_id (id, symbol, name, asset_type, logo_url),
      portfolio:portfolios!portfolio_id (id, name, color)
    `)
    .single();

  if (error) {
    console.error('[transactions] POST error:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, transaction_type, quantity, price_per_unit, fees, transaction_date, notes } = body;

  if (!id) {
    return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
  }

  // Input validation
  const validTypes = ['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out', 'deposit', 'withdrawal', 'margin_interest', 'option_exercise', 'option_assignment', 'option_expiration'];
  if (transaction_type && !validTypes.includes(transaction_type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 });
  }

  const isCash = transaction_type ? isCashTransaction(transaction_type) : false;

  if (!isCash) {
    if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0 || !isFinite(quantity))) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }
    if (price_per_unit !== undefined && (typeof price_per_unit !== 'number' || price_per_unit <= 0 || !isFinite(price_per_unit))) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 });
    }
  }
  if (fees !== undefined && fees !== null && (typeof fees !== 'number' || fees < 0)) {
    return NextResponse.json({ error: 'Fees must be non-negative' }, { status: 400 });
  }
  if (transaction_date && isNaN(Date.parse(transaction_date))) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  // Verify transaction belongs to user's portfolio
  const { data: transaction } = await supabase
    .from('transactions')
    .select('id, portfolio_id, portfolios!portfolio_id(user_id)')
    .eq('id', id)
    .single();

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const ownerUserId = (transaction as any).portfolios?.user_id;
  if (ownerUserId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build update object — only include provided fields
  const updates: Record<string, unknown> = {};
  if (transaction_type !== undefined) updates.transaction_type = transaction_type;
  if (quantity !== undefined) updates.quantity = quantity;
  if (price_per_unit !== undefined) updates.price_per_unit = price_per_unit;
  if (fees !== undefined) updates.fees = fees || 0;
  if (transaction_date !== undefined) updates.transaction_date = transaction_date;
  if (notes !== undefined) updates.notes = notes || null;

  // Recompute total_amount only when both quantity and price are known
  if (quantity !== undefined && price_per_unit !== undefined) {
    updates.total_amount = quantity * price_per_unit + (fees || 0);
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      asset:assets!asset_id (id, symbol, name, asset_type, logo_url),
      portfolio:portfolios!portfolio_id (id, name, color)
    `)
    .single();

  if (error) {
    console.error('[transactions] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }

  return NextResponse.json({ data });
}
