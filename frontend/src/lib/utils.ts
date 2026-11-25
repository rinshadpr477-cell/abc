import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = 'ABC Ecommerce';

export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function categoryName(c: { name: string } | string): string {
  return typeof c === 'string' ? '' : c.name;
}

export function categoryId(c: { id?: string; _id?: string } | string): string {
  return typeof c === 'string' ? c : (c.id ?? c._id ?? '');
}

export function newIdempotencyKey(): string {
  return `chk-${crypto.randomUUID()}`;
}

/** True for an absolute http/https URL (mirrors the API rule; the API still validates). */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}
