// Wording for the "Delete all my data?" warning. Pure, so it can be unit-tested.

import type { DataOverview } from '../services/types';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lists exactly what "Delete all my data" will erase. */
export function describeErasure(overview: DataOverview): string {
  const parts = [
    count(overview.transactions, 'transaction', 'transactions'),
    count(overview.budgets, 'budget', 'budgets'),
    count(overview.categories, 'category', 'categories'),
    count(overview.income_sources, 'income source', 'income sources'),
  ];
  return `This permanently erases ${parts.join(', ')}, your name, avatar and settings from this device. It can’t be undone. Backup files you saved elsewhere are not deleted.`;
}
