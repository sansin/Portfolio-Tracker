'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Treemap,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  Shield,
  Layers,
  BarChart3,
  Target,
  AlertTriangle,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  Eye,
  Table2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Briefcase,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import TrendChart from '@/components/charts/TrendChart';
import {
  formatCurrency,
  formatCurrencyWhole,
  formatPercent,
  formatPercentWhole,
  getChangeColor,
  cn,
  formatDate,
} from '@/lib/utils';
import { useStockDetail } from '@/contexts/stock-detail-context';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────

interface PerformanceData {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
  bestPerformer: { symbol: string; gainPercent: number } | null;
  worstPerformer: { symbol: string; gainPercent: number } | null;
}

interface AllocationData {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface SectorData {
  sector: string;
  value: number;
  percentage: number;
  holdings: number;
  color: string;
}

interface RiskData {
  diversificationScore: number;
  topHoldingConcentration: number;
  sectorConcentration: number;
  portfolioCount: number;
}

interface OverlapData {
  symbol: string;
  portfolios: string[];
  totalQuantity: number;
  totalValue: number;
}

interface HoldingRow {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  weight: number;
  dayChange: number;
  dayChangePercent: number;
}

interface PortfolioBreakdown {
  id: string;
  name: string;
  totalValue: number;
  totalCost: number;
  gainLoss: number;
  gainLossPercent: number;
  holdingsCount: number;
}

interface TopMover {
  symbol: string;
  name: string;
  dayChange: number;
  dayChangePercent: number;
}

interface MonthlyReturn {
  month: string;
  return: number;
}

interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string;
  quarter: number;
  year: number;
}

type SortField = 'symbol' | 'marketValue' | 'unrealizedPL' | 'unrealizedPLPercent' | 'weight' | 'dayChangePercent';
type SortDir = 'asc' | 'desc';

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ── Tabs Config ────────────────────────────────────────────────────────────

const ANALYTICS_TABS = [
  { id: 'overview', label: 'Overview', icon: <Eye className="w-4 h-4" /> },
  { id: 'holdings', label: 'Holdings', icon: <Table2 className="w-4 h-4" /> },
  { id: 'allocation', label: 'Allocation', icon: <PieIcon className="w-4 h-4" /> },
  { id: 'risk', label: 'Risk & Overlap', icon: <Shield className="w-4 h-4" /> },
];

// ── Treemap Custom Content ─────────────────────────────────────────────────

function TreemapContent(props: any) {
  const { x, y, width, height, name, changePercent } = props;
  if (width < 40 || height < 30) return null;
  const bg = changePercent >= 0 ? '#059669' : '#dc2626';
  const opacity = Math.min(0.4 + Math.abs(changePercent) * 0.06, 1);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={bg} fillOpacity={opacity} rx={4} stroke="#18181b" strokeWidth={2} />
      <text x={x + width / 2} y={y + height / 2 - 7} textAnchor="middle" fill="#fff" fontSize={width > 70 ? 12 : 10} fontWeight={600}>
        {name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="#e4e4e7" fontSize={10}>
        {changePercent >= 0 ? '+' : ''}{changePercent?.toFixed(1)}%
      </text>
    </g>
  );
}

