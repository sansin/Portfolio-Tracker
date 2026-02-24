/**
 * Crypto data service powered by CoinGecko (free, no API key required).
 * Docs: https://docs.coingecko.com/reference/introduction
 *
 * Rate limit: ~10-30 req/min on the free tier — we cache aggressively.
 */

import type { StockQuote, StockSearchResult, ChartDataPoint } from './stock-data';

const CG_BASE = 'https://api.coingecko.com/api/v3';

// ─── Symbol ↔ CoinGecko ID mapping ─────────────────────────────────────────

/**
 * Well-known crypto symbols → CoinGecko IDs.
 * We keep the top ~60 by market cap pre-mapped; anything else we look up
 * dynamically via the /search endpoint and cache the result.
 */
export const CRYPTO_SYMBOL_MAP: Record<string, { id: string; name: string }> = {
  BTC:   { id: 'bitcoin',            name: 'Bitcoin' },
  ETH:   { id: 'ethereum',           name: 'Ethereum' },
  USDT:  { id: 'tether',             name: 'Tether' },
  BNB:   { id: 'binancecoin',        name: 'BNB' },
  SOL:   { id: 'solana',             name: 'Solana' },
  USDC:  { id: 'usd-coin',           name: 'USD Coin' },
  XRP:   { id: 'ripple',             name: 'XRP' },
  DOGE:  { id: 'dogecoin',           name: 'Dogecoin' },
  ADA:   { id: 'cardano',            name: 'Cardano' },
  TRX:   { id: 'tron',               name: 'TRON' },
  AVAX:  { id: 'avalanche-2',        name: 'Avalanche' },
  SHIB:  { id: 'shiba-inu',          name: 'Shiba Inu' },
  DOT:   { id: 'polkadot',           name: 'Polkadot' },
  LINK:  { id: 'chainlink',          name: 'Chainlink' },
  TON:   { id: 'the-open-network',   name: 'Toncoin' },
  BCH:   { id: 'bitcoin-cash',       name: 'Bitcoin Cash' },
  NEAR:  { id: 'near',               name: 'NEAR Protocol' },
  MATIC: { id: 'matic-network',      name: 'Polygon' },
  POL:   { id: 'matic-network',      name: 'Polygon' },
  LTC:   { id: 'litecoin',           name: 'Litecoin' },
  ICP:   { id: 'internet-computer',  name: 'Internet Computer' },
  UNI:   { id: 'uniswap',            name: 'Uniswap' },
  DAI:   { id: 'dai',                name: 'Dai' },
  APT:   { id: 'aptos',              name: 'Aptos' },
  ETC:   { id: 'ethereum-classic',   name: 'Ethereum Classic' },
  FIL:   { id: 'filecoin',           name: 'Filecoin' },
  ATOM:  { id: 'cosmos',             name: 'Cosmos' },
  RENDER:{ id: 'render-token',       name: 'Render' },
  XLM:   { id: 'stellar',            name: 'Stellar' },
  IMX:   { id: 'immutable-x',        name: 'Immutable' },
  HBAR:  { id: 'hedera-hashgraph',   name: 'Hedera' },
  ARB:   { id: 'arbitrum',           name: 'Arbitrum' },
  OP:    { id: 'optimism',           name: 'Optimism' },
  SUI:   { id: 'sui',                name: 'Sui' },
  SEI:   { id: 'sei-network',        name: 'Sei' },
  MKR:   { id: 'maker',              name: 'Maker' },
  AAVE:  { id: 'aave',               name: 'Aave' },
  FET:   { id: 'fetch-ai',           name: 'Fetch.ai' },
  PEPE:  { id: 'pepe',               name: 'Pepe' },
  INJ:   { id: 'injective-protocol', name: 'Injective' },
  ALGO:  { id: 'algorand',           name: 'Algorand' },
  VET:   { id: 'vechain',            name: 'VeChain' },
  MANA:  { id: 'decentraland',       name: 'Decentraland' },
  SAND:  { id: 'the-sandbox',        name: 'The Sandbox' },
  AXS:   { id: 'axie-infinity',      name: 'Axie Infinity' },
  CRV:   { id: 'curve-dao-token',    name: 'Curve DAO' },
  LDO:   { id: 'lido-dao',           name: 'Lido DAO' },
  WLD:   { id: 'worldcoin-wld',      name: 'Worldcoin' },
  BONK:  { id: 'bonk',               name: 'Bonk' },
  JUP:   { id: 'jupiter-exchange-solana', name: 'Jupiter' },
};

/** Runtime cache for dynamically discovered CoinGecko IDs */
const dynamicIdCache = new Map<string, string>();

/**
 * Resolve a uppercase ticker to a CoinGecko ID.
 * Returns `null` if we can't find a mapping.
 */
