/**
 * Stock & crypto data service.
 * Stocks: powered by Finnhub.io (60 API calls/min free tier).
 * Crypto: powered by CoinGecko (no API key, ~10-30 req/min free tier).
 *
 * Symbol routing: crypto symbols (BTC, ETH, …) → CoinGecko; everything else → Finnhub.
 */

import {
  isKnownCryptoSymbol,
  getCryptoQuote,
  getBulkCryptoQuotes,
  searchCrypto,
  getCryptoChartData,
} from './crypto-data';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function finnhubToken(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not set');
  return key;
}

// ---- Server-side Quote Cache ----
// TTL-based in-memory cache to avoid hammering Finnhub API.
// Quotes are cached for 30s during market hours, 5min outside.

interface CachedQuote {
  quote: StockQuote;
  timestamp: number;
}

const quoteCache = new Map<string, CachedQuote>();
const CACHE_TTL_MARKET_OPEN = 30_000;   // 30 seconds
const CACHE_TTL_MARKET_CLOSED = 300_000; // 5 minutes

function isUSMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960; // 9:30 AM - 4:00 PM ET
}

function getCacheTTL(): number {
  return isUSMarketOpen() ? CACHE_TTL_MARKET_OPEN : CACHE_TTL_MARKET_CLOSED;
}

function getCachedQuote(symbol: string): StockQuote | null {
  const cached = quoteCache.get(symbol);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > getCacheTTL()) {
    quoteCache.delete(symbol);
    return null;
  }
  return cached.quote;
}

function setCachedQuote(symbol: string, quote: StockQuote): void {
  quoteCache.set(symbol, { quote, timestamp: Date.now() });
}

// ---- Types ----

export interface StockQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  name: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// ---- In-memory symbol name cache ----
// Avoids burning API calls just to resolve a display name
const symbolNameCache = new Map<string, string>();

async function resolveSymbolName(symbol: string): Promise<string> {
  if (symbolNameCache.has(symbol)) return symbolNameCache.get(symbol)!;

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken()}`
    );
    if (res.ok) {
      const data = await res.json();
      const name = data?.name || symbol;
      symbolNameCache.set(symbol, name);
      return name;
    }
  } catch { /* ignore */ }

  symbolNameCache.set(symbol, symbol);
  return symbol;
}

// ---- Single Quote ----

/**
 * Fetch a single stock quote.
 * Finnhub /quote returns: c (current), pc (previous close), h (high), l (low),
 * o (open), d (change), dp (change percent), t (timestamp)
 */
export async function getQuote(symbol: string): Promise<StockQuote | null> {
  // Route crypto symbols to CoinGecko
  if (isKnownCryptoSymbol(symbol)) {
    return getCryptoQuote(symbol);
  }

  // Check cache first
  const cached = getCachedQuote(symbol);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken()}`
    );

    if (!res.ok) return null;
    const q = await res.json();

    // Finnhub returns { c:0, d:null, dp:null ... } for invalid symbols
    if (!q || q.c === 0 || q.d === null) return null;

    const name = await resolveSymbolName(symbol);

    const quote: StockQuote = {
      symbol,
      price: q.c ?? 0,
      previousClose: q.pc ?? 0,
      change: q.d ?? 0,
      changePercent: q.dp ?? 0,
      dayHigh: q.h ?? 0,
      dayLow: q.l ?? 0,
      volume: 0,
      marketCap: 0,
      peRatio: 0,
      name,
    };

    setCachedQuote(symbol, quote);
    return quote;
  } catch {
    return null;
  }
}

// ---- Bulk Quotes ----

/**
 * Fetch quotes for multiple symbols.
 * Finnhub doesn't have a bulk endpoint, so we fetch in parallel.
 * With 60 calls/min limit this is fine for typical portfolios (< 30 holdings).
 */
