'use client';

import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export function MainContent({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  return (
    <div className={cn('transition-all duration-300', collapsed ? 'md:pl-16' : 'md:pl-64')}>
      {children}
    </div>
  );
}
