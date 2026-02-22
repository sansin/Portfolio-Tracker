import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { TransactionRow, TransactionWithAsset } from '@/types';

interface TransactionFilters {
  portfolioId?: string;
  assetId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  broker?: string;
}

interface TransactionState {
  transactions: TransactionWithAsset[];
  loading: boolean;
  error: string | null;
  filters: TransactionFilters;
  totalCount: number;
  page: number;

  // Actions
  fetchTransactions: (portfolioId?: string) => Promise<void>;
  addTransaction: (data: {
    portfolio_id: string;
    symbol: string;
    transaction_type: string;
    quantity: number;
    price_per_unit: number;
    fees?: number;
    transaction_date: string;
    notes?: string;
    broker_source?: string;
  }) => Promise<boolean>;
  updateTransaction: (id: string, data: {
    portfolio_id?: string;
    transaction_type: string;
    quantity: number;
    price_per_unit: number;
    fees: number;
    transaction_date: string;
    notes?: string;
  }) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  setFilters: (filters: Partial<TransactionFilters>) => void;
  setPage: (page: number) => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading: false,
  error: null,
  filters: {},
  totalCount: 0,
  page: 1,

  fetchTransactions: async (portfolioId?: string) => {
    set({ loading: true, error: null });
    const supabase = createClient();
    const { filters, page } = get();
    const limit = 25;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        asset:assets!asset_id (id, symbol, name, asset_type, logo_url),
        portfolio:portfolios!portfolio_id (id, name, color)
      `, { count: 'exact' })
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    const pid = portfolioId || filters.portfolioId;
    if (pid) query = query.eq('portfolio_id', pid);
    if (filters.assetId) query = query.eq('asset_id', filters.assetId);
    if (filters.type) query = query.eq('transaction_type', filters.type);
    if (filters.broker) query = query.eq('broker_source', filters.broker);
    if (filters.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('transaction_date', filters.dateTo);

    const { data, error, count } = await query;

    if (error) {
      set({ error: error.message, loading: false });
      return;
    }

    set({
      transactions: (data as unknown as TransactionWithAsset[]) || [],
      totalCount: count || 0,
      loading: false,
    });
  },

  addTransaction: async (data) => {
    const supabase = createClient();

    // First, ensure the asset exists (upsert by symbol)
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .upsert(
        { symbol: data.symbol.toUpperCase(), name: data.symbol.toUpperCase(), asset_type: 'stock' },
        { onConflict: 'symbol' }
      )
      .select('id')
      .single();

    if (assetError || !asset) {
      set({ error: assetError?.message || 'Failed to find/create asset' });
      return false;
    }

    const totalAmount = data.quantity * data.price_per_unit + (data.fees || 0);

    const { error } = await supabase.from('transactions').insert({
      portfolio_id: data.portfolio_id,
      asset_id: asset.id,
      transaction_type: data.transaction_type as any,
      quantity: data.quantity,
      price_per_unit: data.price_per_unit,
      total_amount: totalAmount,
      fees: data.fees || 0,
      transaction_date: data.transaction_date,
      notes: data.notes || null,
      broker_source: (data.broker_source || 'manual') as any,
    });

    if (error) {
      set({ error: error.message });
      return false;
    }

    // Refresh
    await get().fetchTransactions();
    return true;
  },

  updateTransaction: async (id, data) => {
    const supabase = createClient();
    const totalAmount = data.quantity * data.price_per_unit + (data.fees || 0);

    const updatePayload: Record<string, any> = {
      transaction_type: data.transaction_type as any,
      quantity: data.quantity,
      price_per_unit: data.price_per_unit,
      total_amount: totalAmount,
      fees: data.fees || 0,
      transaction_date: data.transaction_date,
      notes: data.notes || null,
    };

    if (data.portfolio_id) {
      updatePayload.portfolio_id = data.portfolio_id;
    }

    const { error } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      set({ error: error.message });
      return false;
    }

    // Refresh
    await get().fetchTransactions();
    return true;
  },

  deleteTransaction: async (id) => {
    const supabase = createClient();
    const { error } = await supabase.from('transactions').delete().eq('id', id);

    if (error) {
      set({ error: error.message });
      return false;
    }

    // Refresh to get accurate totalCount and re-paginate
    await get().fetchTransactions();
    return true;
  },

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters }, page: 1 })),

  setPage: (page) => set({ page }),
}));