export async function getBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();
  if (symbols.length === 0) return results;

  // Split into crypto vs stock symbols
  const cryptoSymbols: string[] = [];
  const stockSymbols: string[] = [];
  for (const s of symbols) {
    if (isKnownCryptoSymbol(s)) {
      cryptoSymbols.push(s);
    } else {
      stockSymbols.push(s);
    }
  }

  // Fetch crypto quotes in parallel with stock quotes
  const [cryptoQuotes] = await Promise.all([
    cryptoSymbols.length > 0
      ? getBulkCryptoQuotes(cryptoSymbols)
      : Promise.resolve(new Map<string, StockQuote>()),
  ]);

  // Merge crypto results
  for (const [k, v] of cryptoQuotes) results.set(k, v);

  // Now handle stock symbols
  if (stockSymbols.length === 0) return results;

  // Separate cached vs uncached symbols
  const uncached: string[] = [];
  for (const symbol of stockSymbols) {
    const cached = getCachedQuote(symbol);
    if (cached) {
      results.set(symbol, cached);
    } else {
      uncached.push(symbol);
    }
  }

  // Only fetch uncached symbols from Finnhub
  if (uncached.length > 0) {
    const promises = uncached.map(async (symbol) => {
      try {
        const res = await fetch(
          `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken()}`
        );

        if (!res.ok) return;
        const q = await res.json();
        if (!q || q.c === 0 || q.d === null) return;

        const name = symbolNameCache.get(symbol) || symbol;

        const quote: StockQuote = {
          symbol,
          price: q.c ?? 0,
          previousClose: q.pc ?? 0,
          change: q.d ?? 0,
          changePercent: q.dp ?? 0,
          dayHigh: q.h ?? 0,
          dayLow: q.l ?? 0,
          volume: 0,
          marketCap: 0,
          peRatio: 0,
          name,
        };

        setCachedQuote(symbol, quote);
        results.set(symbol, quote);
      } catch { /* skip failed symbol */ }
    });

    await Promise.allSettled(promises);
  }

  // Backfill names for any symbols we haven't resolved yet
  const unknownNames = stockSymbols.filter((s) => results.has(s) && !symbolNameCache.has(s));
  if (unknownNames.length > 0) {
    const namePromises = unknownNames.map(async (s) => {
      const name = await resolveSymbolName(s);
      const quote = results.get(s);
      if (quote) results.set(s, { ...quote, name });
    });
    await Promise.allSettled(namePromises);
  }

  return results;
}

// ---- Company Profile / Sector ----

const profileCache = new Map<string, { sector: string; industry: string }>();

/**
 * Fetch company profile including sector/industry from Finnhub.
 * Results are cached in memory to avoid repeated API calls.
 */
export async function getCompanyProfile(symbol: string): Promise<{ sector: string; industry: string } | null> {
  if (profileCache.has(symbol)) return profileCache.get(symbol)!;
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken()}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.finnhubIndustry) return null;
    const profile = {
      sector: data.finnhubIndustry || 'Other',
      industry: data.finnhubIndustry || 'Other',
    };
    profileCache.set(symbol, profile);
    // Also cache name while we have it
    if (data.name) symbolNameCache.set(symbol, data.name);
    return profile;
  } catch {
    return null;
  }
}

// ---- Symbol Search ----

/**
 * Search stocks by name or symbol using Finnhub symbol search,
 * merged with CoinGecko crypto results.
 */
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  // Launch stock + crypto search in parallel
  const [stockResults, cryptoResults] = await Promise.all([
    searchStocksFinnhub(query),
    searchCrypto(query),
  ]);

  // Merge results: stocks first, then crypto, deduped by symbol
  const seen = new Set<string>();
  const merged: StockSearchResult[] = [];

  for (const r of stockResults) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      merged.push(r);
    }
  }
  for (const r of cryptoResults) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      merged.push(r);
    }
  }

  return merged.slice(0, 12);
}

/**
 * Search stocks from Finnhub only (internal helper).
 */
