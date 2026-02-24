'use client';

import * as React from 'react';
import {
  Eye,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalHeader, ModalTitle, ModalFooter } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatPercent, cn, getChangeColor, formatVolume, formatMarketCap } from '@/lib/utils';
import { useQuoteStore } from '@/stores/quote-store';
import { useStockDetail } from '@/contexts/stock-detail-context';

interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  notes: string | null;
  added_at: string;
}

interface SparklineData {
  price: number;
}

type SortKey = 'symbol' | 'price' | 'change' | 'added';
type SortDir = 'asc' | 'desc';

export default function WatchlistPage() {
  const { openStockDetail } = useStockDetail();
  const [items, setItems] = React.useState<WatchlistItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [addSymbol, setAddSymbol] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState<string | null>(null);
  const { startPolling, stopPolling } = useQuoteStore();
  const quotes = useQuoteStore((s) => s.quotes);
  const [searchResults, setSearchResults] = React.useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sparklines, setSparklines] = React.useState<Record<string, SparklineData[]>>({});
  const [sortKey, setSortKey] = React.useState<SortKey>('added');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [filterText, setFilterText] = React.useState('');

  React.useEffect(() => {
    loadWatchlist();
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  React.useEffect(() => {
    if (items.length === 0) return;
    const symbols = [...new Set(items.map((i) => i.symbol))];
    startPolling(symbols);
    fetchSparklines(symbols);
    return () => stopPolling();
  }, [items, startPolling, stopPolling]);

  async function fetchSparklines(symbols: string[]) {
    const results: Record<string, SparklineData[]> = {};
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(`/api/stocks/chart?symbol=${encodeURIComponent(sym)}&range=1M`);
          if (res.ok) {
            const data = await res.json();
            results[sym] = (data.data || []).map((d: any) => ({ price: d.price }));
          }
        } catch { /* ignore */ }
      })
    );
    setSparklines(results);
  }

  async function loadWatchlist() {
    const supabase = createClient();
    const { data } = await supabase
      .from('watchlist')
      .select('*, asset:assets!asset_id(symbol, name, asset_type)')
      .order('added_at', { ascending: false });

    setItems(
      (data || []).map((w: any) => ({
        id: w.id,
        symbol: w.asset?.symbol || '',
        name: w.asset?.name || '',
        asset_type: w.asset?.asset_type || 'stock',
        notes: w.notes,
        added_at: w.added_at,
      }))
    );
    setLoading(false);
  }

  function handleSymbolChange(value: string) {
    setAddSymbol(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (data.results) {
          setSearchResults(data.results.map((r: any) => ({ symbol: r.symbol, name: r.name })));
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectSearchResult(symbol: string) {
    setAddSymbol(symbol);
    setSearchResults([]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addSymbol.trim()) return;
    setAdding(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: asset } = await supabase
      .from('assets')
      .upsert({
        symbol: addSymbol.toUpperCase(),
        name: addSymbol.toUpperCase(),
        asset_type: (await import('@/lib/services/crypto-data')).isKnownCryptoSymbol(addSymbol) ? ('crypto' as any) : ('stock' as any),
      }, { onConflict: 'symbol' })
      .select('id')
      .single();

    if (!asset) {
      toast('error', 'Failed to find asset');
      setAdding(false);
      return;
    }

    const { error } = await supabase.from('watchlist').insert({ user_id: user.id, asset_id: asset.id });
    if (error) {
      toast('error', error.message.includes('duplicate') ? 'Already on watchlist' : error.message);
    } else {
      toast('success', `${addSymbol.toUpperCase()} added to watchlist`);
      setShowAdd(false);
      setAddSymbol('');
      loadWatchlist();
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('watchlist').delete().eq('id', id);
    if (error) {
      toast('error', 'Failed to remove from watchlist');
      setShowDelete(null);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setShowDelete(null);
    toast('success', 'Removed from watchlist');
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  const sortedItems = React.useMemo(() => {
    let filtered = items;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      filtered = items.filter(
        (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'symbol':
          return dir * a.symbol.localeCompare(b.symbol);
        case 'price':
          return dir * ((quotes[a.symbol]?.price || 0) - (quotes[b.symbol]?.price || 0));
        case 'change':
          return dir * ((quotes[a.symbol]?.changePercent || 0) - (quotes[b.symbol]?.changePercent || 0));
        case 'added':
          return dir * (new Date(a.added_at).getTime() - new Date(b.added_at).getTime());
        default:
          return 0;
      }
    });
  }, [items, filterText, sortKey, sortDir, quotes]);

  // Summary stats
  const gainers = items.filter((i) => (quotes[i.symbol]?.changePercent ?? 0) > 0).length;
  const losers = items.filter((i) => (quotes[i.symbol]?.changePercent ?? 0) < 0).length;
  const avgChange = items.length > 0
    ? items.reduce((sum, i) => sum + (quotes[i.symbol]?.changePercent ?? 0), 0) / items.length
    : 0;

  function SortIconEl({ forKey }: { forKey: SortKey }) {
    if (sortKey !== forKey) return <ArrowUpDown className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Watchlist</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Tracking {items.length} symbol{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm"><Plus className="h-4 w-4" />Add Symbol</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Eye className="h-12 w-12" />}
          title="Watchlist empty"
          description="Add stocks, ETFs, or crypto to keep an eye on their performance."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Add Symbol</Button>}
        />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Tracking</p>
                <p className="text-xl font-bold text-white">{items.length}</p>
                <p className="text-xs text-zinc-500">symbols</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Gainers</p>
                <p className="text-xl font-bold text-emerald-400">{gainers}</p>
                <p className="text-xs text-zinc-500">today</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Losers</p>
                <p className="text-xl font-bold text-red-400">{losers}</p>
                <p className="text-xs text-zinc-500">today</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Avg Change</p>
                <p className={cn('text-xl font-bold', getChangeColor(avgChange))}>{formatPercent(avgChange)}</p>
                <p className="text-xs text-zinc-500">across watchlist</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter + Sort bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter symbols..."
                className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-500 mr-1">Sort:</span>
              {(['symbol', 'price', 'change', 'added'] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1',
                    sortKey === k
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  )}
                >
                  {k === 'symbol' ? 'Name' : k === 'change' ? 'Change' : k === 'price' ? 'Price' : 'Date'}
                  <SortIconEl forKey={k} />
                </button>
              ))}
            </div>
          </div>

          {/* Stock Table */}
          <Card className="bg-zinc-800/50 border-zinc-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Change</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider hidden md:table-cell">30D Trend</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider hidden lg:table-cell">Day Range</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider hidden lg:table-cell">Volume</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider hidden xl:table-cell">Mkt Cap</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {sortedItems.map((item) => {
                    const q = quotes[item.symbol];
                    const spark = sparklines[item.symbol] || [];
                    const sparkColor = q && q.change >= 0 ? '#10b981' : '#ef4444';
                    return (
                      <tr key={item.id} className="hover:bg-zinc-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => openStockDetail(item.symbol)} className="text-left group">
                            <div className="flex items-center gap-3">
                              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', item.asset_type === 'crypto' ? 'bg-amber-500/10' : 'bg-indigo-500/10')}>
                                <span className={cn('text-xs font-bold', item.asset_type === 'crypto' ? 'text-amber-400' : 'text-indigo-400')}>{item.asset_type === 'crypto' ? '₿' : item.symbol.slice(0, 2)}</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-zinc-100 group-hover:text-indigo-400 transition-colors">{item.symbol}</p>
                                  {item.asset_type === 'crypto' && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">Crypto</Badge>}
                                </div>
                                <p className="text-xs text-zinc-500 truncate max-w-[150px]">{item.name}</p>
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {q ? (
                            <span className="text-zinc-100 font-medium tabular-nums">{formatCurrency(q.price)}</span>
                          ) : (
                            <Skeleton className="h-4 w-16 ml-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {q ? (
                            <div>
                              <span className={cn('font-medium tabular-nums text-xs', getChangeColor(q.change))}>
                                {q.change >= 0 ? '+' : ''}{formatCurrency(q.change)}
                              </span>
                              <br />
                              <Badge variant={q.changePercent >= 0 ? 'success' : 'danger'} className="text-xs mt-0.5">
                                {formatPercent(q.changePercent)}
                              </Badge>
                            </div>
                          ) : (
                            <Skeleton className="h-4 w-16 ml-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {spark.length > 2 ? (
                            <div className="w-24 h-8 mx-auto">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={spark}>
                                  <defs>
                                    <linearGradient id={`spark-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                                      <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <Area type="monotone" dataKey="price" stroke={sparkColor} strokeWidth={1.5} fill={`url(#spark-${item.symbol})`} dot={false} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-center text-xs text-zinc-600">—</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          {q && q.dayLow > 0 ? (
                            <div>
                              <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                                <span>{formatCurrency(q.dayLow)}</span>
                                <span>{formatCurrency(q.dayHigh)}</span>
                              </div>
                              <div className="relative h-1 bg-zinc-700 rounded-full w-20 ml-auto">
                                {(() => {
                                  const range = q.dayHigh - q.dayLow;
                                  const pos = range > 0 ? ((q.price - q.dayLow) / range) * 100 : 50;
                                  return <div className="absolute h-1 bg-indigo-500 rounded-full" style={{ width: `${Math.min(pos, 100)}%` }} />;
                                })()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          {q ? (
                            <span className="text-xs text-zinc-400 tabular-nums">{formatVolume(q.volume)}</span>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden xl:table-cell">
                          {q && q.marketCap > 0 ? (
                            <span className="text-xs text-zinc-400 tabular-nums">{formatMarketCap(q.marketCap)}</span>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowDelete(item.id); }}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No symbols match your filter</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <ModalHeader><ModalTitle>Add to Watchlist</ModalTitle></ModalHeader>
        <form onSubmit={handleAdd}>
          <div className="relative">
            <Input label="Symbol" placeholder="AAPL, TSLA, BTC..." value={addSymbol} onChange={(e) => handleSymbolChange(e.target.value)} required autoComplete="off" />
            {searchResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg">
                {searchResults.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                    onClick={() => selectSearchResult(r.symbol)}
                  >
                    <span className="text-sm font-medium text-zinc-100">{r.symbol}</span>
                    <span className="text-xs text-zinc-500 truncate ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
            {searching && addSymbol.trim().length >= 1 && searchResults.length === 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
                <span className="text-xs text-zinc-500">Searching...</span>
              </div>
            )}
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={adding}>Add</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)}>
        <ModalHeader><ModalTitle>Remove from Watchlist</ModalTitle></ModalHeader>
        <p className="text-sm text-zinc-400 px-6 pb-4">Are you sure you want to remove this item from your watchlist?</p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => showDelete && handleRemove(showDelete)}>Remove</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}


