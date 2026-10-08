// The logic behind the calendars: the month grid, per-day totals and spending levels.
// Pure functions (no React), so every rule can be tested.

import type { Transaction } from '../services/types';
import { isoFromUnix } from '../format';

/** Which weekday a week starts on: 1 = Monday (the default), 0 = Sunday. */
export type WeekStart = 0 | 1;

const pad = (n: number) => String(n).padStart(2, '0');

export const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** "2026-10-08" → [2026, 10, 8]. */
export const parseIso = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
};

export const monthOf = (date: string) => date.slice(0, 7);

export function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** YYYY-MM moved by whole years, keeping the month (2026-10 → 2025-10). */
export function shiftYear(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  return `${year + delta}-${pad(m)}`;
}

/** The same month number in another year. */
export const withYear = (month: string, year: number) => `${year}-${month.slice(5, 7)}`;
/** The same year with another month number (1 to 12). */
export const withMonth = (month: string, m: number) => `${month.slice(0, 4)}-${pad(m)}`;

/** The weekday of a date, 0 = Sunday. */
export const weekday = (date: string) => {
  const [y, m, d] = parseIso(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayLabels(weekStart: WeekStart = 1): string[] {
  return [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];
}

export interface DayCell {
  /** YYYY-MM-DD. */
  date: string;
  day: number;
}

/** The month as rows of 7: `null` pads the first and last week. */
export function monthGrid(month: string, weekStart: WeekStart = 1): (DayCell | null)[][] {
  const [year, m] = month.split('-').map(Number);
  const lead = (weekday(toIso(year, m, 1)) - weekStart + 7) % 7;
  const cells: (DayCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(month); day += 1) cells.push({ date: toIso(year, m, day), day });
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

// ----- Totals -----

export interface Totals {
  income: number;
  spent: number;
  /** income − spent. */
  net: number;
  count: number;
}

/**
 * Income and spending of a set of transactions, by the same rules as rust-core
 * (`calculations/totals.rs`): only the given currency; excluded, failed and reverted rows
 * are skipped; a refund reduces spending; a transfer is ignored.
 */
export function periodTotals(transactions: Transaction[], currency: string): Totals {
  let income = 0;
  let spent = 0;
  let count = 0;
  for (const t of transactions) {
    count += 1;
    if (t.currency !== currency || t.exclude_from_totals) continue;
    if (t.status !== 'completed' && t.status !== 'pending') continue;
    if (t.transaction_type === 'income') income += t.amount_cents;
    else if (t.transaction_type === 'expense') spent += t.amount_cents;
    else if (t.transaction_type === 'refund') spent -= t.amount_cents;
  }
  return { income, spent, net: income - spent, count };
}

export interface DayInfo extends Totals {
  date: string;
}

/** Totals for every day that has activity, by the date the transaction happened (not when it was entered). */
export function dayTotals(transactions: Transaction[], currency: string): Record<string, DayInfo> {
  const byDay = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const date = isoFromUnix(t.occurred_at);
    byDay.set(date, [...(byDay.get(date) ?? []), t]);
  }
  const out: Record<string, DayInfo> = {};
  for (const [date, list] of byDay) out[date] = { date, ...periodTotals(list, currency) };
  return out;
}

// ----- Levels -----

/** How a day's spending reads at a glance. */
export type DayLevel = 'none' | 'under' | 'low' | 'mid' | 'high';

/**
 * Where a day's spending sits:
 * - with a monthly limit, against the daily allowance (limit ÷ days): within it is `under` (healthy),
 *   up to half as much again is `mid`, beyond that `high`;
 * - without a limit, against the month's biggest day: a third, two thirds, or more.
 */
export function dayLevel(spent: number, allowance: number | null, biggestDay: number): DayLevel {
  if (spent <= 0) return 'none';
  if (allowance != null && allowance > 0) {
    if (spent <= allowance) return 'under';
    return spent <= allowance * 1.5 ? 'mid' : 'high';
  }
  const ratio = biggestDay > 0 ? spent / biggestDay : 1;
  return ratio < 1 / 3 ? 'low' : ratio < 2 / 3 ? 'mid' : 'high';
}

/** The monthly limit spread over the days of the month, or null if there is no limit. */
export function dailyAllowance(spendingLimitCents: number | null, month: string): number | null {
  return spendingLimitCents != null && spendingLimitCents > 0 ? spendingLimitCents / daysInMonth(month) : null;
}

/** Fits in a calendar cell: 24 → "€24", 1234 → "€1.2k", 12,500 → "€13k". Whole currency units, no cents. */
export function compactMoney(cents: number, symbol: string): string {
  const units = Math.round(Math.abs(cents) / 100);
  if (units < 1000) return `${symbol}${units}`;
  if (units < 10_000) return `${symbol}${(units / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${symbol}${Math.round(units / 1000)}k`;
}

/** "Fri 25 Sep" style label for a date. */
export function dayLabel(date: string): string {
  const [y, m, d] = parseIso(date);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[weekday(date)]} ${d} ${months[m - 1]}${y === new Date().getFullYear() ? '' : ` ${y}`}`;
}

/** A date moved by whole days (works across months and years). */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = parseIso(date);
  const moved = new Date(Date.UTC(y, m - 1, d + delta));
  return toIso(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** True for a real YYYY-MM-DD date (rejects 2026-02-30). */
export function isRealDate(date: string | undefined | null): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = parseIso(date);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(`${y}-${pad(m)}`);
}

// ----- The swipeable month range and the wheels -----

/** The calendar can be swiped between these months (2100 is far enough for a future date). */
export const FIRST_MONTH = '1990-01';
export const LAST_MONTH = '2100-12';
export const FIRST_YEAR = 1990;
export const LAST_YEAR = 2100;
export const MONTH_COUNT = (2100 - 1990 + 1) * 12;

/** Position of a month in the swipeable range (0 = January 1990). Clamped, so any month maps somewhere. */
export function monthIndex(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return Math.min(MONTH_COUNT - 1, Math.max(0, (year - FIRST_YEAR) * 12 + (m - 1)));
}

/** The month at a position in the swipeable range. */
export function monthAt(index: number): string {
  const i = Math.min(MONTH_COUNT - 1, Math.max(0, Math.round(index)));
  return `${FIRST_YEAR + Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

/** Which row of a wheel is under the selection band, given the scroll offset. Clamped to the rows that exist. */
export function wheelIndex(offset: number, rowHeight: number, rows: number): number {
  return Math.min(rows - 1, Math.max(0, Math.round(offset / rowHeight)));
}

/** The month before or after, but never outside the swipeable range. */
export function neighbourMonths(month: string): string[] {
  const i = monthIndex(month);
  return [i - 1, i, i + 1].filter((n) => n >= 0 && n < MONTH_COUNT).map(monthAt);
}

/**
 * Which day is at a vertical position in the list. `days` are the day groups in list order with where each
 * starts; the answer is the last one that starts at or above `line`, or null if none has yet.
 */
export function dayAtOffset(days: { date: string; offset: number | undefined }[], line: number): string | null {
  let found: string | null = null;
  for (const day of days) {
    if (day.offset === undefined || day.offset > line) break;
    found = day.date;
  }
  return found;
}
