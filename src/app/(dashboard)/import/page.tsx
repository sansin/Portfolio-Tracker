'use client';

import * as React from 'react';
import Link from 'next/link';
import { Upload, FileText, Image, ClipboardPaste, CheckCircle2, AlertCircle, Loader2, ArrowRight, X, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { formatCurrency, cn } from '@/lib/utils';
import { SUPPORTED_BROKERS, ROUTES } from '@/lib/constants';

interface ParsedTransaction {
  id: string;
  symbol: string;
  type: string;
  quantity: number;
  price: number;
  date: string;
  fees: number;
  total: number;
  valid: boolean;
  needsAttention?: boolean;
  error?: string;
}

type ImportMethod = 'csv' | 'screenshot' | 'paste' | null;

export default function ImportPage() {
  const { portfolios, fetchPortfolios } = usePortfolioStore();
  const [method, setMethod] = React.useState<ImportMethod>(null);
  const [broker, setBroker] = React.useState('robinhood');
  const [portfolioId, setPortfolioId] = React.useState('');
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [parsed, setParsed] = React.useState<ParsedTransaction[]>([]);
  const [pasteText, setPasteText] = React.useState('');
  const [importResult, setImportResult] = React.useState<{ imported: number; failed: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  React.useEffect(() => {
    if (portfolios.length > 0 && !portfolioId) {
      setPortfolioId(portfolios[0].id);
    }
  }, [portfolios, portfolioId]);

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('broker', broker);

    try {
      const res = await fetch('/api/import/csv', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsed(data.transactions || []);
      toast('success', `Parsed ${data.transactions?.length || 0} transactions`);
    } catch (err: any) {
      toast('error', 'CSV Parse Error', err.message);
    }
    setParsing(false);
  }

  async function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('broker', broker);

    try {
      const res = await fetch('/api/import/screenshot', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsed(data.transactions || []);
      toast('success', `Extracted ${data.transactions?.length || 0} transactions`);
    } catch (err: any) {
      toast('error', 'Screenshot Parse Error', err.message);
    }
    setParsing(false);
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) return;

    setParsing(true);
    try {
      const res = await fetch('/api/import/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText, broker }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsed(data.transactions || []);
      toast('success', `Parsed ${data.transactions?.length || 0} transactions`);
    } catch (err: any) {
      toast('error', 'Parse Error', err.message);
    }
    setParsing(false);
  }

  async function handleConfirmImport() {
    if (!portfolioId || parsed.length === 0) return;
    const validTxs = parsed.filter((t) => t.valid && t.symbol && t.quantity > 0);
    
    // Check if any have missing price — warn user
    const missingPrice = validTxs.filter((t) => !t.price || t.price <= 0);
    if (missingPrice.length > 0) {
      toast('error', 'Missing prices', `${missingPrice.length} transaction(s) need a price. Please fill in the highlighted fields.`);
      return;
    }

    if (validTxs.length === 0) {
      toast('error', 'No valid transactions to import');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId, transactions: validTxs, broker }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const failed = validTxs.length - (data.imported ?? 0);
      setImportResult({ imported: data.imported ?? 0, failed });
      toast('success', `Imported ${data.imported} transactions`);
    } catch (err: any) {
      toast('error', 'Import failed', err.message);
    }
    setImporting(false);
  }

  function handleRemoveTransaction(id: string) {
    setParsed((prev) => prev.filter((t) => t.id !== id));
  }

  function handleRemoveInvalid() {
    setParsed((prev) => prev.filter((t) => t.valid));
  }

  function handleUpdateTransaction(id: string, field: keyof ParsedTransaction, value: string) {
    setParsed((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t };
        if (field === 'symbol') updated.symbol = value.toUpperCase();
        else if (field === 'type') updated.type = value;
        else if (field === 'quantity') updated.quantity = parseFloat(value) || 0;
        else if (field === 'price') updated.price = parseFloat(value) || 0;
        else if (field === 'date') updated.date = value;
        else if (field === 'fees') updated.fees = parseFloat(value) || 0;

        // Recompute total and validity
        updated.total = updated.price * updated.quantity + updated.fees;
        updated.valid = !!(updated.symbol && updated.quantity > 0);
        updated.needsAttention = !updated.price || !updated.date;
        updated.error = !updated.symbol ? 'Missing symbol' : updated.quantity <= 0 ? 'Invalid quantity' : !updated.price ? 'Price missing' : undefined;
        return updated;
      })
    );
  }

  function handleResetImport() {
    setImportResult(null);
    setParsed([]);
    setMethod(null);
    setPasteText('');
  }

  const validCount = parsed.filter((t) => t.valid).length;
  const readyCount = parsed.filter((t) => t.valid && t.price > 0).length;
  const needsAttentionCount = parsed.filter((t) => t.valid && (!t.price || t.needsAttention)).length;
  const invalidCount = parsed.filter((t) => !t.valid).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Import Transactions</h1>
        <p className="text-sm text-zinc-500 mt-1">Import trades from your broker via CSV, screenshot, or paste.</p>
      </div>

      {/* Step 1: Choose portfolio & broker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Target Portfolio"
          value={portfolioId}
          onChange={(e) => setPortfolioId(e.target.value)}
          options={portfolios.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Select portfolio"
        />
        <Select
          label="Broker"
          value={broker}
          onChange={(e) => setBroker(e.target.value)}
          options={SUPPORTED_BROKERS.map((b) => ({ value: b.id, label: b.name }))}
        />
      </div>

      {/* Import success screen */}
      {importResult && (
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/10 mb-2">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Successfully imported {importResult.imported} transaction{importResult.imported !== 1 ? 's' : ''}
            </h2>
            {importResult.failed > 0 && (
              <p className="text-sm text-zinc-400">
                {importResult.failed} transaction{importResult.failed !== 1 ? 's' : ''} failed to import.
              </p>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="ghost" onClick={handleResetImport}>
                Import More
              </Button>
              <Link href={ROUTES.TRANSACTIONS}>
                <Button>
                  <ArrowRight className="h-4 w-4" />
                  View Transactions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Choose import method */}
      {parsed.length === 0 && !importResult && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'csv' as const, icon: FileText, title: 'CSV Upload', desc: 'Upload a transaction history CSV from your broker.' },
            { id: 'screenshot' as const, icon: Image, title: 'Screenshot', desc: 'Upload a screenshot — AI will extract the data.' },
            { id: 'paste' as const, icon: ClipboardPaste, title: 'Paste Text', desc: 'Paste transaction data from emails or confirmations.' },
          ].map((m) => (
            <Card
              key={m.id}
              className={cn('cursor-pointer transition-all', method === m.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'hover:border-zinc-700')}
              onClick={() => setMethod(m.id)}
            >
              <CardContent className="p-6 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 mb-3">
                  <m.icon className="h-6 w-6 text-indigo-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100 mb-1">{m.title}</h3>
                <p className="text-xs text-zinc-500">{m.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 3: Upload / Paste area */}
      {method === 'csv' && parsed.length === 0 && !importResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
            <div
              className="border-2 border-dashed border-zinc-700 hover:border-indigo-500/50 rounded-xl p-10 transition-colors cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-500/5');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/5');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/5');
                const file = e.dataTransfer.files?.[0];
                if (file && file.name.endsWith('.csv')) {
                  // Trigger the upload handler by setting file input
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  if (fileInputRef.current) {
                    fileInputRef.current.files = dt.files;
                    fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } else {
                  toast('error', 'Invalid file', 'Please upload a .csv file');
                }
              }}
            >
              <Upload className="h-10 w-10 text-zinc-600 group-hover:text-indigo-400 mx-auto mb-3 transition-colors" />
              <p className="text-sm text-zinc-300 mb-1">Drag & drop your CSV file here</p>
              <p className="text-xs text-zinc-500">or click to browse</p>
            </div>
            {parsing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing CSV...
              </div>
            )}
            <p className="text-xs text-zinc-500 mt-4">Supported: Robinhood, Fidelity, Charles Schwab CSV exports</p>
          </CardContent>
        </Card>
      )}

      {method === 'screenshot' && parsed.length === 0 && !importResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleScreenshotUpload} className="hidden" />
            <Button onClick={() => imageInputRef.current?.click()} loading={parsing} size="lg">
              <Image className="h-5 w-5" />
              Upload Screenshot
            </Button>
            <p className="text-xs text-zinc-500 mt-3">Upload a screenshot of your trade confirmation or history</p>
          </CardContent>
        </Card>
      )}

      {method === 'paste' && parsed.length === 0 && !importResult && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your transaction data here — any format works!&#10;&#10;Examples:&#10;VRT buy 2700 shares at $162.71 on 2025-01-01&#10;Bought 100 AAPL at $150&#10;MSFT 50 shares&#10;TSLA,10,200,2025-03-15"
              className="w-full h-40 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <Button onClick={handlePasteImport} loading={parsing}>
              <ArrowRight className="h-4 w-4" />
              Parse Text
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review parsed transactions (editable) */}
      {parsed.length > 0 && !importResult && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Review & Edit Transactions</CardTitle>
                <CardDescription>
                  {readyCount} ready to import
                  {needsAttentionCount > 0 && <span className="text-amber-400">, {needsAttentionCount} need attention</span>}
                  {invalidCount > 0 && <span className="text-red-400">, {invalidCount} invalid</span>}
                  {' — '}click any cell to edit.
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {invalidCount > 0 && (
                  <Button variant="ghost" onClick={handleRemoveInvalid}>
                    Remove Invalid ({invalidCount})
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setParsed([])}>Cancel</Button>
                <Button onClick={handleConfirmImport} loading={importing} disabled={readyCount === 0}>
                  Import {readyCount} Transaction{readyCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3 w-10">Status</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Symbol</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Type</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Qty</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Price</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Date</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Fees</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-4 py-3">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((t) => {
                    const isReady = t.valid && t.price > 0;
                    const needsWork = t.valid && (!t.price || t.needsAttention);
                    return (
                      <tr key={t.id} className={cn('border-b border-zinc-800/50 group', !t.valid && 'opacity-50 bg-red-500/5', needsWork && 'bg-amber-500/5')}>
                        <td className="px-4 py-2">
                          {isReady ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : needsWork ? (
                            <Pencil className="h-4 w-4 text-amber-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-400" />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={t.symbol}
                            onChange={(e) => handleUpdateTransaction(t.id, 'symbol', e.target.value)}
                            className="w-20 bg-transparent text-sm font-medium text-zinc-100 border-b border-transparent hover:border-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors uppercase tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={t.type}
                            onChange={(e) => handleUpdateTransaction(t.id, 'type', e.target.value)}
                            className="bg-transparent text-sm text-zinc-300 border-b border-transparent hover:border-zinc-600 focus:border-indigo-500 focus:outline-none cursor-pointer transition-colors"
                          >
                            <option value="buy" className="bg-zinc-800">Buy</option>
                            <option value="sell" className="bg-zinc-800">Sell</option>
                            <option value="dividend" className="bg-zinc-800">Dividend</option>
                            <option value="transfer_in" className="bg-zinc-800">Transfer In</option>
                            <option value="transfer_out" className="bg-zinc-800">Transfer Out</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={t.quantity || ''}
                            onChange={(e) => handleUpdateTransaction(t.id, 'quantity', e.target.value)}
                            className="w-20 bg-transparent text-sm text-zinc-300 text-right border-b border-transparent hover:border-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors tabular-nums"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={t.price || ''}
                            onChange={(e) => handleUpdateTransaction(t.id, 'price', e.target.value)}
                            placeholder="0.00"
                            className={cn(
                              'w-24 bg-transparent text-sm text-right border-b focus:outline-none transition-colors tabular-nums',
                              !t.price ? 'border-amber-500/50 text-amber-300 placeholder:text-amber-500/50' : 'border-transparent text-zinc-300 hover:border-zinc-600 focus:border-indigo-500'
                            )}
                            min="0"
                            step="any"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={t.date || ''}
                            onChange={(e) => handleUpdateTransaction(t.id, 'date', e.target.value)}
                            className={cn(
                              'bg-transparent text-sm border-b focus:outline-none transition-colors',
                              !t.date ? 'border-amber-500/30 text-amber-300' : 'border-transparent text-zinc-400 hover:border-zinc-600 focus:border-indigo-500'
                            )}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={t.fees || ''}
                            onChange={(e) => handleUpdateTransaction(t.id, 'fees', e.target.value)}
                            placeholder="0"
                            className="w-16 bg-transparent text-sm text-zinc-400 text-right border-b border-transparent hover:border-zinc-600 focus:border-indigo-500 focus:outline-none transition-colors tabular-nums"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-zinc-100 tabular-nums">
                          {t.total > 0 ? formatCurrency(t.total) : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveTransaction(t.id)}
                            className="inline-flex items-center justify-center rounded-md p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove transaction"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {needsAttentionCount > 0 && (
              <div className="px-6 py-3 bg-amber-500/5 border-t border-amber-500/20">
                <p className="text-xs text-amber-400">
                  <Pencil className="h-3 w-3 inline mr-1" />
                  {needsAttentionCount} transaction{needsAttentionCount !== 1 ? 's' : ''} highlighted in amber — fill in the missing price or date to import.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