export function cryptoIdForSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  if (CRYPTO_SYMBOL_MAP[upper]) return CRYPTO_SYMBOL_MAP[upper].id;
  return dynamicIdCache.get(upper) ?? null;
}

/**
 * Returns true if we *know* the symbol is a crypto ticker.
 * – It's in our explicit map, or
 * – We previously resolved it via search.
 */
export function isKnownCryptoSymbol(symbol: string): boolean {
  const u = symbol.toUpperCase();
  return u in CRYPTO_SYMBOL_MAP || dynamicIdCache.has(u);
}

// ─── Caching ────────────────────────────────────────────────────────────────

interface CachedEntry<T> { data: T; ts: number }
const CRYPTO_CACHE_TTL = 30_000; // 30 s — crypto is 24/7

const cryptoQuoteCache = new Map<string, CachedEntry<StockQuote>>();
const cryptoChartCache = new Map<string, CachedEntry<ChartDataPoint[]>>();

function isFresh<T>(entry: CachedEntry<T> | undefined, ttl = CRYPTO_CACHE_TTL): entry is CachedEntry<T> {
  return !!entry && Date.now() - entry.ts < ttl;
}

// ─── Quotes ─────────────────────────────────────────────────────────────────

/**
 * Fetch a single crypto quote via CoinGecko /simple/price.
 */
