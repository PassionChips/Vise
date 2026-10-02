import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.hoisted(() => vi.fn());
vi.mock('../services/viseCore', () => ({ completeOnboarding: complete }));
vi.mock('../components/CategoryIcon', () => ({ categoryIcon: () => null }));

import { saveOnboarding, type OnboardingAnswers } from '../features/onboarding/saveOnboarding';

const answers = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  currency: 'GBP',
  monthlyIncome: '3000',
  budgetCategory: 'Groceries',
  monthlyLimit: '400',
  transaction: {
    type: 'expense',
    amount: '12.50',
    description: 'Milk',
    category: 'Groceries',
    date: new Date(2026, 8, 18),
  },
  ...patch,
});

describe('saveOnboarding', () => {
  beforeEach(() => {
    complete.mockReset().mockResolvedValue({});
  });

  it('sends every answer to rust-core in a single call', async () => {
    await saveOnboarding(answers());

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({
      currency: 'GBP',
      monthly_income: '3000',
      monthly_limit: '400',
      budget_category: { name: 'Groceries', icon: 'shopping-cart' },
      first_transaction: {
        transaction_type: 'expense',
        amount: '12.50',
        description: 'Milk',
        date: '2026-09-18',
        category: { name: 'Groceries' },
      },
    });
  });

  it('skipped steps are sent as null, not as made-up values', async () => {
    await saveOnboarding(answers({ monthlyIncome: '', monthlyLimit: '', transaction: null }));

    expect(complete.mock.calls[0][0]).toMatchObject({
      monthly_income: null,
      monthly_limit: null,
      budget_category: null,
      first_transaction: null,
    });
  });

  it('an income transaction carries no expense category (rust-core links it to the income source)', async () => {
    await saveOnboarding(
      answers({ transaction: { type: 'income', amount: '100', description: 'Pay', category: 'Groceries', date: new Date(2026, 8, 1) } }),
    );

    expect(complete.mock.calls[0][0].first_transaction).toMatchObject({ transaction_type: 'income', category: null });
  });

  it('propagates every failure, including an unavailable core, so onboarding is never reported complete', async () => {
    const unavailable = Object.assign(new Error('The VISE core is not available in this build.'), { kind: 'bridge_unavailable' });
    complete.mockImplementation(() => Promise.reject(unavailable));

    await expect(saveOnboarding(answers())).rejects.toBe(unavailable);
  });
});
