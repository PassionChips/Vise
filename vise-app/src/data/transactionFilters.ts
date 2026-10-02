// Filtering and sorting for the Transactions screen. Pure functions, unit-tested.
//
// Type rules follow rust-core's budget rules (README › Budget rules):
// - "Expenses" = expenses and refunds (a refund reduces spending in its category)
// - "Income"   = income
// - transfers move money between your own accounts, so they only appear under "All"

import type { Transaction, TransactionType } from '../services/types';

export const TYPE_FILTERS = ['All', 'Expenses', 'Income'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export const SORT_ORDERS = ['newest', 'oldest', 'largest', 'smallest'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest amount',
  smallest: 'Smallest amount',
};

export interface TransactionFilters {
  type: TypeFilter;
  /** Expense categories to include; `null` = Uncategorised. Empty = no category filter. */
  categoryIds: (number | null)[];
  /** Income sources to include; `null` = no source. Empty = no source filter. */
  sourceIds: (number | null)[];
  sort: SortOrder;
}

export const DEFAULT_FILTERS: TransactionFilters = { type: 'All', categoryIds: [], sourceIds: [], sort: 'newest' };

const SPENDING: TransactionType[] = ['expense', 'refund'];

export function matchesType(t: Transaction, type: TypeFilter): boolean {
  if (type === 'Expenses') return SPENDING.includes(t.transaction_type);
  if (type === 'Income') return t.transaction_type === 'income';
  return true;
}

/**
 * Category and source choices narrow their own kind of transaction. With
 * both set, a row shows if it matches either (an expense in a chosen
 * category, or income from a chosen source).
 */
export function matchesGroups(t: Transaction, filters: TransactionFilters): boolean {
  const byCategory = filters.categoryIds.length > 0;
  const bySource = filters.sourceIds.length > 0;
  if (!byCategory && !bySource) return true;
  const inCategory = byCategory && SPENDING.includes(t.transaction_type) && filters.categoryIds.includes(t.expense_category_id);
  const inSource = bySource && t.transaction_type === 'income' && filters.sourceIds.includes(t.income_source_id);
  return inCategory || inSource;
}

/** Filters (type, groups, search text) then sorts. `searchText` gets the label for a row. */
export function applyTransactionFilters(
  list: readonly Transaction[],
  filters: TransactionFilters,
  search: string,
  searchText: (t: Transaction) => string,
): Transaction[] {
  const needle = search.trim().toLowerCase();
  const matching = list.filter(
    (t) =>
      matchesType(t, filters.type) &&
      matchesGroups(t, filters) &&
      (!needle || searchText(t).toLowerCase().includes(needle)),
  );
  return sortTransactions(matching, filters.sort);
}

export function sortTransactions(list: readonly Transaction[], order: SortOrder): Transaction[] {
  const byDate = (a: Transaction, b: Transaction) => a.occurred_at - b.occurred_at || a.id - b.id;
  const byAmount = (a: Transaction, b: Transaction) => a.amount_cents - b.amount_cents || byDate(a, b);
  const sorted = [...list];
  switch (order) {
    case 'newest':
      return sorted.sort((a, b) => byDate(b, a));
    case 'oldest':
      return sorted.sort(byDate);
    case 'largest':
      return sorted.sort((a, b) => byAmount(b, a));
    case 'smallest':
      return sorted.sort(byAmount);
  }
}

/** Number of choices in the "More filters" sheet that differ from the defaults. */
export function activeFilterCount(filters: TransactionFilters): number {
  return filters.categoryIds.length + filters.sourceIds.length + (filters.sort === DEFAULT_FILTERS.sort ? 0 : 1);
}

/** Adds or removes `value` (immutable). */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Amount orders show a flat list; date orders group rows by day. */
export const groupsByDay = (order: SortOrder) => order === 'newest' || order === 'oldest';
