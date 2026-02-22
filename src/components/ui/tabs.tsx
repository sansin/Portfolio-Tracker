'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex: number | null = null;
    if (e.key === 'ArrowRight') {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (newIndex !== null) {
      e.preventDefault();
      onChange(tabs[newIndex].id);
      const btn = (e.currentTarget.parentElement as HTMLElement)?.children[newIndex] as HTMLElement;
      btn?.focus();
    }
  };

  return (
    <div role="tablist" className={cn('flex gap-1 rounded-lg bg-zinc-800/50 p-1', className)}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          tabIndex={tab.id === activeTab ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-zinc-700 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-300'
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
