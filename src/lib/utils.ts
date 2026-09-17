import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-CN', { hour12: false });
}

export function isClosed(status: string, deadline: string | Date): boolean {
  return status === 'closed' || new Date(deadline).getTime() <= Date.now();
}
