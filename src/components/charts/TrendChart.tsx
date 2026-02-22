'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TIME_PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;
type TimePeriod = (typeof TIME_PERIODS)[number];

interface ChartDataPoint {
  timestamp: number;
  date: string;
  price: number;
  volume?: number;
}

interface TrendChartProps {
  symbol?: string;
  symbols?: { symbol: string; quantity: number }[];
  title?: string;
  className?: string;
  externalPeriod?: TimePeriod;
  onPeriodChange?: (period: TimePeriod) => void;
  hideTimeSelector?: boolean;
}

function formatChartCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatTooltipCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartDataPoint;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-zinc-400 text-xs">{point.date}</p>
      <p className="text-white font-semibold text-sm">{formatTooltipCurrency(point.price)}</p>
    </div>
  );
}

export default function TrendChart({ symbol, symbols, title, className, externalPeriod, onPeriodChange, hideTimeSelector }: TrendChartProps) {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>('3M');
  const period = externalPeriod ?? internalPeriod;
  const handlePeriodChange = (p: TimePeriod) => {
    if (onPeriodChange) onPeriodChange(p);
    else setInternalPeriod(p);
  };
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (symbol) {
        url = `/api/stocks/chart?symbol=${encodeURIComponent(symbol)}&range=${period}`;
      } else if (symbols && symbols.length > 0) {
        url = `/api/stocks/chart?symbols=${encodeURIComponent(JSON.stringify(symbols))}&range=${period}`;
      } else {
        setData([]);
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch chart data');
      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      console.error('Chart fetch error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, symbols, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate change metrics
  const firstPrice = data.length > 0 ? data[0].price : 0;
  const lastPrice = data.length > 0 ? data[data.length - 1].price : 0;
  const priceChange = lastPrice - firstPrice;
  const changePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  const lineColor = isPositive ? '#10b981' : '#ef4444';
  const gradientId = `trendGradient-${symbol || 'portfolio'}`;

  // Determine axis tick count based on data
  const xTickCount = data.length > 100 ? 6 : data.length > 30 ? 8 : undefined;

  return (
    <div className={cn('bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          {title && (
            <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
          )}
          {!loading && data.length > 0 && (
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-white tabular-nums">
                {formatTooltipCurrency(lastPrice)}
              </span>
              <div className={cn('flex items-center gap-1', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                {priceChange > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : priceChange < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <Minus className="w-4 h-4" />
                )}
                <span className="text-sm font-medium tabular-nums">
                  {priceChange >= 0 ? '+' : ''}
                  {formatTooltipCurrency(priceChange)}
                </span>
                <span className="text-sm tabular-nums">
                  ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Time period selector */}
        {!hideTimeSelector && (
        <div className="flex items-center gap-1 bg-zinc-900/60 rounded-lg p-1">
          {TIME_PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                period === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Chart area */}
      {loading ? (
        <Skeleton className="h-[300px] w-full rounded-lg" />
      ) : data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-zinc-500">
          <p>No chart data available for this period</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="#52525b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickCount={xTickCount}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              stroke="#52525b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatChartCurrency}
              width={65}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 4,
                stroke: lineColor,
                strokeWidth: 2,
                fill: '#18181b',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
