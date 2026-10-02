// Display formatting for integer-cent amounts. Formatting only: totals and
// budget maths come from rust-core.

const MINUS = '−'; // typographic minus, as used in the design

const SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$', INR: '₹', CAD: '$', AUD: '$' };

export interface MoneyOptions {
  currency?: string;
  /** 'auto' prefixes negatives with −; 'always' also prefixes positives with +. */
  sign?: 'auto' | 'always' | 'never';
  /** Drop the cents, e.g. €3,070. */
  whole?: boolean;
}

export function formatMoney(cents: number, options: MoneyOptions = {}): string {
  const { currency = 'EUR', sign = 'auto', whole = false } = options;
  const abs = Math.abs(cents);
  const units = whole ? Math.round(abs / 100) : Math.floor(abs / 100);
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = whole ? grouped : `${grouped}.${String(abs % 100).padStart(2, '0')}`;
  const symbol = SYMBOLS[currency] ?? `${currency} `;

  let prefix = '';
  if (sign !== 'never') {
    if (cents < 0) prefix = MINUS;
    else if (sign === 'always' && cents > 0) prefix = '+';
  }
  return `${prefix}${symbol}${body}`;
}

/** Signed whole percentage, e.g. +22% / −31%. */
export function formatSignedPercent(value: number): string {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${MINUS}${Math.abs(value)}%`;
  return '0%';
}

/** spent / limit as a whole, uncapped percentage (e.g. 108). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

/** "Today · Thu 18 Sep", "Yesterday · Wed 17 Sep", "Mon 15 Sep". */
export function formatDayHeader(date: string, today: string): string {
  const d = parseDate(date);
  const label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const diff = daysBetween(today, date);
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Yesterday · ${label}`;
  return label;
}

/** "Today, 18 Sep" or "17 Sep". */
export function formatShortDate(date: string, today: string): string {
  const d = parseDate(date);
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return daysBetween(today, date) === 0 ? `Today, ${label}` : label;
}

// ----- Dates (local time) and amounts -----

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD in local time. */
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** The current month as YYYY-MM. */
export const currentMonth = () => todayIso().slice(0, 7);

/** YYYY-MM moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09" → "September 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/** "2026-09" → "Sep". */
export const monthShort = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1].slice(0, 3);

/** Days remaining in `month` after today, or 0 for a past month. */
export function daysLeftInMonth(month: string): number {
  const today = todayIso();
  if (today.slice(0, 7) !== month) return 0;
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate() - Number(today.slice(8, 10));
}

/** Unix seconds (stored at UTC midnight) → YYYY-MM-DD. */
export const isoFromUnix = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** 1250 → "12.50", the form rust-core accepts back. */
export const centsToAmount = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