async function searchStocksFinnhub(query: string): Promise<StockSearchResult[]> {
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${finnhubToken()}`
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.result || [])
      .filter((r: any) => r.type === 'Common Stock' || r.type === 'ETP' || r.type === 'ADR')
      .slice(0, 8)
      .map((r: any) => {
        // Cache the name while we have it
        if (r.symbol && r.description) {
          symbolNameCache.set(r.symbol, r.description);
        }
        return {
          symbol: r.symbol || '',
          name: r.description || r.symbol || '',
          exchange: r.displaySymbol || '',
          type: (r.type || 'stock').toLowerCase(),
        };
      });
  } catch {
    return [];
  }
}

// ---- Earnings Calendar ----

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string; // 'bmo' (before market open), 'amc' (after market close), ''
  quarter: number;
  year: number;
}

/**
 * Fetch upcoming earnings calendar for a date range.
 * Optionally filter to only symbols the user owns.
 */
export async function getEarningsCalendar(
  from: string,
  to: string,
  filterSymbols?: string[]
): Promise<EarningsEvent[]> {
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}&token=${finnhubToken()}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    if (!data.earningsCalendar?.length) return [];

    let events: EarningsEvent[] = data.earningsCalendar.map((e: any) => ({
      symbol: e.symbol || '',
      date: e.date || '',
      epsEstimate: e.epsEstimate ?? null,
      epsActual: e.epsActual ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
      revenueActual: e.revenueActual ?? null,
      hour: e.hour || '',
      quarter: e.quarter ?? 0,
      year: e.year ?? 0,
    }));

    // Filter to owned symbols if provided
    if (filterSymbols && filterSymbols.length > 0) {
      const symbolSet = new Set(filterSymbols.map((s) => s.toUpperCase()));
      events = events.filter((e) => symbolSet.has(e.symbol.toUpperCase()));
    }

    return events;
  } catch {
    return [];
  }
}

// ---- Historical Price ----

/**
 * Fetch the closing price for a symbol on a specific date using Finnhub candles.
 */
export async function getHistoricalPrice(symbol: string, date: string): Promise<number | null> {
  try {
    const target = new Date(date);
    // 5-day window to account for weekends/holidays
    const from = Math.floor(target.getTime() / 1000) - 3 * 86400;
    const to = Math.floor(target.getTime() / 1000) + 3 * 86400;

    const res = await fetch(
      `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${finnhubToken()}`
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (data.s !== 'ok' || !data.c?.length) return null;

    // Return the last available close in the window
    for (let i = data.c.length - 1; i >= 0; i--) {
      if (data.c[i] != null) return data.c[i];
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Chart Data ----

export interface ChartDataPoint {
  timestamp: number;
  date: string;
  price: number;
  volume?: number;
}

type ChartRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

/**
 * Map chart range to Finnhub candle resolution.
 * Finnhub resolutions: 1, 5, 15, 30, 60, D, W, M
 */
function getResolutionForRange(range: ChartRange): string {
  switch (range) {
    case '1D': return '5';     // 5-minute candles
    case '1W': return '30';    // 30-minute candles
    case '1M': return 'D';    // daily candles (hourly unreliable on free tier)
    case '3M':
    case '6M':
    case 'YTD':
    case '1Y': return 'D';    // daily candles
    case '5Y': return 'W';    // weekly candles
    default: return 'D';
  }
}

function getFromTimestamp(range: ChartRange): number {
  const now = new Date();
  switch (range) {
    case '1D': return Math.floor((now.getTime() - 1 * 86400000) / 1000);
    case '1W': return Math.floor((now.getTime() - 7 * 86400000) / 1000);
    case '1M': return Math.floor((now.getTime() - 30 * 86400000) / 1000);
    case '3M': return Math.floor((now.getTime() - 90 * 86400000) / 1000);
    case '6M': return Math.floor((now.getTime() - 180 * 86400000) / 1000);
    case 'YTD': {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return Math.floor(jan1.getTime() / 1000);
    }
    case '1Y': return Math.floor((now.getTime() - 365 * 86400000) / 1000);
    case '5Y': return Math.floor((now.getTime() - 1825 * 86400000) / 1000);
    default: return Math.floor((now.getTime() - 365 * 86400000) / 1000);
  }
}

function formatDateForRange(timestamp: number, range: ChartRange): string {
  const d = new Date(timestamp * 1000);
  if (range === '1D') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Fetch chart data (time series) for a symbol over a given range.
 * Routes crypto symbols to CoinGecko, stocks to Finnhub/Yahoo.
 */
export async function getChartData(
  symbol: string,
  range: ChartRange
): Promise<ChartDataPoint[]> {
  // Route crypto to CoinGecko chart
  if (isKnownCryptoSymbol(symbol)) {
    return getCryptoChartData(symbol, range);
  }

  // Try Finnhub first
  const finnhubPoints = await getChartDataFinnhub(symbol, range);
  if (finnhubPoints.length > 0) return finnhubPoints;

  // Fallback to Yahoo Finance
  return getChartDataYahoo(symbol, range);
}

function getYahooRangeAndInterval(range: ChartRange): { range: string; interval: string } {
  switch (range) {
    case '1D': return { range: '1d', interval: '5m' };
    case '1W': return { range: '5d', interval: '30m' };
    case '1M': return { range: '1mo', interval: '1d' };
    case '3M': return { range: '3mo', interval: '1d' };
    case '6M': return { range: '6mo', interval: '1d' };
    case 'YTD': return { range: 'ytd', interval: '1d' };
    case '1Y': return { range: '1y', interval: '1wk' };
    case '5Y': return { range: '5y', interval: '1mo' };
    default: return { range: '3mo', interval: '1d' };
  }
}

async function getChartDataYahoo(
  symbol: string,
  range: ChartRange
): Promise<ChartDataPoint[]> {
  try {
    const { range: yahooRange, interval } = getYahooRangeAndInterval(range);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yahooRange}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioTracker/1.0)' },
    });

    if (!res.ok) return [];
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result?.timestamp?.length) return [];

    const timestamps: number[] = result.timestamp;
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const points: ChartDataPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close != null) {
        points.push({
          timestamp: timestamps[i],
          date: formatDateForRange(timestamps[i], range),
          price: Math.round(close * 100) / 100,
        });
      }
    }
    return points;
  } catch {
    return [];
  }
}

async function getChartDataFinnhub(
  symbol: string,
  range: ChartRange
): Promise<ChartDataPoint[]> {
  try {
    const from = getFromTimestamp(range);
    const to = Math.floor(Date.now() / 1000);
    const resolution = getResolutionForRange(range);

    const res = await fetch(
      `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${finnhubToken()}`
    );

    if (!res.ok) return [];
    const data = await res.json();

    // Fallback: if intraday resolution returned no data, retry with daily
    if ((data.s !== 'ok' || !data.t?.length) && resolution !== 'D' && resolution !== 'W') {
      const retryRes = await fetch(
        `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${finnhubToken()}`
      );
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        if (retryData.s === 'ok' && retryData.t?.length) {
          const points: ChartDataPoint[] = [];
          for (let i = 0; i < retryData.t.length; i++) {
            if (retryData.c[i] != null) {
              points.push({
                timestamp: retryData.t[i],
                date: formatDateForRange(retryData.t[i], range),
                price: Math.round(retryData.c[i] * 100) / 100,
                volume: retryData.v?.[i] ?? undefined,
              });
            }
          }
          return points;
        }
      }
      return [];
    }

    if (data.s !== 'ok' || !data.t?.length) return [];

    const points: ChartDataPoint[] = [];
    for (let i = 0; i < data.t.length; i++) {
      if (data.c[i] != null) {
        points.push({
          timestamp: data.t[i],
          date: formatDateForRange(data.t[i], range),
          price: Math.round(data.c[i] * 100) / 100,
          volume: data.v?.[i] ?? undefined,
        });
      }
    }
    return points;
  } catch {
    return [];
  }
}
