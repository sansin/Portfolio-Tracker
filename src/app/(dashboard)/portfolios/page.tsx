'use client';

import * as React from 'react';
import { Plus, Briefcase, Pencil, Trash2, Check, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatCurrencyWhole, formatPercent, formatPercentWhole, cn, getChangeColor } from '@/lib/utils';
import { PORTFOLIO_COLORS } from '@/lib/constants';
import { buildHoldingsFromTransactions, computePortfolioValues, getUniqueSymbols, ComputedHolding } from '@/lib/holdings';
import { useStockDetail } from '@/contexts/stock-detail-context';

interface HoldingDetail {
  symbol: string;
  name: string;
  portfolioId: string;
  portfolioName: string;
  portfolioColor: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  currentPrice: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

type SortField = 'symbol' | 'portfolioName' | 'quantity' | 'marketValue' | 'gain' | 'gainPercent' | 'dayChangePercent';
type SortDir = 'asc' | 'desc';

function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: SortDir }) {
  if (field !== active) return <ArrowUpDown className="w-3.5 h-3.5 text-zinc-600" />;
  return dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />;
}

export default function PortfoliosPage() {
  const { portfolios, fetchPortfolios, createPortfolio, updatePortfolio, deletePortfolio, loading } = usePortfolioStore();
  const { openStockDetail } = useStockDetail();
  const [showCreate, setShowCreate] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<string | null>(null);
  const [editingPortfolio, setEditingPortfolio] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [holdingDetails, setHoldingDetails] = React.useState<HoldingDetail[]>([]);
  const [dataLoading, setDataLoading] = React.useState(true);
  const [selectedPortfolios, setSelectedPortfolios] = React.useState<Set<string>>(new Set());
  const [sortField, setSortField] = React.useState<SortField>('marketValue');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [searchTerm, setSearchTerm] = React.useState('');

  const [form, setForm] = React.useState({
    name: '',
    description: '',
    color: PORTFOLIO_COLORS[0] as string,
  });
  const [editForm, setEditForm] = React.useState({
    name: '',
    description: '',
    color: PORTFOLIO_COLORS[0] as string,
  });

  React.useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  // Select all portfolios by default when portfolios load
  React.useEffect(() => {
    if (portfolios.length > 0) {
      setSelectedPortfolios(new Set(portfolios.map((p) => p.id)));
      loadHoldingDetails();
    } else if (!loading) {
      setDataLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios]);

  async function loadHoldingDetails() {
    setDataLoading(true);
    const supabase = createClient();
    const portfolioIds = portfolios.map((p) => p.id);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*, asset:assets!asset_id(symbol, name)')
      .in('portfolio_id', portfolioIds);

    if (!transactions?.length) {
      setHoldingDetails([]);
      setDataLoading(false);
      return;
    }

    const allHoldings = buildHoldingsFromTransactions(transactions);
    const uniqueSymbols = getUniqueSymbols(allHoldings);

    let quotes: Record<string, any> = {};
    if (uniqueSymbols.length > 0) {
      try {
        const res = await fetch(`/api/stocks/quote?symbols=${uniqueSymbols.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          quotes = data.quotes || {};
        }
      } catch { /* fallback to cost basis */ }
    }

    const details: HoldingDetail[] = allHoldings.map((h) => {
      const portfolio = portfolios.find((p) => p.id === h.portfolioId);
      const quote = quotes[h.symbol];
      const currentPrice = quote?.price || h.avgCost;
      const marketValue = currentPrice * h.quantity;
      const gain = marketValue - h.totalCost;
      const gainPercent = h.totalCost > 0 ? (gain / h.totalCost) * 100 : 0;
      const dayChange = quote ? (quote.price - quote.previousClose) * h.quantity : 0;
      const dayChangePercent = quote?.changePercent ?? 0;

      return {
        symbol: h.symbol,
        name: h.name,
        portfolioId: h.portfolioId,
        portfolioName: portfolio?.name || 'Unknown',
        portfolioColor: portfolio?.color || PORTFOLIO_COLORS[0],
        quantity: h.quantity,
        avgCost: h.avgCost,
        totalCost: h.totalCost,
        currentPrice,
        marketValue,
        gain,
        gainPercent,
        dayChange,
        dayChangePercent,
      };
    });

    setHoldingDetails(details);
    setDataLoading(false);
  }

  const togglePortfolio = React.useCallback((pid: string) => {
    setSelectedPortfolios((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  }, []);

  const selectAll = React.useCallback(() => {
    setSelectedPortfolios(new Set(portfolios.map((p) => p.id)));
  }, [portfolios]);

  const toggleSort = React.useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const filteredHoldings = React.useMemo(() => {
    let rows = holdingDetails.filter((h) => selectedPortfolios.has(h.portfolioId));
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(
        (h) => h.symbol.toLowerCase().includes(term) || h.name.toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
    return rows;
  }, [holdingDetails, selectedPortfolios, searchTerm, sortField, sortDir]);

  // Portfolio summary KPIs for selected portfolios
  const summary = React.useMemo(() => {
    const selected = holdingDetails.filter((h) => selectedPortfolios.has(h.portfolioId));
    const totalValue = selected.reduce((s, h) => s + h.marketValue, 0);
    const totalCost = selected.reduce((s, h) => s + h.totalCost, 0);
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const dayChange = selected.reduce((s, h) => s + h.dayChange, 0);
    return { totalValue, totalCost, totalGain, totalGainPct, dayChange, count: selected.length };
  }, [holdingDetails, selectedPortfolios]);

  function openEditModal(portfolioId: string) {
    const p = portfolios.find((x) => x.id === portfolioId);
    if (!p) return;
    setEditForm({
      name: p.name,
      description: p.description || '',
      color: p.color || PORTFOLIO_COLORS[0],
    });
    setEditingPortfolio(portfolioId);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPortfolio || !editForm.name.trim()) return;
    setSaving(true);
    await updatePortfolio(editingPortfolio, {
      name: editForm.name,
      description: editForm.description || null,
      color: editForm.color,
    });
    toast('success', 'Portfolio updated');
    setEditingPortfolio(null);
    setSaving(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    const result = await createPortfolio({
      name: form.name,
      description: form.description || null,
      color: form.color,
      is_default: portfolios.length === 0,
    });
    if (result) {
      toast('success', 'Portfolio created', `${form.name} is ready to go.`);
      setShowCreate(false);
      setForm({ name: '', description: '', color: PORTFOLIO_COLORS[0] });
    } else {
      toast('error', 'Failed to create portfolio');
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await deletePortfolio(id);
    toast('success', 'Portfolio deleted');
    setShowDeleteConfirm(null);
    setDeleting(false);
  }

  if (loading && portfolios.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-zinc-100">Portfolios</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New Portfolio</Button>
      </div>

      {portfolios.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title="No portfolios yet"
          description="Create your first portfolio to start tracking investments."
          action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Create Portfolio</Button>}
        />
      ) : (
        <>
          {/* Portfolio Filter Pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={selectAll}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                selectedPortfolios.size === portfolios.length
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
              )}
            >
              All
            </button>
            {portfolios.map((p) => {
              const isSelected = selectedPortfolios.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePortfolio(p.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    isSelected
                      ? 'border-opacity-40 text-white'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
                  )}
                  style={isSelected ? { backgroundColor: `${p.color || PORTFOLIO_COLORS[0]}20`, borderColor: `${p.color || PORTFOLIO_COLORS[0]}60` } : undefined}
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || PORTFOLIO_COLORS[0], opacity: isSelected ? 1 : 0.4 }} />
                  {p.name}
                  {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  {/* Edit/Delete inline */}
                  <span className="ml-1 flex gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(p.id); }} className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors" title="Edit"><Pencil className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(p.id); }} className="p-0.5 rounded text-zinc-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 className="w-3 h-3" /></button>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Total Value</p>
                <p className="text-xl font-bold text-white tabular-nums">{formatCurrencyWhole(summary.totalValue)}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Cost: {formatCurrencyWhole(summary.totalCost)}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Total P&L</p>
                <p className={cn('text-xl font-bold tabular-nums', getChangeColor(summary.totalGain))}>{formatCurrencyWhole(summary.totalGain)}</p>
                <p className={cn('text-xs mt-0.5', getChangeColor(summary.totalGainPct))}>{formatPercentWhole(summary.totalGainPct)}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Day Change</p>
                <p className={cn('text-xl font-bold tabular-nums', getChangeColor(summary.dayChange))}>{formatCurrencyWhole(summary.dayChange)}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-800/50 border-zinc-700/50">
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Holdings</p>
                <p className="text-xl font-bold text-white tabular-nums">{summary.count}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{selectedPortfolios.size} portfolio{selectedPortfolios.size !== 1 ? 's' : ''} selected</p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <input
              type="text"
              placeholder="Search holdings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-3 py-2 text-sm bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Holdings Table */}
          <Card className="bg-zinc-800/50 border-zinc-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              {dataLoading ? (
                <div className="p-8 text-center text-zinc-500">Loading holdings...</div>
              ) : filteredHoldings.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  {holdingDetails.length === 0 ? 'No holdings yet. Add transactions to your portfolios.' : 'No holdings match your filters.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700/50">
                      {([
                        { key: 'symbol' as SortField, label: 'Symbol', align: 'left' },
                        { key: 'portfolioName' as SortField, label: 'Portfolio', align: 'left' },
                        { key: 'quantity' as SortField, label: 'Qty', align: 'right' },
                        { key: 'marketValue' as SortField, label: 'Market Value', align: 'right' },
                        { key: 'gain' as SortField, label: 'P&L', align: 'right' },
                        { key: 'gainPercent' as SortField, label: 'P&L %', align: 'right' },
                        { key: 'dayChangePercent' as SortField, label: 'Day Chg', align: 'right' },
                      ]).map((col) => (
                        <th
                          key={col.key}
                          className={cn(
                            'px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200 transition-colors select-none',
                            col.align === 'right' ? 'text-right' : 'text-left'
                          )}
                          onClick={() => toggleSort(col.key)}
                        >
                          <div className={cn('flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                            {col.label}
                            <SortIcon field={col.key} active={sortField} dir={sortDir} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {filteredHoldings.map((h) => (
                      <tr key={`${h.portfolioId}-${h.symbol}`} className="hover:bg-zinc-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => openStockDetail(h.symbol)} className="text-left group">
                            <span className="text-white font-medium group-hover:text-indigo-400 transition-colors">{h.symbol}</span>
                            <p className="text-zinc-500 text-xs truncate max-w-[140px]">{h.name}</p>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: h.portfolioColor }} />
                            <span className="text-zinc-300 text-xs">{h.portfolioName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-zinc-300 tabular-nums">{h.quantity.toFixed(2)}</span>
                          <p className="text-zinc-500 text-xs">@ {formatCurrency(h.avgCost)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-white tabular-nums">{formatCurrency(h.marketValue)}</span>
                          <p className="text-zinc-500 text-xs">{formatCurrency(h.currentPrice)}/share</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-medium tabular-nums', getChangeColor(h.gain))}>
                            {formatCurrency(h.gain)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant={h.gainPercent >= 0 ? 'success' : 'danger'} className="text-xs">
                            {formatPercent(h.gainPercent)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-xs font-medium', getChangeColor(h.dayChangePercent))}>
                            {formatPercent(h.dayChangePercent)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Create Portfolio Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}>
        <ModalHeader>
          <ModalTitle>Create Portfolio</ModalTitle>
          <ModalDescription>Add a new portfolio to organize your investments.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleCreate}>
          <div className="space-y-4">
            <Input label="Portfolio name" placeholder="e.g., Long-term Growth" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Description (optional)" placeholder="Brief description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Color</label>
              <div className="flex gap-2">
                {PORTFOLIO_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setForm({ ...form, color })} className={cn('h-8 w-8 rounded-full transition-all', form.color === color ? 'ring-2 ring-offset-2 ring-offset-zinc-900' : 'hover:scale-110')} style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={creating}>Create</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Portfolio Modal */}
      <Modal open={!!editingPortfolio} onClose={() => setEditingPortfolio(null)}>
        <ModalHeader>
          <ModalTitle>Edit Portfolio</ModalTitle>
          <ModalDescription>Update your portfolio details.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleEdit}>
          <div className="space-y-4">
            <Input label="Portfolio name" placeholder="e.g., Long-term Growth" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            <Input label="Description (optional)" placeholder="Brief description..." value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Color</label>
              <div className="flex gap-2">
                {PORTFOLIO_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setEditForm({ ...editForm, color })} className={cn('h-8 w-8 rounded-full transition-all', editForm.color === color ? 'ring-2 ring-offset-2 ring-offset-zinc-900' : 'hover:scale-110')} style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setEditingPortfolio(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Changes</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)}>
        <ModalHeader>
          <ModalTitle>Delete Portfolio</ModalTitle>
          <ModalDescription>This will permanently delete this portfolio and all its transactions. This cannot be undone.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
          <Button variant="destructive" loading={deleting} onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}>Delete Portfolio</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