// ── Sort Icon ──────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="w-3.5 h-3.5 text-zinc-600" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { openStockDetail } = useStockDetail();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [allocation, setAllocation] = useState<AllocationData[]>([]);
  const [sectorAllocation, setSectorAllocation] = useState<SectorData[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<RiskData | null>(null);
  const [overlaps, setOverlaps] = useState<OverlapData[]>([]);
  const [holdingsCount, setHoldingsCount] = useState(0);
  const [holdings, setHoldings] = useState<{ symbol: string; quantity: number }[]>([]);
  const [holdingsTable, setHoldingsTable] = useState<HoldingRow[]>([]);
  const [portfolioBreakdown, setPortfolioBreakdown] = useState<PortfolioBreakdown[]>([]);
  const [monthlyReturns, setMonthlyReturns] = useState<MonthlyReturn[]>([]);
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters & sorting
  const [sectorFilter, setSectorFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [timeRange, setTimeRange] = useState<'1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y'>('1D');

  const fetchAllData = useCallback(async () => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics/kpis');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setPerformance(data.performance);
        setAllocation(data.allocation || []);
        setSectorAllocation(data.sectorAllocation || []);
        setRiskMetrics(data.riskMetrics);
        setOverlaps(data.overlaps || []);
        setHoldingsCount(data.holdingsCount || 0);
        setHoldings(data.holdings || []);
        setHoldingsTable(data.holdingsTable || []);
        setPortfolioBreakdown(data.portfolioBreakdown || []);
        setMonthlyReturns(data.monthlyReturns || []);
        setTopMovers(data.topMovers || []);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Analytics fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    async function fetchEarnings() {
      try {
        const res = await fetch('/api/stocks/earnings');
        if (res.ok) {
          const data = await res.json();
          setEarnings(data.earnings || []);
        }
      } catch (err) {
        console.error('Earnings fetch error:', err);
      }
    }

    async function fetchRecentTransactions() {
      try {
        const res = await fetch('/api/transactions?limit=5');
        if (res.ok) {
          const data = await res.json();
          setRecentTransactions(data.data || []);
        }
      } catch (err) {
        console.error('Transactions fetch error:', err);
      }
    }

    await Promise.all([fetchAnalytics(), fetchEarnings(), fetchRecentTransactions()]);
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchAllData();
  }, [fetchAllData]);

  // Derived data
  const trendSymbols = useMemo(() => holdings, [holdings]);

  const sectors = useMemo(() => {
    const s = new Set(holdingsTable.map((h) => h.sector).filter(Boolean));
    return ['all', ...Array.from(s)] as string[];
  }, [holdingsTable]);

  const filteredHoldings = useMemo(() => {
    let rows = [...holdingsTable];
    if (sectorFilter !== 'all') rows = rows.filter((h) => h.sector === sectorFilter);
    rows.sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
    return rows;
  }, [holdingsTable, sectorFilter, sortField, sortDir]);

  const treemapData = useMemo(() => {
    return holdingsTable.map((h) => ({
      name: h.symbol,
      size: h.marketValue,
      changePercent: h.dayChangePercent,
    }));
  }, [holdingsTable]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const exportCSV = useCallback(() => {
    const headers = ['Symbol', 'Name', 'Sector', 'Qty', 'Avg Cost', 'Price', 'Market Value', 'Cost Basis', 'P&L', 'P&L %', 'Weight %', 'Day Chg %'];
    const rows = filteredHoldings.map((h) => [
      h.symbol, h.name, h.sector || '', h.quantity.toFixed(4), h.avgCost.toFixed(2),
      h.currentPrice.toFixed(2), h.marketValue.toFixed(2), h.costBasis.toFixed(2),
      h.unrealizedPL.toFixed(2), h.unrealizedPLPercent.toFixed(2), h.weight.toFixed(2), h.dayChangePercent.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredHoldings]);

  // ── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
          <p className="text-zinc-400 mt-1">Loading your portfolio analytics…</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────────────

  if (!performance) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
          <p className="text-zinc-400 mt-1">Deep insights into your portfolio performance</p>
        </div>
        <EmptyState
          icon={<BarChart3 className="w-16 h-16 text-zinc-600" />}
          title="No Analytics Data"
          description="Add holdings to your portfolios to unlock detailed analytics, risk metrics, and performance insights."
        />
      </div>
    );
  }

  // ── Pie Tooltip ───────────────────────────────────────────────────────────

  const pieTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
          <p className="text-white font-medium text-sm">{d.symbol || d.sector}</p>
          <p className="text-zinc-400 text-xs">{formatCurrency(d.value)}</p>
          <p className="text-zinc-400 text-xs">{d.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  // ── KPI Cards (shared across tabs) ────────────────────────────────────────

  const KPICards = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="bg-gradient-to-br from-indigo-500/10 via-zinc-800/50 to-zinc-800/50 border-indigo-500/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Portfolio Value</span>
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(performance.totalValue)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Cost: {formatCurrency(performance.totalCost)}</p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-800/50 border-zinc-700/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Total P&L</span>
            {performance.totalGain >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
          <p className={cn('text-xl font-bold', getChangeColor(performance.totalGain))}>
            {formatCurrency(performance.totalGain)}
          </p>
          <p className={cn('text-xs mt-0.5', getChangeColor(performance.totalGainPercent))}>
            {formatPercent(performance.totalGainPercent)}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-800/50 border-zinc-700/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Day Change</span>
            {performance.dayChange >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
          <p className={cn('text-xl font-bold', getChangeColor(performance.dayChange))}>
            {formatCurrency(performance.dayChange)}
          </p>
          <p className={cn('text-xs mt-0.5', getChangeColor(performance.dayChangePercent))}>
            {formatPercent(performance.dayChangePercent)}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-800/50 border-zinc-700/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Diversification</span>
            <Shield className="w-4 h-4 text-indigo-400" />
          </div>
          <p className={cn('text-xl font-bold', (riskMetrics?.diversificationScore ?? 0) >= 70 ? 'text-emerald-400' : (riskMetrics?.diversificationScore ?? 0) >= 40 ? 'text-yellow-400' : 'text-red-400')}>
            {riskMetrics?.diversificationScore ?? 0}<span className="text-sm text-zinc-500">/100</span>
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{holdingsCount} holdings</p>
        </CardContent>
      </Card>
    </div>
  );

  // ── Tab: Overview ─────────────────────────────────────────────────────────

  const OverviewTab = (
    <div className="space-y-6">
      {/* Top Movers + Performance Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Movers */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-indigo-400" />
              Top Movers Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topMovers.length > 0 ? topMovers.map((m) => (
              <button key={m.symbol} onClick={() => openStockDetail(m.symbol)} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/30 transition-colors w-full text-left">
                <div>
                  <span className="text-white font-medium text-sm hover:text-indigo-400 transition-colors">{m.symbol}</span>
                  <span className="text-zinc-500 text-xs ml-2 hidden sm:inline">{m.name}</span>
                </div>
                <div className="text-right">
                  <Badge variant={m.dayChangePercent >= 0 ? 'success' : 'danger'} className="text-xs">
                    {formatPercent(m.dayChangePercent)}
                  </Badge>
                  <p className={cn('text-xs mt-0.5', getChangeColor(m.dayChange))}>{formatCurrency(m.dayChange)}</p>
                </div>
              </button>
            )) : <p className="text-zinc-500 text-sm text-center py-4">No market data available</p>}
          </CardContent>
        </Card>

        {/* Best & Worst */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Performance Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {performance.bestPerformer && (
              <button onClick={() => openStockDetail(performance.bestPerformer!.symbol)} className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg w-full text-left hover:bg-emerald-500/15 transition-colors">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-white text-sm font-medium">Best Performer</p>
                    <p className="text-zinc-400 text-xs">{performance.bestPerformer.symbol}</p>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold text-sm">{formatPercent(performance.bestPerformer.gainPercent)}</span>
              </button>
            )}
            {performance.worstPerformer && (
              <button onClick={() => openStockDetail(performance.worstPerformer!.symbol)} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-lg w-full text-left hover:bg-red-500/15 transition-colors">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-white text-sm font-medium">Worst Performer</p>
                    <p className="text-zinc-400 text-xs">{performance.worstPerformer.symbol}</p>
                  </div>
                </div>
                <span className="text-red-400 font-bold text-sm">{formatPercent(performance.worstPerformer.gainPercent)}</span>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Breakdown + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Breakdown */}
        {portfolioBreakdown.length > 0 && (
          <Card className="bg-zinc-800/50 border-zinc-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                Portfolio Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {portfolioBreakdown.map((p) => {
                  const portfolioPct = performance.totalValue > 0 ? (p.totalValue / performance.totalValue) * 100 : 0;
                  return (
                    <div key={p.id} className="p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/30">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-white text-sm font-medium">{p.name}</p>
                          <p className="text-zinc-500 text-xs">{p.holdingsCount} holdings</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-sm font-medium">{formatCurrency(p.totalValue)}</p>
                          <p className={cn('text-xs', getChangeColor(p.gainLoss))}>{formatPercent(p.gainLossPercent)}</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(portfolioPct, 100)}%` }} />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{portfolioPct.toFixed(1)}% of total</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Transactions */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="w-4 h-4 text-indigo-400" />
              Recent Transactions
            </CardTitle>
            <Link href={ROUTES.TRANSACTIONS}>
              <Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length > 0 ? (
              <div className="space-y-2">
                {recentTransactions.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => t.asset?.symbol && openStockDetail(t.asset.symbol)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-zinc-800/40 hover:bg-zinc-700/30 transition-colors w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center',
                        t.transaction_type === 'buy' || t.transaction_type === 'transfer_in' ? 'bg-emerald-500/10' :
                        t.transaction_type === 'sell' || t.transaction_type === 'transfer_out' ? 'bg-red-500/10' : 'bg-indigo-500/10'
                      )}>
                        {(t.transaction_type === 'buy' || t.transaction_type === 'transfer_in') ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> :
                         (t.transaction_type === 'sell' || t.transaction_type === 'transfer_out') ? <ArrowDownRight className="h-4 w-4 text-red-400" /> :
                         <DollarSign className="h-4 w-4 text-indigo-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{t.asset?.symbol || 'Unknown'}</p>
                        <p className="text-xs text-zinc-500 capitalize">{(t.transaction_type || '').replaceAll('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-zinc-200 tabular-nums">{formatCurrency(Number(t.total_amount))}</p>
                      <p className="text-xs text-zinc-500">{formatDate(t.transaction_date)}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-6">No transactions yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Returns Chart */}
      {monthlyReturns.length > 1 && (
        <ErrorBoundary>
          <Card className="bg-zinc-800/50 border-zinc-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                Cumulative Return Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyReturns}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff' }}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Return']}
                  />
                  <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                    {monthlyReturns.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.return >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ErrorBoundary>
      )}
    </div>
  );

  // ── Tab: Holdings ─────────────────────────────────────────────────────────

  const HoldingsTab = (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center">
          <Select
            options={sectors.map((s) => ({ value: s, label: s === 'all' ? 'All Sectors' : s }))}
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="w-40"
          />
          <Badge variant="outline" className="text-xs">
            {filteredHoldings.length} of {holdingsTable.length}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Heatmap */}
      {treemapData.length > 0 && (
        <ErrorBoundary>
          <Card className="bg-zinc-800/50 border-zinc-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Market Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  content={<TreemapContent />}
                />
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ErrorBoundary>
      )}

      {/* Holdings Table */}
      <Card className="bg-zinc-800/50 border-zinc-700/50 overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 p-4">
          {filteredHoldings.map((h) => (
            <div key={h.symbol} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => openStockDetail(h.symbol)} className="flex items-center gap-2 hover:text-indigo-400 transition-colors">
                  <span className="text-sm font-semibold text-white">{h.symbol}</span>
                  <span className="text-xs text-zinc-500 truncate max-w-[120px]">{h.name}</span>
                </button>
                <span className="text-sm font-medium text-white tabular-nums">{formatCurrency(h.marketValue)}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Qty</p>
                  <p className="text-zinc-300 tabular-nums">{h.quantity.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Avg Cost</p>
                  <p className="text-zinc-300 tabular-nums">{formatCurrency(h.avgCost)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Price</p>
                  <p className="text-zinc-300 tabular-nums">{formatCurrency(h.currentPrice)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-700/50">
                <div>
                  <span className="text-zinc-500 mr-1">P&L:</span>
                  <span className={cn('font-medium tabular-nums', getChangeColor(h.unrealizedPL))}>
                    {formatCurrency(h.unrealizedPL)} ({h.unrealizedPLPercent >= 0 ? '+' : ''}{h.unrealizedPLPercent.toFixed(1)}%)
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 mr-1">Day:</span>
                  <span className={cn('font-medium tabular-nums', getChangeColor(h.dayChangePercent))}>
                    {h.dayChangePercent >= 0 ? '+' : ''}{h.dayChangePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
          {filteredHoldings.length === 0 && (
            <p className="text-center text-zinc-500 py-4">No holdings match your filter</p>
          )}
        </div>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/50">
                {([
                  { key: 'symbol' as SortField, label: 'Symbol' },
                  { key: 'marketValue' as SortField, label: 'Market Value' },
                  { key: 'unrealizedPL' as SortField, label: 'P&L' },
                  { key: 'unrealizedPLPercent' as SortField, label: 'P&L %' },
                  { key: 'weight' as SortField, label: 'Weight' },
                  { key: 'dayChangePercent' as SortField, label: 'Day Chg' },
                ]).map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200 transition-colors select-none"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} sortField={sortField} sortDir={sortDir} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredHoldings.map((h) => (
                <tr key={h.symbol} className="hover:bg-zinc-700/20 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => openStockDetail(h.symbol)} className="text-left group">
                      <span className="text-white font-medium group-hover:text-indigo-400 transition-colors">{h.symbol}</span>
                      <p className="text-zinc-500 text-xs truncate max-w-[140px]">{h.name}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-white">{formatCurrency(h.marketValue)}</span>
                      <p className="text-zinc-500 text-xs">{h.quantity.toFixed(2)} x {formatCurrency(h.currentPrice)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('font-medium', getChangeColor(h.unrealizedPL))}>
                      {formatCurrency(h.unrealizedPL)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={h.unrealizedPLPercent >= 0 ? 'success' : 'danger'} className="text-xs">
                      {formatPercent(h.unrealizedPLPercent)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden max-w-[60px]">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(h.weight, 100)}%` }} />
                      </div>
                      <span className="text-zinc-400 text-xs w-10 text-right">{h.weight.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-medium', getChangeColor(h.dayChangePercent))}>
                      {formatPercent(h.dayChangePercent)}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredHoldings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No holdings match your filter</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  // ── Tab: Allocation ───────────────────────────────────────────────────────

  const AllocationTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset Allocation Pie */}
        <ErrorBoundary>
          <Card className="bg-zinc-800/50 border-zinc-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieIcon className="w-4 h-4 text-indigo-400" />
                Asset Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allocation.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={240}>
                    <PieChart>
                      <Pie data={allocation} cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="value" stroke="none">
                        {allocation.map((item, i) => <Cell key={i} fill={item.color} />)}
                      </Pie>
                      <Tooltip content={pieTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                    {allocation.slice(0, 12).map((item) => (
                      <div key={item.symbol} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-zinc-300">{item.symbol}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-zinc-400">{item.percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-zinc-500 text-center py-10">No holdings data</p>}
            </CardContent>
          </Card>
        </ErrorBoundary>

        {/* Sector Allocation Pie */}
        <ErrorBoundary>
          <Card className="bg-zinc-800/50 border-zinc-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="w-4 h-4 text-indigo-400" />
                Sector Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sectorAllocation.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={240}>
                    <PieChart>
                      <Pie data={sectorAllocation} cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="value" stroke="none">
                        {sectorAllocation.map((item, i) => <Cell key={i} fill={item.color} />)}
                      </Pie>
                      <Tooltip content={pieTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                    {sectorAllocation.map((item) => (
                      <div key={item.sector} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-zinc-300">{item.sector}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{item.holdings}h</span>
                          <span className="text-zinc-400">{item.percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-zinc-500 text-center py-10">No sector data</p>}
            </CardContent>
          </Card>
        </ErrorBoundary>
      </div>

      {/* Top Holdings Bar Chart */}
      <ErrorBoundary>
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Top Holdings by Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allocation.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={allocation.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis type="category" dataKey="symbol" width={55} stroke="#52525b" tick={{ fill: '#d4d4d8', fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {allocation.slice(0, 10).map((item, i) => <Cell key={i} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-zinc-500 text-center py-10">No data</p>}
          </CardContent>
        </Card>
      </ErrorBoundary>
    </div>
  );

  // ── Tab: Risk & Overlap ───────────────────────────────────────────────────

  const scoreVal = riskMetrics?.diversificationScore ?? 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (scoreVal / 100) * circumference;
  const ringColor = scoreVal >= 70 ? '#10b981' : scoreVal >= 40 ? '#eab308' : '#ef4444';

  const RiskTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Diversification Score Ring */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Diversification Score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="relative w-32 h-32 mb-3">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" stroke="#3f3f46" strokeWidth="6" fill="none" />
                <circle cx="50" cy="50" r="45" stroke={ringColor} strokeWidth="6" fill="none"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{scoreVal}</span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 text-center">
              {scoreVal >= 70 ? 'Well diversified portfolio' : scoreVal >= 40 ? 'Consider diversifying further' : 'Highly concentrated — add more variety'}
            </p>
          </CardContent>
        </Card>

        {/* Concentration Metrics */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Concentration Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">Top Holding</span>
                <span className="text-white">{(riskMetrics?.topHoldingConcentration ?? 0).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(riskMetrics?.topHoldingConcentration ?? 0, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">Top Sector</span>
                <span className="text-white">{(riskMetrics?.sectorConcentration ?? 0).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.min(riskMetrics?.sectorConcentration ?? 0, 100)}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-700/50">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Portfolios</span>
                <span className="text-white">{riskMetrics?.portfolioCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-zinc-400">Unique Holdings</span>
                <span className="text-white">{holdingsCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Risk Summary */}
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Single stock risk', check: (riskMetrics?.topHoldingConcentration ?? 0) < 25, desc: '< 25% in one stock' },
              { label: 'Sector diversification', check: (riskMetrics?.sectorConcentration ?? 0) < 40, desc: '< 40% in one sector' },
              { label: 'Multi-portfolio', check: (riskMetrics?.portfolioCount ?? 0) >= 2, desc: '2+ portfolios' },
              { label: 'Holding breadth', check: holdingsCount >= 10, desc: '10+ holdings' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', item.check ? 'bg-emerald-400' : 'bg-red-400')} />
                <div className="flex-1">
                  <p className="text-white text-xs font-medium">{item.label}</p>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </div>
                <span className={cn('text-xs font-medium', item.check ? 'text-emerald-400' : 'text-red-400')}>
                  {item.check ? 'Pass' : 'Fail'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Overlapping Holdings */}
      <Card className="bg-zinc-800/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Overlapping Holdings
            {overlaps.length > 0 && <Badge variant="warning" className="text-xs ml-1">{overlaps.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overlaps.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {overlaps.map((o) => (
                <button key={o.symbol} onClick={() => openStockDetail(o.symbol)} className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-lg hover:bg-yellow-500/10 transition-colors text-left w-full">
                  <div>
                    <p className="text-white font-medium text-sm hover:text-indigo-400 transition-colors">{o.symbol}</p>
                    <p className="text-zinc-400 text-xs">{o.portfolios.join(', ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-300 text-sm">{formatCurrency(o.totalValue)}</p>
                    <p className="text-zinc-500 text-xs">{o.totalQuantity.toFixed(2)} shares</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-6 text-sm">No overlapping holdings across portfolios</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const tabContent: Record<string, React.ReactNode> = {
    overview: OverviewTab,
    holdings: HoldingsTab,
    allocation: AllocationTab,
    risk: RiskTab,
  };

  const TIME_RANGE_OPTIONS = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;

  return (
    <div className="space-y-5">
      {/* Header + Unified Time Range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {holdingsCount} holdings across {riskMetrics?.portfolioCount ?? 0} portfolio{(riskMetrics?.portfolioCount ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900/60 rounded-lg p-1">
          {TIME_RANGE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                timeRange === t
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Data Freshness Indicator */}
      {lastUpdated && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Updated {formatRelativeTime(lastUpdated)}</span>
          <button
            onClick={handleRefresh}
            className="text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
            title="Refresh data"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      {KPICards}

      {/* Portfolio Trend Chart */}
      {trendSymbols.length > 0 && (
        <ErrorBoundary>
          <TrendChart
            symbols={trendSymbols}
            title="Portfolio Performance"
            externalPeriod={timeRange}
            onPeriodChange={(p) => setTimeRange(p as typeof timeRange)}
            hideTimeSelector
          />
        </ErrorBoundary>
      )}

      {/* Earnings Calendar */}
      {earnings.length > 0 && (
        <Card className="bg-zinc-800/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Upcoming Earnings
              <Badge variant="info" className="text-xs ml-1">{earnings.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {earnings.slice(0, 9).map((e, i) => {
                const earningsDate = new Date(e.date + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = Math.round((earningsDate.getTime() - today.getTime()) / 86400000);
                const dayLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `${diffDays} days`;
                const timeLabel = e.hour === 'bmo' ? 'Before Open' : e.hour === 'amc' ? 'After Close' : '';

                return (
                  <button key={`${e.symbol}-${e.date}-${i}`} onClick={() => openStockDetail(e.symbol)} className="flex items-center justify-between p-3 bg-zinc-800/40 border border-zinc-700/30 rounded-lg hover:bg-zinc-700/30 transition-colors text-left w-full">
                    <div>
                      <p className="text-white font-medium text-sm hover:text-indigo-400 transition-colors">{e.symbol}</p>
                      <p className="text-zinc-500 text-xs">Q{e.quarter} {e.year}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <p className="text-zinc-300 text-xs font-medium">{dayLabel}</p>
                        {diffDays <= 0 ? (
                          <Badge variant="danger" className="text-[10px] px-1.5 py-0">Today</Badge>
                        ) : diffDays <= 3 ? (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0">{diffDays}d away</Badge>
                        ) : null}
                      </div>
                      <p className="text-zinc-500 text-xs">
                        {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {timeLabel && ` · ${timeLabel}`}
                      </p>
                      {e.epsEstimate !== null && (
                        <p className="text-zinc-500 text-xs mt-0.5">Est. EPS: ${e.epsEstimate.toFixed(2)}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        tabs={ANALYTICS_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Active Tab Content */}
      {tabContent[activeTab]}
    </div>
  );
}
