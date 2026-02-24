'use client';

import * as React from 'react';
import { ArrowUpRight, ArrowDownRight, DollarSign, Filter, Search, Pencil, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { useTransactionStore } from '@/stores/transaction-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { formatCurrency, formatDate, cn, formatQuantity } from '@/lib/utils';
import { useStockDetail } from '@/contexts/stock-detail-context';
import { isCashTransaction, isOptionTransaction, optionAssetSymbol, formatOptionSymbol, parseOptionAssetSymbol } from '@/types';

export default function TransactionsPage() {
  const { openStockDetail } = useStockDetail();
  const { transactions, fetchTransactions, addTransaction, updateTransaction, deleteTransaction, loading, totalCount, page, setPage, filters, setFilters } = useTransactionStore();
  const { portfolios, fetchPortfolios } = usePortfolioStore();
  const [showFilters, setShowFilters] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  // Add Transaction modal state
  const [showAddTx, setShowAddTx] = React.useState(false);
  const [assetClass, setAssetClass] = React.useState<'stock' | 'option' | 'cash'>('stock');
  const [addForm, setAddForm] = React.useState({
    portfolio_id: '',
    symbol: '',
    transaction_type: 'buy',
    quantity: '',
    price_per_unit: '',
    fees: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: '',
    // Option fields
    underlying_symbol: '',
    option_type: 'call' as 'call' | 'put',
    strike_price: '',
    expiration_date: '',
  });
  const [addingSaving, setAddingSaving] = React.useState(false);

  // Edit modal state
  const [editingTx, setEditingTx] = React.useState<any>(null);
  const [editForm, setEditForm] = React.useState({
    portfolio_id: '',
    transaction_type: 'buy',
    quantity: '',
    price_per_unit: '',
    fees: '',
    transaction_date: '',
    notes: '',
  });
  const [saving, setSaving] = React.useState(false);

  // Delete confirmation state
  const [deletingTxId, setDeletingTxId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    fetchPortfolios();
    fetchTransactions();
  }, [fetchPortfolios, fetchTransactions]);

  React.useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const totalPages = Math.ceil(totalCount / 25);

  const filtered = React.useMemo(
    () => transactions.filter((t: any) =>
      !searchTerm ||
      t.asset?.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.asset?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [transactions, searchTerm]
  );

  function openEditModal(t: any) {
    setEditingTx(t);
    setEditForm({
      portfolio_id: t.portfolio_id || '',
      transaction_type: t.transaction_type,
      quantity: String(Number(t.quantity)),
      price_per_unit: String(Number(t.price_per_unit)),
      fees: String(Number(t.fees || 0)),
      transaction_date: t.transaction_date,
      notes: t.notes || '',
    });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    setSaving(true);

    const success = await updateTransaction(editingTx.id, {
      portfolio_id: editForm.portfolio_id || undefined,
      transaction_type: editForm.transaction_type,
      quantity: parseFloat(editForm.quantity),
      price_per_unit: parseFloat(editForm.price_per_unit),
      fees: parseFloat(editForm.fees || '0'),
      transaction_date: editForm.transaction_date,
      notes: editForm.notes || undefined,
    });

    if (success) {
      toast('success', 'Transaction updated');
      setEditingTx(null);
    } else {
      toast('error', 'Failed to update transaction');
    }
    setSaving(false);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.portfolio_id) return;
    const isCash = isCashTransaction(addForm.transaction_type);
    const isOpt = assetClass === 'option';
    if (!isCash && !isOpt && !addForm.symbol.trim()) return;
    if (isOpt && (!addForm.underlying_symbol.trim() || !addForm.strike_price || !addForm.expiration_date)) return;
    setAddingSaving(true);

    const amount = parseFloat(addForm.price_per_unit);

    // Build the payload
    const payload: any = {
      portfolio_id: addForm.portfolio_id,
      transaction_type: addForm.transaction_type,
      quantity: isCash ? 1 : parseFloat(addForm.quantity),
      price_per_unit: isCash ? Math.abs(amount) : amount,
      fees: addForm.fees ? parseFloat(addForm.fees) : undefined,
      transaction_date: addForm.transaction_date,
      notes: addForm.notes || undefined,
    };

    if (isCash) {
      payload.symbol = '$CASH';
      payload.total_amount = addForm.transaction_type === 'deposit' ? Math.abs(amount) : -Math.abs(amount);
    } else if (isOpt) {
      payload.symbol = optionAssetSymbol(
        addForm.underlying_symbol.toUpperCase(),
        addForm.option_type,
        parseFloat(addForm.strike_price),
        addForm.expiration_date,
      );
      payload.asset_type = 'option';
      payload.underlying_symbol = addForm.underlying_symbol.toUpperCase();
      payload.option_type = addForm.option_type;
      payload.strike_price = parseFloat(addForm.strike_price);
      payload.expiration_date = addForm.expiration_date;
    } else {
      payload.symbol = addForm.symbol.toUpperCase();
    }

    const success = await addTransaction(payload);

    if (success) {
      toast('success', 'Transaction added');
      setShowAddTx(false);
      setAssetClass('stock');
      setAddForm({
        portfolio_id: '',
        symbol: '',
        transaction_type: 'buy',
        quantity: '',
        price_per_unit: '',
        fees: '',
        transaction_date: new Date().toISOString().split('T')[0],
        notes: '',
        underlying_symbol: '',
        option_type: 'call',
        strike_price: '',
        expiration_date: '',
      });
      fetchTransactions();
    } else {
      toast('error', 'Failed to add transaction');
    }
    setAddingSaving(false);
  }

  async function handleDelete() {
    if (!deletingTxId) return;
    setDeleting(true);
    const success = await deleteTransaction(deletingTxId);
    if (success === false) {
      toast('error', 'Failed to delete transaction');
    } else {
      toast('success', 'Transaction deleted');
    }
    setDeletingTxId(null);
    setDeleting(false);
  }

  if (loading && transactions.length === 0) {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Transactions</h1>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by symbol or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
              aria-label="Search transactions"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowAddTx(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Transaction</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="animate-slide-up">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label="Portfolio"
                placeholder="All portfolios"
                value={filters.portfolioId || ''}
                onChange={(e) => setFilters({ portfolioId: e.target.value || undefined })}
                options={[
                  { value: '', label: 'All portfolios' },
                  ...portfolios.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Select
                label="Type"
                placeholder="All types"
                value={filters.type || ''}
                onChange={(e) => setFilters({ type: e.target.value || undefined })}
                options={[
                  { value: '', label: 'All types' },
                  { value: 'buy', label: 'Buy' },
                  { value: 'sell', label: 'Sell' },
                  { value: 'dividend', label: 'Dividend' },
                  { value: 'transfer_in', label: 'Transfer In' },
                  { value: 'transfer_out', label: 'Transfer Out' },
                  { value: 'deposit', label: 'Deposit' },
                  { value: 'withdrawal', label: 'Withdrawal' },
                  { value: 'margin_interest', label: 'Margin Interest' },
                  { value: 'option_exercise', label: 'Option Exercise' },
                  { value: 'option_assignment', label: 'Option Assignment' },
                  { value: 'option_expiration', label: 'Option Expiration' },
                ]}
              />
              <Input
                label="From"
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters({ dateFrom: e.target.value || undefined })}
              />
              <Input
                label="To"
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => setFilters({ dateTo: e.target.value || undefined })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ArrowUpRight className="h-12 w-12" />}
              title="No transactions found"
              description={searchTerm ? "No transactions match your search." : "Add transactions manually or import them from your broker."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Portfolio</th>
                      <th className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Type</th>
                      <th className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Asset</th>
                      <th className="text-right text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Qty</th>
                      <th className="text-right text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Price</th>
                      <th className="text-right text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Fees</th>
                      <th className="text-right text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Total</th>
                      <th className="text-right text-xs font-medium uppercase tracking-wide text-zinc-500 px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t: any) => (
                      <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-400">{formatDate(t.transaction_date)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.portfolio?.color || '#6366f1' }} />
                            <span className="text-sm text-zinc-300">{t.portfolio?.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={
                            t.transaction_type === 'buy' || t.transaction_type === 'transfer_in' || t.transaction_type === 'deposit' ? 'success'
                            : t.transaction_type === 'sell' || t.transaction_type === 'transfer_out' || t.transaction_type === 'withdrawal' || t.transaction_type === 'margin_interest' ? 'danger'
                            : t.transaction_type.startsWith('option_') ? 'warning'
                            : 'info'
                          }>
                            {t.transaction_type.replaceAll('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => t.asset?.symbol && openStockDetail(t.asset?.asset_type === 'option' ? (parseOptionAssetSymbol(t.asset.symbol)?.underlying || t.asset.symbol) : t.asset.symbol)}
                            className="text-sm font-medium text-zinc-100 hover:text-indigo-400 transition-colors cursor-pointer"
                          >
                            {t.asset?.asset_type === 'option' ? (t.asset.name || t.asset.symbol) : (t.asset?.symbol || 'N/A')}
                          </button>
                          {t.asset?.asset_type === 'option' && <Badge variant="warning" className="text-[10px] px-1.5 py-0 ml-1.5">Option</Badge>}
                        </td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatQuantity(Number(t.quantity))}</td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-300 tabular-nums">{formatCurrency(Number(t.price_per_unit))}</td>
                        <td className="text-right px-6 py-4 text-sm text-zinc-500 tabular-nums">{formatCurrency(Number(t.fees || 0))}</td>
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
                  <p className="text-sm text-zinc-500">
                    Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, totalCount)} of {totalCount}{searchTerm && ` (${filtered.length} matching)`}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Transaction Modal */}
      <Modal open={!!editingTx} onClose={() => setEditingTx(null)} className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Edit Transaction</ModalTitle>
          <ModalDescription>Update the details for this transaction.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleEditSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Symbol" value={editingTx?.asset?.symbol || 'N/A'} disabled />
              <Select
                label="Portfolio"
                value={editForm.portfolio_id}
                onChange={(e) => setEditForm({ ...editForm, portfolio_id: e.target.value })}
                options={portfolios.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  { value: 'deposit', label: 'Deposit' },
                  { value: 'withdrawal', label: 'Withdrawal' },
                  { value: 'margin_interest', label: 'Margin Interest' },
                  { value: 'option_exercise', label: 'Option Exercise' },
                  { value: 'option_assignment', label: 'Option Assignment' },
                  { value: 'option_expiration', label: 'Option Expiration' },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isCashTransaction(editForm.transaction_type) ? (
                <Input label="Amount (USD)" type="number" step="any" value={editForm.price_per_unit} onChange={(e) => setEditForm({ ...editForm, price_per_unit: e.target.value })} required />
              ) : (
                <>
                  <Input label="Quantity" type="number" step="any" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} required />
                  <Input label="Price per unit" type="number" step="any" value={editForm.price_per_unit} onChange={(e) => setEditForm({ ...editForm, price_per_unit: e.target.value })} required />
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Fees" type="number" step="any" value={editForm.fees} onChange={(e) => setEditForm({ ...editForm, fees: e.target.value })} />
              <Input label="Date" type="date" value={editForm.transaction_date} onChange={(e) => setEditForm({ ...editForm, transaction_date: e.target.value })} required />
            </div>
            <Input label="Notes (optional)" placeholder="Any notes about this trade..." value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Changes</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Add Transaction Modal */}
      <Modal open={showAddTx} onClose={() => setShowAddTx(false)} className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Add Transaction</ModalTitle>
          <ModalDescription>Add a new transaction to one of your portfolios.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleAddSubmit}>
          <div className="space-y-4">
            {/* Asset class toggle */}
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider mb-1.5 block">Asset Class</label>
              <div className="flex gap-2">
                {(['stock', 'option', 'cash'] as const).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => {
                      setAssetClass(cls);
                      if (cls === 'cash') {
                        setAddForm((f) => ({ ...f, transaction_type: 'deposit', symbol: '$CASH', quantity: '1' }));
                      } else if (cls === 'option') {
                        setAddForm((f) => ({ ...f, transaction_type: 'buy', symbol: '' }));
                      } else {
                        setAddForm((f) => ({ ...f, transaction_type: 'buy', symbol: f.symbol === '$CASH' ? '' : f.symbol }));
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
                      assetClass === cls
                        ? cls === 'option' ? 'bg-purple-600/20 text-purple-400 border-purple-500/30' : cls === 'cash' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                        : 'text-zinc-400 border-zinc-700/50 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    {cls === 'stock' ? 'Stock / ETF / Crypto' : cls === 'option' ? 'Option' : 'Cash'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Portfolio"
                value={addForm.portfolio_id}
                onChange={(e) => setAddForm({ ...addForm, portfolio_id: e.target.value })}
                options={[
                  { value: '', label: 'Select portfolio' },
                  ...portfolios.map((p) => ({ value: p.id, label: p.name })),
                ]}
                required
              />
              {assetClass === 'option' ? (
                <Input label="Underlying Symbol" placeholder="AAPL" value={addForm.underlying_symbol} onChange={(e) => setAddForm({ ...addForm, underlying_symbol: e.target.value })} required />
              ) : (
                <Input label="Symbol" placeholder="AAPL" value={addForm.symbol} onChange={(e) => setAddForm({ ...addForm, symbol: e.target.value })} onBlur={async () => {
                  const sym = addForm.symbol.trim().toUpperCase();
                  if (sym && !addForm.price_per_unit) {
                    try {
                      const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(sym)}`);
                      const data = await res.json();
                      const price = data.quotes?.[sym]?.price;
                      if (price) setAddForm((prev) => ({ ...prev, price_per_unit: String(price) }));
                    } catch { /* ignore */ }
                  }
                }} required={assetClass !== 'cash'} disabled={assetClass === 'cash'} />
              )}
            </div>

            {/* Option contract details */}
            {assetClass === 'option' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-purple-500/5 border border-purple-500/10 rounded-lg">
                <Select
                  label="Type"
                  value={addForm.option_type}
                  onChange={(e) => setAddForm({ ...addForm, option_type: e.target.value as 'call' | 'put' })}
                  options={[
                    { value: 'call', label: 'Call' },
                    { value: 'put', label: 'Put' },
                  ]}
                />
                <Input label="Strike" type="number" step="any" placeholder="250" value={addForm.strike_price} onChange={(e) => setAddForm({ ...addForm, strike_price: e.target.value })} required />
                <Input label="Expiration" type="date" value={addForm.expiration_date} onChange={(e) => setAddForm({ ...addForm, expiration_date: e.target.value })} required />
                <div className="flex items-end">
                  <p className="text-xs text-zinc-500 pb-2">
                    {addForm.underlying_symbol && addForm.strike_price && addForm.expiration_date
                      ? formatOptionSymbol(addForm.underlying_symbol.toUpperCase(), addForm.option_type, parseFloat(addForm.strike_price), addForm.expiration_date)
                      : 'Preview'}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Transaction"
                value={addForm.transaction_type}
                onChange={(e) => {
                  const newType = e.target.value;
                  if (isCashTransaction(newType)) {
                    setAssetClass('cash');
                    setAddForm({ ...addForm, transaction_type: newType, symbol: '$CASH', quantity: '1' });
                  } else {
                    setAddForm({ ...addForm, transaction_type: newType, symbol: addForm.symbol === '$CASH' ? '' : addForm.symbol });
                  }
                }}
                options={assetClass === 'option' ? [
                  { value: 'buy', label: 'Buy to Open' },
                  { value: 'sell', label: 'Sell to Close' },
                  { value: 'option_exercise', label: 'Exercise' },
                  { value: 'option_assignment', label: 'Assignment' },
                  { value: 'option_expiration', label: 'Expiration' },
                ] : assetClass === 'cash' ? [
                  { value: 'deposit', label: 'Deposit' },
                  { value: 'withdrawal', label: 'Withdrawal' },
                  { value: 'margin_interest', label: 'Margin Interest' },
                ] : [
                  { value: 'buy', label: 'Buy' },
                  { value: 'sell', label: 'Sell' },
                  { value: 'dividend', label: 'Dividend' },
                  { value: 'transfer_in', label: 'Transfer In' },
                  { value: 'transfer_out', label: 'Transfer Out' },
                ]}
              />
              {assetClass === 'cash' ? (
                <Input label="Amount (USD)" type="number" step="any" placeholder="1000.00" value={addForm.price_per_unit} onChange={(e) => setAddForm({ ...addForm, price_per_unit: e.target.value })} required />
              ) : (
                <Input label={assetClass === 'option' ? 'Contracts' : 'Quantity'} type="number" step="any" value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} required />
              )}
            </div>
            {assetClass !== 'cash' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={assetClass === 'option' ? 'Premium per contract' : 'Price per unit'} type="number" step="any" placeholder="auto-fills" value={addForm.price_per_unit} onChange={(e) => setAddForm({ ...addForm, price_per_unit: e.target.value })} required />
              <Input label="Fees" type="number" step="any" value={addForm.fees} onChange={(e) => setAddForm({ ...addForm, fees: e.target.value })} />
            </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Date" type="date" value={addForm.transaction_date} onChange={(e) => setAddForm({ ...addForm, transaction_date: e.target.value })} required />
              <Input label="Notes (optional)" placeholder="Any notes..." value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setShowAddTx(false)}>Cancel</Button>
            <Button type="submit" loading={addingSaving}>Add Transaction</Button>
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
          <Button variant="destructive" loading={deleting} onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
