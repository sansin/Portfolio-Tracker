'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Building2,
  DollarSign,
  Activity,
  Globe,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/lib/utils';
import TrendChart from '@/components/charts/TrendChart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface StockDetail {
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
  // Extra from profile
  sector?: string;
  industry?: string;
  exchange?: string;
  week52High?: number;
  week52Low?: number;
  logo?: string;
}

interface StockDetailModalProps {
  symbol: string | null;
  onClose: () => void;
}

export default function StockDetailModal({ symbol, onClose }: StockDetailModalProps) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/detail?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error('Failed to fetch stock detail:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      setDetail(null);
      fetchDetail();
    }
  }, [symbol, fetchDetail]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (symbol) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [symbol, onClose]);

  if (!symbol) return null;

  const priceColor = (detail?.change ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  const priceBg = (detail?.change ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10';

  function formatVolume(v: number): string {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toString();
  }

  function formatMarketCap(v: number): string {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toLocaleString()}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {detail?.logo ? (
              <img src={detail.logo} alt={symbol} className="w-10 h-10 rounded-lg bg-zinc-800 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-indigo-400">{symbol.slice(0, 2)}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{symbol}</h2>
                {detail?.exchange && (
                  <Badge variant="outline" className="text-xs">{detail.exchange}</Badge>
                )}
              </div>
              {loading ? (
                <Skeleton className="h-4 w-32 mt-0.5" />
              ) : (
                <p className="text-sm text-zinc-400">{detail?.name || symbol}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Price Header */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-5 w-56" />
            </div>
          ) : detail ? (
            <div>
              <p className="text-3xl font-bold text-white tabular-nums">{formatCurrency(detail.price)}</p>
              <div className={cn('flex items-center gap-2 mt-1', priceColor)}>
                {detail.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-sm font-medium tabular-nums">
                  {detail.change >= 0 ? '+' : ''}{formatCurrency(detail.change)}
                </span>
                <Badge variant={detail.change >= 0 ? 'success' : 'danger'} className="text-xs">
                  {formatPercent(detail.changePercent)}
                </Badge>
              </div>
            </div>
          ) : null}

          {/* Chart */}
          <TrendChart
            symbol={symbol}
            title=""
            className="!p-0 !border-0 !bg-transparent"
          />

          {/* Key Stats */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : detail ? (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Key Statistics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={<Activity className="w-3.5 h-3.5" />} label="Day Range" value={`${formatCurrency(detail.dayLow)} – ${formatCurrency(detail.dayHigh)}`} />
                {(detail.week52High ?? 0) > 0 && (
                  <StatCard icon={<BarChart3 className="w-3.5 h-3.5" />} label="52W Range" value={`${formatCurrency(detail.week52Low ?? 0)} – ${formatCurrency(detail.week52High ?? 0)}`} />
                )}
                <StatCard icon={<Hash className="w-3.5 h-3.5" />} label="Volume" value={formatVolume(detail.volume)} />
                {detail.marketCap > 0 && (
                  <StatCard icon={<DollarSign className="w-3.5 h-3.5" />} label="Market Cap" value={formatMarketCap(detail.marketCap)} />
                )}
                {detail.peRatio > 0 && (
                  <StatCard icon={<BarChart3 className="w-3.5 h-3.5" />} label="P/E Ratio" value={detail.peRatio.toFixed(2)} />
                )}
                {detail.sector && (
                  <StatCard icon={<Building2 className="w-3.5 h-3.5" />} label="Sector" value={detail.sector} />
                )}
              </div>
            </div>
          ) : null}

          {/* 52-week range bar */}
          {detail && (detail.week52High ?? 0) > 0 && (detail.week52Low ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">52-Week Position</h3>
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="flex justify-between text-xs text-zinc-500 mb-2">
                  <span>{formatCurrency(detail.week52Low!)}</span>
                  <span>{formatCurrency(detail.week52High!)}</span>
                </div>
                <div className="relative h-2 bg-zinc-700 rounded-full">
                  {(() => {
                    const range = detail.week52High! - detail.week52Low!;
                    const pos = range > 0 ? ((detail.price - detail.week52Low!) / range) * 100 : 50;
                    return (
                      <>
                        <div
                          className="absolute h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full"
                          style={{ width: '100%' }}
                        />
                        <div
                          className="absolute -top-1 w-4 h-4 bg-white rounded-full border-2 border-indigo-500 shadow-lg"
                          style={{ left: `calc(${Math.min(Math.max(pos, 2), 98)}% - 8px)` }}
                        />
                      </>
                    );
                  })()}
                </div>
                <p className="text-center text-xs text-zinc-400 mt-2">
                  Current: {formatCurrency(detail.price)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-800/40 border border-zinc-700/30 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-medium text-zinc-100 truncate">{value}</p>
    </div>
  );
}
