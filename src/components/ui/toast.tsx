'use client';

import * as React from 'react';
import { create } from 'zustand';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function toast(type: Toast['type'], title: string, description?: string) {
  useToastStore.getState().addToast({ type, title, description });
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'border-emerald-500/30 bg-emerald-500/5',
  error: 'border-red-500/30 bg-red-500/5',
  info: 'border-indigo-500/30 bg-indigo-500/5',
};

const iconStyles = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-indigo-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <ToastItem key={t.id} toast={t} icon={<Icon className={cn('h-5 w-5', iconStyles[t.type])} />} style={styles[t.type]} onClose={() => removeToast(t.id)} />
        );
      })}
    </div>
  );
}

function ToastItem({ toast: t, icon, style, onClose }: { toast: Toast; icon: React.ReactNode; style: string; onClose: () => void }) {
  React.useEffect(() => {
    const timeout = setTimeout(onClose, 5000);
    return () => clearTimeout(timeout);
  }, [onClose]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full duration-300',
        style
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100">{t.title}</p>
        {t.description && <p className="text-xs text-zinc-400 mt-0.5">{t.description}</p>}
      </div>
      <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
