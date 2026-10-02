import { completeOnboarding } from '../../services/viseCore';
import type { TransactionType } from '../../services/types';
import { categoryByName, isoDate, type CurrencyCode } from './data';
import { todayIso } from '../../format';

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

const category = (name: string) => ({ name, icon: categoryByName(name).iconName });

/**
 * Sends every onboarding answer to rust-core in ONE call, which saves them in a single
 * database transaction and marks onboarding complete only if all of it was written.
 * Rejects with a `ViseError` (validation errors carry `field`) for the flow to show;
 * there is no fallback, so a failure is never reported as success.
 *
 * Income is stored as the expected monthly income plus an income source ("Salary"), and
 * an income first-transaction is linked to that same source. Retrying after success is
 * harmless: rust-core ignores a second completion.
 */
export async function saveOnboarding(answers: OnboardingAnswers) {
  const tx = answers.transaction;
  await completeOnboarding({
    currency: answers.currency,
    today: todayIso(),
    monthly_income: answers.monthlyIncome || null,
    budget_category: answers.monthlyLimit ? category(answers.budgetCategory) : null,
    monthly_limit: answers.monthlyLimit || null,
    first_transaction: tx
      ? {
          transaction_type: tx.type,
          amount: tx.amount,
          description: tx.description,
          date: isoDate(tx.date),
          category: tx.type === 'expense' ? category(tx.category) : null,
        }
      : null,
  });
}
