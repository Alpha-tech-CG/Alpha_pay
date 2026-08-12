import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with a currency code appended (never a bare number — brief rule). */
export function money(amount: number, currency = 'XAF'): string {
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}
