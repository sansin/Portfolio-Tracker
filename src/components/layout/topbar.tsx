'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, User, Menu, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';

interface TopbarProps {
  user?: { display_name: string | null; email: string } | null;
}

export function Topbar({ user }: TopbarProps) {
  const router = useRouter();
  const { setSidebarCollapsed } = useUIStore();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<{ symbol: string; name: string }[]>([]);
  const [showResults, setShowResults] = React.useState(false);
  const [selectedIdx, setSelectedIdx] = React.useState(-1);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  // Click outside to close
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setSelectedIdx(-1);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (value.trim().length < 1) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (data.results) {
          setSearchResults(data.results.slice(0, 6).map((r: any) => ({ symbol: r.symbol, name: r.name })));
          setShowResults(true);
        }
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }

  function navigateToSymbol(symbol: string) {
    setShowResults(false);
    setSearchQuery('');
    setSearchResults([]);
    router.push(`/insights?tab=stock_analysis&symbol=${encodeURIComponent(symbol)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showResults || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      navigateToSymbol(searchResults[selectedIdx].symbol);
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="text-zinc-400 lg:hidden mr-2"
        onClick={() => setSidebarCollapsed(false)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <Input
          placeholder="Search stocks... (e.g. AAPL)"
          icon={<Search className="h-4 w-4" />}
          className="bg-zinc-900 border-zinc-800"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
        />
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden" role="listbox">
            {searchResults.map((r, i) => (
              <button
                key={r.symbol}
                role="option"
                aria-selected={i === selectedIdx}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIdx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
                onClick={() => navigateToSymbol(r.symbol)}
              >
                <TrendingUp className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-zinc-100">{r.symbol}</span>
                  <span className="text-xs text-zinc-500 ml-2 truncate">{r.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && searchQuery.trim().length >= 1 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl px-4 py-3">
            <p className="text-sm text-zinc-500">No results for &ldquo;{searchQuery.trim()}&rdquo;</p>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-zinc-400" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu
          trigger={
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors">
              <div className="h-8 w-8 rounded-full bg-indigo-600/20 flex items-center justify-center">
                <User className="h-4 w-4 text-indigo-400" />
              </div>
              {user?.display_name && (
                <span className="text-sm text-zinc-300 hidden sm:block">
                  {user.display_name}
                </span>
              )}
            </button>
          }
        >
          <DropdownItem onClick={() => router.push('/settings')}>Profile</DropdownItem>
          <DropdownItem onClick={() => router.push('/settings')}>Settings</DropdownItem>
          <DropdownItem destructive onClick={handleSignOut}>Sign out</DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
