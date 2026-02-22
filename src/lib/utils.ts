import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Math.round(value)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getChangeColor(value: number): string {
  if (value > 0) return 'text-emerald-500';
  if (value < 0) return 'text-red-500';
  return 'text-zinc-400';
}

export function getChangeBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 text-emerald-500';
  if (value < 0) return 'bg-red-500/10 text-red-500';
  return 'bg-zinc-500/10 text-zinc-400';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  // Remove trailing zeros after decimal
  return parseFloat(value.toFixed(4)).toString();
}

export function generateId(): string {
  return crypto.randomUUID();
}
