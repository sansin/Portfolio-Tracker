'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Briefcase, ArrowLeftRight, Eye, MoreHorizontal, Upload, Sparkles, Settings, LogOut, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { useRouter } from 'next/navigation';

const tabs = [
  { name: 'Analytics', href: ROUTES.ANALYTICS, icon: BarChart3 },
  { name: 'Portfolios', href: ROUTES.PORTFOLIOS, icon: Briefcase },
  { name: 'Transactions', href: ROUTES.TRANSACTIONS, icon: ArrowLeftRight },
  { name: 'Watchlist', href: ROUTES.WATCHLIST, icon: Eye },
];

const moreItems = [
  { name: 'Import', href: ROUTES.IMPORT, icon: Upload },
  { name: 'AI Insights', href: ROUTES.INSIGHTS, icon: Sparkles },
  { name: 'Settings', href: ROUTES.SETTINGS, icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showMore, setShowMore] = React.useState(false);

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className="absolute bottom-16 left-2 right-2 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-2 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 mb-1">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">More</span>
              <button onClick={() => setShowMore(false)} className="p-1 rounded-md text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            {moreItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-300 hover:bg-zinc-800'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors mt-1"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md safe-area-pb" aria-label="Mobile navigation">
        <div className="flex items-stretch justify-around h-16">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors min-w-0 relative',
                  isActive ? 'text-indigo-400' : 'text-zinc-500'
                )}
              >
                <tab.icon className={cn('h-5 w-5', isActive && 'text-indigo-400')} />
                <span className="truncate">{tab.name}</span>
                {isActive && <div className="absolute top-0 w-8 h-0.5 rounded-full bg-indigo-400" />}
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors min-w-0 relative',
              showMore ? 'text-indigo-400' : 'text-zinc-500'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
