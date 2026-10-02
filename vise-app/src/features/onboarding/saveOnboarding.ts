import { addCategory, addTransaction, listCategories, setCategoryBudget, ViseError } from '../../services/viseCore';
import type { ExpenseCategory, TransactionType } from '../../services/types';
import { categoryByName, isoDate, type CurrencyCode } from './data';

export interface OnboardingAnswers {
  currency: CurrencyCode;
  monthlyIncome: string;
  budgetCategory: string;
  monthlyLimit: string;
  transaction: {
    type: Extract<TransactionType, 'expense' | 'income'>;
    amount: string;
    description: string;
    category: string;
    date: Date;
  } | null;
}

/** Finds the category by name, creating it the first time it is used. */
async function ensureCategory(name: string, existing: ExpenseCategory[]) {
  const found = existing.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  const created = await addCategory({ name, icon: categoryByName(name).iconName });
  existing.push(created);
  return created;
}

/**
 * Writes the onboarding answers through the Rust core. Rejects with a
 * `ViseError` (validation errors carry `field`) for the screen to show.
 *
 * Monthly income has no backing field in rust-core yet, so it is kept in the
 * flow's state only.
 */
export async function saveOnboarding(answers: OnboardingAnswers) {
  try {
    const today = new Date();
    const month = isoDate(today).slice(0, 7);
    const categories = await listCategories();

    if (answers.monthlyLimit) {
      const category = await ensureCategory(answers.budgetCategory, categories);
      await setCategoryBudget({
        month,
        currency: answers.currency,
        expense_category_id: category.id,
        limit: answers.monthlyLimit,
      });
    }

    const tx = answers.transaction;
    if (tx) {
      const category = tx.type === 'expense' ? await ensureCategory(tx.category, categories) : null;
      await addTransaction({
        transaction_type: tx.type,
        amount: tx.amount,
        currency: answers.currency,
        description: tx.description,
        date: isoDate(tx.date),
        expense_category_id: category?.id ?? null,
      });
    }
  } catch (error) {
    // The native bridge is not built yet (see README "Rust bridge"). Let the
    // flow complete so the screens stay usable until it lands.
    if (error instanceof ViseError && error.kind === 'bridge_unavailable') return;
    throw error;
  }
}
