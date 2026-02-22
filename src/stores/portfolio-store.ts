import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { PortfolioRow, PortfolioInsert, PortfolioUpdate } from '@/types';

interface PortfolioState {
  portfolios: PortfolioRow[];
  activePortfolioId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchPortfolios: () => Promise<void>;
  createPortfolio: (data: Omit<PortfolioInsert, 'user_id'>) => Promise<PortfolioRow | null>;
  updatePortfolio: (id: string, data: PortfolioUpdate) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
  setActivePortfolio: (id: string | null) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolios: [],
  activePortfolioId: null,
  loading: false,
  error: null,

  fetchPortfolios: async () => {
    set({ loading: true, error: null });
    const supabase = createClient();
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      set({ error: error.message, loading: false });
      return;
    }

    set({ portfolios: (data || []) as PortfolioRow[], loading: false });

    // Auto-select first portfolio if none selected
    if (!get().activePortfolioId && data && data.length > 0) {
      const defaultPortfolio = data.find((p: any) => p.is_default) || data[0];
      set({ activePortfolioId: defaultPortfolio.id });
    }
  },

  createPortfolio: async (data) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: portfolio, error } = await supabase
      .from('portfolios')
      .insert({ ...data, user_id: user.id })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return null;
    }

    set((state) => ({ portfolios: [...state.portfolios, portfolio as PortfolioRow] }));
    return portfolio as PortfolioRow;
  },

  updatePortfolio: async (id, data) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('portfolios')
      .update(data)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      set({ error: error.message });
      return;
    }

    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === id ? { ...p, ...data } as PortfolioRow : p
      ),
    }));
  },

  deletePortfolio: async (id) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      set({ error: error.message });
      return;
    }

    set((state) => ({
      portfolios: state.portfolios.filter((p) => p.id !== id),
      activePortfolioId: state.activePortfolioId === id ? null : state.activePortfolioId,
    }));
  },

  setActivePortfolio: (id) => set({ activePortfolioId: id }),
}));
