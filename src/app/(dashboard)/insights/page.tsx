'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Brain,
  Activity,
  Newspaper,
  Search,
  RefreshCw,
  Sparkles,
  Clock,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ui/error-boundary';

interface Insight {
  title: string;
  content: string;
  confidence: number;
  type: string;
  createdAt: string;
  cached: boolean;
}

type TabType = 'portfolio_health' | 'market_summary' | 'stock_analysis';

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('portfolio_health');
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stockSymbol, setStockSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchInsight = useCallback(
    async (type: TabType, symbol?: string, force?: boolean) => {
      setLoading(true);
      setError('');
      setInsight(null);

      try {
        const params = new URLSearchParams({ type });
        if (symbol) params.set('symbol', symbol);
        if (force) params.set('force', 'true');

        const res = await fetch(`/api/insights?${params}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch insight');
        }

        const data = await res.json();
        setInsight(data.insight);
      } catch (err: any) {
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab !== 'stock_analysis') {
      fetchInsight(activeTab);
    }
  }, [activeTab, fetchInsight]);

  const handleStockSearch = () => {
    const symbol = searchInput.trim().toUpperCase();
    if (!symbol) return;
    setStockSymbol(symbol);
    fetchInsight('stock_analysis', symbol);
  };

  const tabs = [
    { id: 'portfolio_health' as const, label: 'Portfolio Health', icon: Shield },
    { id: 'market_summary' as const, label: 'Market Summary', icon: Newspaper },
    { id: 'stock_analysis' as const, label: 'Stock Analysis', icon: TrendingUp },
  ];

  const confidenceColor =
    (insight?.confidence ?? 0) >= 70
      ? 'text-emerald-400'
      : (insight?.confidence ?? 0) >= 40
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-indigo-400" />
            AI Insights
          </h1>
          <p className="text-zinc-400 mt-1">
            AI-powered analysis of your portfolio and market trends
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stock Search (for stock_analysis tab) */}
      {activeTab === 'stock_analysis' && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5">
          <div className="flex gap-3 max-w-md">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Enter stock symbol (e.g., AAPL)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleStockSearch()}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleStockSearch}
              disabled={loading || !searchInput.trim()}
              className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Analyze
            </button>
          </div>
          {stockSymbol && !loading && !insight && !error && (
            <p className="text-zinc-400 text-sm mt-3">
              Enter a stock symbol and click Analyze to get AI-powered insights
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="animate-spin">
              <RefreshCw className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-white font-medium">
              Generating insight with AI...
            </span>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
          <p className="text-red-400 font-medium">Error</p>
          <p className="text-red-300 text-sm mt-1">{error}</p>
          <button
            onClick={() =>
              activeTab === 'stock_analysis'
                ? fetchInsight('stock_analysis', stockSymbol)
                : fetchInsight(activeTab)
            }
            className="mt-3 text-sm text-red-400 hover:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Insight Display */}
      {insight && !loading && (
        <ErrorBoundary>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
          {/* Insight Header */}
          <div className="px-6 py-4 border-b border-zinc-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">{insight.title}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Activity className="w-4 h-4 text-zinc-400" />
                <span className={confidenceColor}>
                  {insight.confidence}% confidence
                </span>
              </div>
              {insight.cached && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock className="w-3.5 h-3.5" />
                  Cached
                </div>
              )}
              <button
                onClick={() =>
                  activeTab === 'stock_analysis'
                    ? fetchInsight('stock_analysis', stockSymbol, true)
                    : fetchInsight(activeTab, undefined, true)
                }
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700/50 transition-colors"
                title="Force refresh insight (bypass cache)"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Insight Content */}
          <div className="px-6 py-5">
            <div className="prose prose-invert prose-sm max-w-none">
              {insight.content.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return (
                    <h3 key={i} className="text-white font-semibold mt-4 mb-2 text-base">
                      {line.replace(/\*\*/g, '')}
                    </h3>
                  );
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**');
                  return (
                    <p key={i} className="text-zinc-300 mb-1">
                      <strong className="text-white">{parts[1]}</strong>
                      {parts[2]}
                    </p>
                  );
                }
                if (line.startsWith('•') || line.startsWith('✓') || line.startsWith('✗')) {
                  const color = line.startsWith('✓')
                    ? 'text-emerald-400'
                    : line.startsWith('✗')
                    ? 'text-red-400'
                    : 'text-zinc-300';
                  return (
                    <p key={i} className={`${color} ml-4 mb-1`}>
                      {line}
                    </p>
                  );
                }
                if (line.match(/^\d+\./)) {
                  return (
                    <p key={i} className="text-zinc-300 ml-4 mb-1">
                      {line}
                    </p>
                  );
                }
                if (line.trim() === '') return <br key={i} />;
                return (
                  <p key={i} className="text-zinc-300 mb-2">
                    {line}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-zinc-700/50 bg-zinc-900/30">
            <p className="text-xs text-zinc-500">
              AI-generated analysis • Not financial advice • Generated{' '}
              {new Date(insight.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        </ErrorBoundary>
      )}

      {/* No insight state for stock analysis */}
      {!loading && !insight && !error && activeTab === 'stock_analysis' && !stockSymbol && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-16 h-16 text-zinc-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Analyze Any Stock</h2>
          <p className="text-zinc-400 max-w-md">
            Enter a stock symbol above to get AI-powered analysis including company overview,
            market sentiment, risks, and opportunities.
          </p>
        </div>
      )}
    </div>
  );
}