export async function getCryptoQuote(symbol: string): Promise<StockQuote | null> {
  const cached = cryptoQuoteCache.get(symbol);
  if (isFresh(cached)) return cached.data;

  const id = cryptoIdForSymbol(symbol);
  if (!id) return null;

  try {
    const res = await fetch(
      `${CG_BASE}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coin = data[id];
    if (!coin) return null;

    const price = coin.usd ?? 0;
    const change24 = coin.usd_24h_change ?? 0;
    const prevClose = price / (1 + change24 / 100);
    const name = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()]?.name ?? symbol;

    const quote: StockQuote = {
      symbol: symbol.toUpperCase(),
      price,
      previousClose: Math.round(prevClose * 100) / 100,
      change: Math.round((price - prevClose) * 100) / 100,
      changePercent: Math.round(change24 * 100) / 100,
      dayHigh: price, // CoinGecko free doesn't give 24h H/L in /simple/price
      dayLow: price,
      volume: coin.usd_24h_vol ?? 0,
      marketCap: coin.usd_market_cap ?? 0,
      peRatio: 0,
      name,
    };

    cryptoQuoteCache.set(symbol.toUpperCase(), { data: quote, ts: Date.now() });
    return quote;
  } catch {
    return null;
  }
}

/**
 * Fetch quotes for multiple crypto symbols in a single CoinGecko call.
 */
export async function getBulkCryptoQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();
  if (symbols.length === 0) return results;

  // Separate cached vs uncached
  const uncachedSymbols: string[] = [];
  const idToSymbol = new Map<string, string>();

  for (const sym of symbols) {
    const upper = sym.toUpperCase();
    const cached = cryptoQuoteCache.get(upper);
    if (isFresh(cached)) {
      results.set(upper, cached.data);
    } else {
      const id = cryptoIdForSymbol(upper);
      if (id) {
        idToSymbol.set(id, upper);
        uncachedSymbols.push(upper);
      }
    }
  }

  if (idToSymbol.size === 0) return results;

  try {
    const ids = Array.from(idToSymbol.keys()).join(',');
    const res = await fetch(
      `${CG_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
    );
    if (!res.ok) return results;
    const data = await res.json();

    for (const [id, sym] of idToSymbol) {
      const coin = data[id];
      if (!coin) continue;

      const price = coin.usd ?? 0;
      const change24 = coin.usd_24h_change ?? 0;
      const prevClose = price / (1 + change24 / 100);
      const name = CRYPTO_SYMBOL_MAP[sym]?.name ?? sym;

      const quote: StockQuote = {
        symbol: sym,
        price,
        previousClose: Math.round(prevClose * 100) / 100,
        change: Math.round((price - prevClose) * 100) / 100,
        changePercent: Math.round(change24 * 100) / 100,
        dayHigh: price,
        dayLow: price,
        volume: coin.usd_24h_vol ?? 0,
        marketCap: coin.usd_market_cap ?? 0,
        peRatio: 0,
        name,
      };

      cryptoQuoteCache.set(sym, { data: quote, ts: Date.now() });
      results.set(sym, quote);
    }
  } catch { /* fail gracefully */ }

  return results;
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Search CoinGecko for crypto coins by query string.
 */
export async function searchCrypto(query: string): Promise<StockSearchResult[]> {
  try {
    const res = await fetch(`${CG_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();

    const coins: StockSearchResult[] = (data.coins || [])
      .slice(0, 8)
      .map((c: any) => {
        const symbol = (c.symbol || '').toUpperCase();
        // Cache the mapping so future calls to cryptoIdForSymbol work
        if (c.id && symbol) {
          dynamicIdCache.set(symbol, c.id);
        }
        return {
          symbol,
          name: c.name || symbol,
          exchange: 'Crypto',
          type: 'crypto',
        };
      });

    return coins;
  } catch {
    return [];
  }
}

// ─── Chart ──────────────────────────────────────────────────────────────────

type CryptoChartRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

function cgDaysForRange(range: CryptoChartRange): number {
  switch (range) {
    case '1D':  return 1;
    case '1W':  return 7;
    case '1M':  return 30;
    case '3M':  return 90;
    case '6M':  return 180;
    case 'YTD': {
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - jan1.getTime()) / 86_400_000);
    }
    case '1Y':  return 365;
    case '5Y':  return 1825;
    default:    return 30;
  }
}

function formatCryptoDate(ts: number, range: CryptoChartRange): string {
  const d = new Date(ts); // CoinGecko gives ms already
  if (range === '1D') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Fetch chart data for a crypto symbol from CoinGecko /coins/{id}/market_chart.
 */
export async function getCryptoChartData(
  symbol: string,
  range: CryptoChartRange
): Promise<ChartDataPoint[]> {
  const cacheKey = `${symbol.toUpperCase()}-${range}`;
  const cached = cryptoChartCache.get(cacheKey);
  // Chart cache: 60s for 1D, 5min for longer ranges
  const ttl = range === '1D' ? 60_000 : 300_000;
  if (isFresh(cached, ttl)) return cached.data;

  const id = cryptoIdForSymbol(symbol);
  if (!id) return [];

  const days = cgDaysForRange(range);

  try {
    const res = await fetch(
      `${CG_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}&precision=2`
    );
    if (!res.ok) return [];
    const data = await res.json();

    const prices: [number, number][] = data.prices || [];
    if (prices.length === 0) return [];

    // Downsample if too many points (CoinGecko can return 1000+ for longer ranges)
    const maxPoints = range === '1D' ? 288 : 200;
    const step = Math.max(1, Math.floor(prices.length / maxPoints));

    const points: ChartDataPoint[] = [];
    for (let i = 0; i < prices.length; i += step) {
      const [ts, price] = prices[i];
      points.push({
        timestamp: Math.floor(ts / 1000), // convert ms → s to match Finnhub format
        date: formatCryptoDate(ts, range),
        price: Math.round(price * 100) / 100,
      });
    }

    // Always include the last point
    const last = prices[prices.length - 1];
    if (points.length > 0 && points[points.length - 1].timestamp !== Math.floor(last[0] / 1000)) {
      points.push({
        timestamp: Math.floor(last[0] / 1000),
        date: formatCryptoDate(last[0], range),
        price: Math.round(last[1] * 100) / 100,
      });
    }

    cryptoChartCache.set(cacheKey, { data: points, ts: Date.now() });
    return points;
  } catch {
    return [];
  }
}

// ─── Crypto Detail (extended info) ──────────────────────────────────────────

export interface CryptoDetail {
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap: number;
  name: string;
  symbol: string;
  sector: string;
  industry: string;
  week52High: number | null;
  week52Low: number | null;
  allTimeHigh: number | null;
  allTimeHighDate: string | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
}

/**
 * Fetch rich detail for a crypto coin, similar to the stock detail endpoint.
 */
export async function getCryptoDetail(symbol: string): Promise<CryptoDetail | null> {
  const id = cryptoIdForSymbol(symbol);
  if (!id) return null;

  try {
    const res = await fetch(
      `${CG_BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const md = data.market_data;
    if (!md) return null;

    const price = md.current_price?.usd ?? 0;
    const change24 = md.price_change_percentage_24h ?? 0;
    const prevClose = price / (1 + change24 / 100);

    return {
      price,
      previousClose: Math.round(prevClose * 100) / 100,
      change: Math.round(md.price_change_24h_in_currency?.usd ?? 0 * 100) / 100,
      changePercent: Math.round(change24 * 100) / 100,
      dayHigh: md.high_24h?.usd ?? price,
      dayLow: md.low_24h?.usd ?? price,
      volume: md.total_volume?.usd ?? 0,
      marketCap: md.market_cap?.usd ?? 0,
      name: data.name ?? symbol,
      symbol: (data.symbol ?? symbol).toUpperCase(),
      sector: 'Cryptocurrency',
      industry: data.categories?.[0] ?? 'Cryptocurrency',
      week52High: md.high_24h?.usd ? null : null, // CoinGecko doesn't directly give 52w
      week52Low: null,
      allTimeHigh: md.ath?.usd ?? null,
      allTimeHighDate: md.ath_date?.usd ?? null,
      circulatingSupply: md.circulating_supply ?? null,
      totalSupply: md.total_supply ?? null,
    };
  } catch {
    return null;
  }
}
