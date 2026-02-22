import { create } from 'zustand';
import type { StockQuote } from '@/lib/services/stock-data';

interface QuoteState {
  quotes: Record<string, StockQuote>;
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
  _pollingInterval: ReturnType<typeof setInterval> | null;
  _pollingSymbols: string[];

  // Actions
  fetchQuotes: (symbols: string[]) => Promise<Record<string, StockQuote>>;
  startPolling: (symbols: string[]) => void;
  stopPolling: () => void;
  getQuote: (symbol: string) => StockQuote | undefined;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // NYSE: 9:30 AM - 4:00 PM ET
  return timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60;
}

function getPollingInterval(): number {
  return isMarketOpen() ? 30_000 : 5 * 60_000;
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export { isMarketOpen };

export const useQuoteStore = create<QuoteState>((set, get) => ({
  quotes: {},
  lastUpdated: null,
  loading: false,
  error: null,
  _pollingInterval: null,
  _pollingSymbols: [],

  fetchQuotes: async (symbols: string[]) => {
    if (symbols.length === 0) return {};

    set({ loading: true, error: null });

    try {
      const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
      const res = await fetch(
        `/api/stocks/quote?symbols=${uniqueSymbols.join(',')}`
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch quotes: ${res.status}`);
      }

      const data = await res.json();
      const newQuotes: Record<string, StockQuote> = data.quotes || {};

      set((state) => ({
        quotes: { ...state.quotes, ...newQuotes },
        lastUpdated: Date.now(),
        loading: false,
        error: null,
      }));

      return newQuotes;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return get().quotes;
    }
  },

  startPolling: (symbols: string[]) => {
    const state = get();

    // Stop existing polling first
    if (state._pollingInterval) {
      clearInterval(state._pollingInterval);
    }

    if (symbols.length === 0) return;

    set({ _pollingSymbols: symbols });

    // Fetch immediately
    get().fetchQuotes(symbols);

    // Set up interval - adapts to market hours
    const poll = () => {
      const interval = getPollingInterval();

      const id = setInterval(() => {
        get().fetchQuotes(get()._pollingSymbols);

        // Re-check interval in case market opened/closed
        const newInterval = getPollingInterval();
        if (newInterval !== interval) {
          clearInterval(id);
          poll();
        }
      }, interval);

      set({ _pollingInterval: id });
    };

    poll();
  },

  stopPolling: () => {
    const state = get();
    if (state._pollingInterval) {
      clearInterval(state._pollingInterval);
      set({ _pollingInterval: null, _pollingSymbols: [] });
    }
  },

  getQuote: (symbol: string) => {
    return get().quotes[symbol.toUpperCase()];
  },
}));
