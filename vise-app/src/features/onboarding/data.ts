import type { LucideIcon } from 'lucide-react-native';

import { categoryIcon, type CategoryIconName } from '../../components/CategoryIcon';
import { formatMoney } from '../../format';

export const currencies = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹' },
  { code: 'CAD', name: 'Canadian dollar', symbol: '$' },
  { code: 'AUD', name: 'Australian dollar', symbol: '$' },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF' },
] as const;

export type CurrencyCode = (typeof currencies)[number]['code'];

export const currencyByCode = (code: CurrencyCode) => currencies.find((c) => c.code === code)!;

export interface StarterCategory {
  name: string;
  /** Lucide icon name, stored on the expense category in rust-core. */
  iconName: CategoryIconName;
  icon: LucideIcon;
}

const starter = (name: string, iconName: CategoryIconName): StarterCategory => ({
  name,
  iconName,
  icon: categoryIcon(iconName),
});

export const starterCategories: StarterCategory[] = [
  starter('Groceries', 'shopping-cart'),
  starter('Food & Dining', 'utensils'),
  starter('Transport', 'bus'),
  starter('Shopping', 'shopping-bag'),
  starter('Housing', 'house'),
  starter('Bills', 'zap'),
  starter('Entertainment', 'film'),
  starter('Subscriptions', 'repeat'),
  starter('Health', 'heart-pulse'),
  starter('Travel', 'plane'),
  starter('Education', 'graduation-cap'),
];

export const categoryByName = (name: string) => starterCategories.find((c) => c.name === name)!;

/**
 * Cents for displaying an amount the user typed, e.g. "4250" → 425000.
 * Display only: Rust parses and validates the raw string that gets saved.
 */
export function typedAmountCents(raw: string) {
  const value = Number(raw || 0);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** "4250" → "€4,250.00". */
export const formatTyped = (raw: string, currency: CurrencyCode) =>
  formatMoney(typedAmountCents(raw), { currency });

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in local time, as rust-core expects. */
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** DD/MM/YYYY, the default display format. */
export const displayDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
