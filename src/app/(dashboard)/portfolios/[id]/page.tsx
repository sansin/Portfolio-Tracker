'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Briefcase, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatPercent, formatDate, cn, getChangeColor, formatQuantity } from '@/lib/utils';
import { useQuoteStore, isMarketOpen, formatRelativeTime } from '@/stores/quote-store';
import { ROUTES } from '@/lib/constants';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import TrendChart from '@/components/charts/TrendChart';
import { useStockDetail } from '@/contexts/stock-detail-context';

interface Holding {
  assetId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  currentPrice: number;
  totalValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

interface PortfolioDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  holdings: Holding[];
  transactions: any[];
  totalValue: number;
  totalCost: number;
}

export default function PortfolioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { openStockDetail } = useStockDetail();
  const portfolioId = params.id as string;
  const { fetchQuotes, startPolling, stopPolling, lastUpdated, loading: quotesLoading } = useQuoteStore();
  const quotes = useQuoteStore((s) => s.quotes);

  const [portfolio, setPortfolio] = React.useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('holdings');
  const [showAddTx, setShowAddTx] = React.useState(false);
  const [addingTx, setAddingTx] = React.useState(false);
  const holdingsRef = React.useRef<Holding[]>([]);
  const [txForm, setTxForm] = React.useState({
    symbol: '',
    transaction_type: 'buy',
    quantity: '',
    price_per_unit: '',
    fees: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Edit transaction state
  const [editingTx, setEditingTx] = React.useState<any>(null);
  const [editForm, setEditForm] = React.useState({
    transaction_type: 'buy',
    quantity: '',
    price_per_unit: '',
    fees: '',
    transaction_date: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Delete confirmation state
  const [deletingTxId, setDeletingTxId] = React.useState<string | null>(null);
  const [deletingTx, setDeletingTx] = React.useState(false);

  React.useEffect(() => {
    loadPortfolio();
    return () => { stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  // Re-compute holdings when quotes update
  React.useEffect(() => {
    if (holdingsRef.current.length > 0 && Object.keys(quotes).length > 0) {
      const updatedHoldings = holdingsRef.current.map((h) => {
        const q = quotes[h.symbol];
        if (q) {
          const currentPrice = q.price;
          const totalValue = h.quantity * currentPrice;
          const unrealizedPL = totalValue - h.totalCost;
          return {
            ...h,
            currentPrice,
            totalValue,
            unrealizedPL,
            unrealizedPLPercent: h.totalCost > 0 ? (unrealizedPL / h.totalCost) * 100 : 0,
          };
        }
        return h;
      });

      setPortfolio((prev) => prev ? {
        ...prev,
        holdings: updatedHoldings,
        totalValue: updatedHoldings.reduce((s, h) => s + h.totalValue, 0),
      } : prev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);

  async function loadPortfolio() {
    setLoading(true);
    const supabase = createClient();

    const [portfolioRes, transactionsRes] = await Promise.all([
      supabase.from('portfolios').select('*').eq('id', portfolioId).single(),
      supabase.from('transactions').select('*, asset:assets!asset_id(id, symbol, name, asset_type)').eq('portfolio_id', portfolioId).order('transaction_date', { ascending: false }),
    ]);

    if (portfolioRes.error || !portfolioRes.data) {
      router.push(ROUTES.PORTFOLIOS);
      return;
    }

    const p = portfolioRes.data;
    const txs = transactionsRes.data || [];

    const holdingsMap = new Map<string, Holding>();
    txs.forEach((t: any) => {
      const existing = holdingsMap.get(t.asset_id) || {
        assetId: t.asset_id,
        symbol: t.asset?.symbol || '',
        name: t.asset?.name || '',
        quantity: 0,
        avgCost: 0,
        totalCost: 0,
        currentPrice: 0,
        totalValue: 0,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
      };

      if (t.transaction_type === 'buy' || t.transaction_type === 'transfer_in') {
        const txFees = Number(t.fees || 0);
        const txCost = Number(t.price_per_unit) * Number(t.quantity) + txFees;
        const newTotalCost = existing.totalCost + txCost;
        const newQuantity = existing.quantity + Number(t.quantity);
        existing.quantity = newQuantity;
        existing.totalCost = newTotalCost;
        existing.avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
      } else if (t.transaction_type === 'sell' || t.transaction_type === 'transfer_out') {
        existing.quantity -= Number(t.quantity);
        existing.totalCost -= existing.avgCost * Number(t.quantity);
      }

      holdingsMap.set(t.asset_id, existing);
    });

    const holdings = Array.from(holdingsMap.values()).filter((h) => h.quantity > 0);

    // Fetch live quotes for all holding symbols
    const uniqueSymbols = [...new Set(holdings.map((h) => h.symbol).filter(Boolean))];

    if (uniqueSymbols.length > 0) {
      const liveQuotes = await fetchQuotes(uniqueSymbols);

      holdings.forEach((h) => {
        const q = liveQuotes[h.symbol];
        h.currentPrice = q ? q.price : h.avgCost;
        h.totalValue = h.quantity * h.currentPrice;
        h.unrealizedPL = h.totalValue - h.totalCost;
        h.unrealizedPLPercent = h.totalCost > 0 ? (h.unrealizedPL / h.totalCost) * 100 : 0;
      });

      // Start polling for live updates
      startPolling(uniqueSymbols);
    } else {
      holdings.forEach((h) => {
        h.currentPrice = h.avgCost;
        h.totalValue = h.quantity * h.currentPrice;
        h.unrealizedPL = h.totalValue - h.totalCost;
        h.unrealizedPLPercent = h.totalCost > 0 ? (h.unrealizedPL / h.totalCost) * 100 : 0;
      });
    }

    holdingsRef.current = holdings;

    setPortfolio({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color || '#6366f1',
      holdings,
      transactions: txs,
      totalValue: holdings.reduce((s, h) => s + h.totalValue, 0),
      totalCost: holdings.reduce((s, h) => s + h.totalCost, 0),
    });
    setLoading(false);
  }

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    setAddingTx(true);
    const supabase = createClient();

    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .upsert({ symbol: txForm.symbol.toUpperCase(), name: txForm.symbol.toUpperCase(), asset_type: 'stock' as any }, { onConflict: 'symbol' })
      .select('id')
      .single();

    if (assetError || !asset) {
      toast('error', 'Failed to find asset');
      setAddingTx(false);
      return;
    }

    const qty = parseFloat(txForm.quantity);
    const price = parseFloat(txForm.price_per_unit);
    const fees = parseFloat(txForm.fees || '0');
    const totalAmount = qty * price + fees;

    const { error } = await supabase.from('transactions').insert({
      portfolio_id: portfolioId,
      asset_id: asset.id,
      transaction_type: txForm.transaction_type as any,
      quantity: qty,
      price_per_unit: price,
      total_amount: totalAmount,
      fees,
      transaction_date: txForm.transaction_date,
      notes: txForm.notes || null,
      broker_source: 'manual' as any,
    });

    if (error) {
      toast('error', 'Failed to add transaction', error.message);
    } else {
      toast('success', 'Transaction added');
      setShowAddTx(false);
      setTxForm({ symbol: '', transaction_type: 'buy', quantity: '', price_per_unit: '', fees: '', transaction_date: new Date().toISOString().split('T')[0], notes: '' });
      loadPortfolio();
    }
    setAddingTx(false);
  }

  function openEditModal(t: any) {
    setEditingTx(t);
    setEditForm({
      transaction_type: t.transaction_type,
      quantity: String(Number(t.quantity)),
      price_per_unit: String(Number(t.price_per_unit)),
      fees: String(Number(t.fees || 0)),
      transaction_date: t.transaction_date,
      notes: t.notes || '',
    });
  }

  async function handleEditTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    setSavingEdit(true);
    const supabase = createClient();

    const qty = parseFloat(editForm.quantity);
    const price = parseFloat(editForm.price_per_unit);
    const fees = parseFloat(editForm.fees || '0');
    const totalAmount = qty * price + fees;

    const { error } = await supabase
      .from('transactions')
      .update({
        transaction_type: editForm.transaction_type as any,
        quantity: qty,
        price_per_unit: price,
        total_amount: totalAmount,
        fees,
        transaction_date: editForm.transaction_date,
        notes: editForm.notes || null,
      })
      .eq('id', editingTx.id);

    if (error) {
      toast('error', 'Failed to update transaction', error.message);
    } else {
      toast('success', 'Transaction updated');
      setEditingTx(null);
      loadPortfolio();
    }
    setSavingEdit(false);
  }

  async function handleDeleteTransaction() {
    if (!deletingTxId) return;
    setDeletingTx(true);
    const supabase = createClient();

    const { error } = await supabase.from('transactions').delete().eq('id', deletingTxId);

    if (error) {
      toast('error', 'Failed to delete transaction', error.message);
    } else {
      toast('success', 'Transaction deleted');
      setDeletingTxId(null);
      loadPortfolio();
    }
    setDeletingTx(false);
  }

  const trendSymbols = React.useMemo(
    () => portfolio?.holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity })) || [],
    [portfolio?.holdings]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!portfolio) return null;

  const totalPL = portfolio.totalValue - portfolio.totalCost;
  const totalPLPercent = portfolio.totalCost > 0 ? (totalPL / portfolio.totalCost) * 100 : 0;
  const marketOpen = isMarketOpen();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(ROUTES.PORTFOLIOS)} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: portfolio.color }} />
              <h1 className="text-2xl font-bold text-zinc-100">{portfolio.name}</h1>
              {portfolio.holdings.length > 0 && (
                <LiveBadge lastUpdated={lastUpdated} marketOpen={marketOpen} />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {portfolio.description && <p className="text-sm text-zinc-500">{portfolio.description}</p>}
              {lastUpdated && (
                <span className="text-xs text-zinc-600">· Updated {formatRelativeTime(lastUpdated)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { loadPortfolio(); }}
            disabled={quotesLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn('h-4 w-4', quotesLoading && 'animate-spin')} />
          </Button>
          <Button onClick={() => setShowAddTx(true)}><Plus className="h-4 w-4" />Add Transaction</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-5"><p className="text-sm text-zinc-400 mb-1">Total Value</p><p className="text-2xl font-bold text-zinc-100 tabular-nums">{formatCurrency(portfolio.totalValue)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-zinc-400 mb-1">Total Cost</p><p className="text-2xl font-bold text-zinc-100 tabular-nums">{formatCurrency(portfolio.totalCost)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-zinc-400 mb-1">Unrealized P&L</p><p className={cn('text-2xl font-bold tabular-nums', getChangeColor(totalPL))}>{formatCurrency(totalPL)} <span className="text-base">({formatPercent(totalPLPercent)})</span></p></CardContent></Card>
      </div>

      <Tabs
        tabs={[
          { id: 'holdings', label: 'Holdings', icon: <Briefcase className="h-4 w-4" /> },
          { id: 'transactions', label: 'Transactions', icon: <ArrowUpRight className="h-4 w-4" /> },
          { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'holdings' && (
        <Card>
          <CardContent className="p-0">
            {portfolio.holdings.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-12 w-12" />} title="No holdings" description="Add a transaction to see your holdings here." action={<Button onClick={() => setShowAddTx(true)} size="sm"><Plus className="h-4 w-4" />Add Transaction</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Asset</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Shares</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Avg Cost</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Price</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Value</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((h) => (
                      <tr key={h.assetId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4"><button onClick={() => openStockDetail(h.symbol)} className="text-left group"><p className="font-medium text-zinc-100 group-hover:text-indigo-400 transition-colors">{h.symbol}</p><p className="text-xs text-zinc-500">{h.name}</p></button></td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatQuantity(h.quantity)}</td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatCurrency(h.avgCost)}</td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatCurrency(h.currentPrice)}</td>
                        <td className="text-right px-6 py-4 text-sm font-medium text-zinc-100 tabular-nums">{formatCurrency(h.totalValue)}</td>
                        <td className="text-right px-6 py-4">
                          <p className={cn('text-sm font-medium tabular-nums', getChangeColor(h.unrealizedPL))}>{formatCurrency(h.unrealizedPL)}</p>
                          <p className={cn('text-xs tabular-nums', getChangeColor(h.unrealizedPL))}>{formatPercent(h.unrealizedPLPercent)}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card>
          <CardContent className="p-0">
            {portfolio.transactions.length === 0 ? (
              <EmptyState icon={<ArrowUpRight className="h-12 w-12" />} title="No transactions" description="Record your first trade to see it here." action={<Button onClick={() => setShowAddTx(true)} size="sm"><Plus className="h-4 w-4" />Add Transaction</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Asset</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Qty</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Price</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Total</th>
                      <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.transactions.map((t: any) => (
                      <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-400">{formatDate(t.transaction_date)}</td>
                        <td className="px-6 py-4">
                          <Badge variant={t.transaction_type === 'buy' || t.transaction_type === 'transfer_in' ? 'success' : t.transaction_type === 'sell' || t.transaction_type === 'transfer_out' ? 'danger' : 'info'}>
                            {t.transaction_type.replaceAll('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4"><button onClick={() => t.asset?.symbol && openStockDetail(t.asset.symbol)} className="text-sm font-medium text-zinc-100 hover:text-indigo-400 transition-colors">{t.asset?.symbol}</button></td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatQuantity(Number(t.quantity))}</td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatCurrency(Number(t.price_per_unit))}</td>
                        <td className="text-right px-6 py-4 text-sm font-medium text-zinc-100 tabular-nums">{formatCurrency(Number(t.total_amount))}</td>
                        <td className="text-right px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(t)}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                              title="Edit transaction"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingTxId(t.id)}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                              title="Delete transaction"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'analytics' && (
        portfolio.holdings.length > 0 ? (
          <ErrorBoundary>
            <TrendChart
              symbols={trendSymbols}
              title={`${portfolio.name} Performance`}
            />
          </ErrorBoundary>
        ) : (
          <Card><CardContent className="py-16"><EmptyState icon={<BarChart3 className="h-12 w-12" />} title="No holdings to chart" description="Add transactions to see portfolio performance trends." /></CardContent></Card>
        )
      )}

      <Modal open={showAddTx} onClose={() => setShowAddTx(false)} className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Add Transaction</ModalTitle>
          <ModalDescription>Record a new trade for {portfolio.name}.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleAddTransaction}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Symbol" placeholder="AAPL" value={txForm.symbol} onChange={(e) => setTxForm({ ...txForm, symbol: e.target.value })} onBlur={async () => {
                const sym = txForm.symbol.trim().toUpperCase();
                if (sym && !txForm.price_per_unit) {
                  try {
                    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(sym)}`);
                    const data = await res.json();
                    const price = data.quotes?.[sym]?.price;
                    if (price) setTxForm((prev) => ({ ...prev, price_per_unit: String(price) }));
                  } catch { /* ignore */ }
                }
              }} required />
              <Select label="Type" name="transaction_type" value={txForm.transaction_type} onChange={(e) => setTxForm({ ...txForm, transaction_type: e.target.value })} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }, { value: 'dividend', label: 'Dividend' }, { value: 'transfer_in', label: 'Transfer In' }, { value: 'transfer_out', label: 'Transfer Out' }]} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" type="number" step="any" placeholder="100" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: e.target.value })} required />
              <Input label="Price per unit" type="number" step="any" placeholder="150.00 (auto-fills)" value={txForm.price_per_unit} onChange={(e) => setTxForm({ ...txForm, price_per_unit: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Fees" type="number" step="any" placeholder="0.00" value={txForm.fees} onChange={(e) => setTxForm({ ...txForm, fees: e.target.value })} />
              <Input label="Date" type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} required />
            </div>
            <Input label="Notes (optional)" placeholder="Any notes about this trade..." value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setShowAddTx(false)}>Cancel</Button>
            <Button type="submit" loading={addingTx}>Add Transaction</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal open={!!editingTx} onClose={() => setEditingTx(null)} className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Edit Transaction</ModalTitle>
          <ModalDescription>Update the details for this transaction.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleEditTransaction}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Symbol" value={editingTx?.asset?.symbol || 'N/A'} disabled />
              <Select
                label="Type"
                value={editForm.transaction_type}
                onChange={(e) => setEditForm({ ...editForm, transaction_type: e.target.value })}
                options={[
                  { value: 'buy', label: 'Buy' },
                  { value: 'sell', label: 'Sell' },
                  { value: 'dividend', label: 'Dividend' },
                  { value: 'transfer_in', label: 'Transfer In' },
                  { value: 'transfer_out', label: 'Transfer Out' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" type="number" step="any" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} required />
              <Input label="Price per unit" type="number" step="any" value={editForm.price_per_unit} onChange={(e) => setEditForm({ ...editForm, price_per_unit: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Fees" type="number" step="any" value={editForm.fees} onChange={(e) => setEditForm({ ...editForm, fees: e.target.value })} />
              <Input label="Date" type="date" value={editForm.transaction_date} onChange={(e) => setEditForm({ ...editForm, transaction_date: e.target.value })} required />
            </div>
            <Input label="Notes (optional)" placeholder="Any notes about this trade..." value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button type="submit" loading={savingEdit}>Save Changes</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deletingTxId} onClose={() => setDeletingTxId(null)}>
        <ModalHeader>
          <ModalTitle>Delete Transaction</ModalTitle>
          <ModalDescription>Are you sure you want to delete this transaction? This action cannot be undone.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeletingTxId(null)}>Cancel</Button>
          <Button variant="destructive" loading={deletingTx} onClick={handleDeleteTransaction}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function LiveBadge({ lastUpdated, marketOpen }: { lastUpdated: number | null; marketOpen: boolean }) {
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!marketOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
        Closed
      </span>
    );
  }

  const isStale = !lastUpdated || now - lastUpdated > 60_000;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full',
      isStale ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'
    )}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        isStale ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
      )} />
      {isStale ? 'Stale' : 'Live'}
    </span>
  );
}
