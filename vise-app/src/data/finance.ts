// Reads the data most screens need, for one month, from rust-core.

import {
  getMonthlySummary,
  getSettings,
  listCategories,
  listIncomeSources,
  listTransactions,
} from '../services/viseCore';
import type { ExpenseCategory, IncomeSource, MonthlySummary, Settings, Transaction } from '../services/types';
import { useCoreQuery, type Query } from './store';

export interface FinanceData {
  month: string;
  settings: Settings;
  summary: MonthlySummary;
  /** Newest first. */
  transactions: Transaction[];
  categories: ExpenseCategory[];
  sources: IncomeSource[];
}

export function useFinance(month: string): Query<FinanceData> {
  return useCoreQuery(async () => {
    const settings = await getSettings();
    const [summary, transactions, categories, sources] = await Promise.all([
      getMonthlySummary(month, settings.currency),
      listTransactions(month),
      listCategories(),
      listIncomeSources(),
    ]);
    return { month, settings, summary, transactions, categories, sources };
  }, [month]);
}

/** Expense = negative, income and refunds = positive, as the rows display them. */
export function signedAmount(t: Transaction): number {
  return t.transaction_type === 'income' || t.transaction_type === 'refund' ? t.amount_cents : -t.amount_cents;
}

export interface TransactionLabel {
  title: string;
  /** Category name for expenses, income source for income. */
  group: string;
  icon: string | null;
}

export function describeTransaction(
  t: Transaction,
  categories: ExpenseCategory[],
  sources: IncomeSource[],
): TransactionLabel {
  if (t.transaction_type === 'income') {
    const source = sources.find((s) => s.id === t.income_source_id);
    return { title: t.description, group: source?.name ?? 'Income', icon: 'briefcase' };
  }
  const category = categories.find((c) => c.id === t.expense_category_id);
  return { title: t.description, group: category?.name ?? 'Uncategorised', icon: category?.icon ?? null };
}
