import {
  Bus,
  Film,
  GraduationCap,
  HeartPulse,
  House,
  Plane,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

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
  icon: LucideIcon;
  /** Lucide icon name, stored on the expense category in rust-core. */
  iconName: string;
}

export const starterCategories: StarterCategory[] = [
  { name: 'Groceries', icon: ShoppingCart, iconName: 'shopping-cart' },
  { name: 'Food & Dining', icon: Utensils, iconName: 'utensils' },
  { name: 'Transport', icon: Bus, iconName: 'bus' },
  { name: 'Shopping', icon: ShoppingBag, iconName: 'shopping-bag' },
  { name: 'Housing', icon: House, iconName: 'house' },
  { name: 'Bills', icon: Zap, iconName: 'zap' },
  { name: 'Entertainment', icon: Film, iconName: 'film' },
  { name: 'Subscriptions', icon: Repeat, iconName: 'repeat' },
  { name: 'Health', icon: HeartPulse, iconName: 'heart-pulse' },
  { name: 'Travel', icon: Plane, iconName: 'plane' },
  { name: 'Education', icon: GraduationCap, iconName: 'graduation-cap' },
];

export const categoryByName = (name: string) => starterCategories.find((c) => c.name === name)!;

/**
 * Display-only formatting of an amount the user typed, e.g. "4250" → "€4,250.00".
 * Rust parses and validates the raw string; never do maths on the result.
 */
export function formatAmount(raw: string, currency: CurrencyCode) {
  const value = Number(raw || 0);
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(Number.isFinite(value) ? value : 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in local time, as rust-core expects. */
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** DD/MM/YYYY, the default display format. */
export const displayDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
