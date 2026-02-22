'use client';

import * as React from 'react';
import Link from 'next/link';
import { Upload, FileText, Image, ClipboardPaste, CheckCircle2, AlertCircle, Loader2, ArrowRight, X } from 'lucide-react';
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
      toast('error', 'Failed to parse CSV', err.message);
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
      toast('error', 'Failed to parse screenshot', err.message);
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
      toast('error', 'Failed to parse text', err.message);
    }
    setParsing(false);
  }

  async function handleConfirmImport() {
    if (!portfolioId || parsed.length === 0) return;
    const validTxs = parsed.filter((t) => t.valid);
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

  function handleResetImport() {
    setImportResult(null);
    setParsed([]);
    setMethod(null);
    setPasteText('');
  }

  const validCount = parsed.filter((t) => t.valid).length;
  const invalidCount = parsed.filter((t) => !t.valid).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Import Transactions</h1>
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
              placeholder="Paste your transaction data here...&#10;&#10;Example:&#10;AAPL Buy 100 shares at $150.00 on 2024-01-15"
              className="w-full h-40 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <Button onClick={handlePasteImport} loading={parsing}>
              <ArrowRight className="h-4 w-4" />
              Parse Text
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review parsed transactions */}
      {parsed.length > 0 && !importResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Review Transactions</CardTitle>
                <CardDescription>
                  {validCount} valid, {invalidCount} with issues — review before importing.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {invalidCount > 0 && (
                  <Button variant="ghost" onClick={handleRemoveInvalid}>
                    Remove Invalid ({invalidCount})
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setParsed([])}>Cancel</Button>
                <Button onClick={handleConfirmImport} loading={importing} disabled={validCount === 0}>
                  Import {validCount} Transactions
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Symbol</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Type</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Qty</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Price</th>
                    <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3">Date</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Total</th>
                    <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((t) => (
                    <tr key={t.id} className={cn('border-b border-zinc-800/50', !t.valid && 'opacity-50')}>
                      <td className="px-6 py-3">
                        {t.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-zinc-100">{t.symbol}</td>
                      <td className="px-6 py-3"><Badge variant={t.type === 'buy' ? 'success' : 'danger'}>{t.type}</Badge></td>
                      <td className="text-right px-6 py-3 text-sm text-zinc-300 tabular-nums">{t.quantity}</td>
                      <td className="text-right px-6 py-3 text-sm text-zinc-300 tabular-nums">{formatCurrency(t.price)}</td>
                      <td className="px-6 py-3 text-sm text-zinc-400">{t.date}</td>
                      <td className="text-right px-6 py-3 text-sm font-medium text-zinc-100 tabular-nums">{formatCurrency(t.total)}</td>
                      <td className="text-right px-6 py-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveTransaction(t.id)}
                          className="inline-flex items-center justify-center rounded-md p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                          title="Remove transaction"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
