'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  ArrowLeftRight,
  Upload,
  BarChart3,
  Eye,
  Sparkles,
  Settings,
  ChevronLeft,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES, APP_NAME } from '@/lib/constants';
import { useUIStore } from '@/stores/ui-store';
import { useRouter } from 'next/navigation';

const navigation = [
  { name: 'Analytics', href: ROUTES.ANALYTICS, icon: BarChart3 },
  { name: 'Portfolios', href: ROUTES.PORTFOLIOS, icon: Briefcase },
  { name: 'Transactions', href: ROUTES.TRANSACTIONS, icon: ArrowLeftRight },
  { name: 'Import', href: ROUTES.IMPORT, icon: Upload },
  { name: 'Watchlist', href: ROUTES.WATCHLIST, icon: Eye },
  { name: 'AI Insights', href: ROUTES.INSIGHTS, icon: Sparkles },
];

const bottomNavigation = [
  { name: 'Settings', href: ROUTES.SETTINGS, icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed: collapsed, toggleSidebar, setSidebarCollapsed } = useUIStore();

  // Auto-close sidebar on mobile after navigation
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, [pathname, setSidebarCollapsed]);

  return (
    <>
      {/* Mobile backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300',
          // Desktop: collapsed = narrow, expanded = wide
          collapsed ? 'lg:w-16' : 'lg:w-64',
          // Mobile: hidden by default, shown as overlay when not collapsed
          collapsed ? '-translate-x-full lg:translate-x-0' : 'w-64 translate-x-0'
        )}
      >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-800">
        {!collapsed && (
          <Link href={ROUTES.ANALYTICS} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-lg font-semibold text-zinc-100">{APP_NAME}</span>
          </Link>
        )}
        {/* Close button on mobile */}
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
        {/* Collapse toggle on desktop */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors hidden lg:block',
            collapsed && 'mx-auto'
          )}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1" aria-label="Main navigation">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-zinc-800 px-2 py-4 space-y-1">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
        <form onSubmit={async (e) => {
          e.preventDefault();
          await fetch('/api/auth/logout', { method: 'POST' });
          router.push('/login');
          router.refresh();
        }}>
          <button
            type="submit"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </form>
      </div>
    </aside>
    </>
  );
}
