import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CategoryStatus, MonthlySummary, Settings, Transaction } from '../services/types';

// Typed samples: `tsc` fails if types.ts loses or gains a field these do not list, and the
// key comparison below fails if they drift from what rust-core returns (see rust-core/tests/contract.rs).
const settings: Settings = {
  currency: 'EUR',
  display_name: null,
  monthly_income_cents: null,
  income_source_id: null,
  income_source_name: null,
  warning_threshold_percent: 80,
  onboarding_completed: false,
};

const category: CategoryStatus = {
  category_id: 1,
  name: 'Groceries',
  icon: null,
  color: null,
  spent_cents: 0,
  limit_cents: null,
  remaining_cents: null,
  status: 'no_limit',
};

const summary: MonthlySummary = {
  month: '2026-09',
  currency: 'EUR',
  income_cents: 0,
  spent_cents: 0,
  net_cents: 0,
  spending_limit_cents: null,
  remaining_cents: null,
  savings_target_cents: null,
  savings_target_met: null,
  status: 'no_limit',
  expected_income_cents: null,
  income_basis_cents: 0,
  left_cents: 0,
  category_limits_total_cents: 0,
  budgeted_spent_cents: 0,
  unbudgeted_spent_cents: 0,
  categories: [category],
};

const transaction: Transaction = {
  id: 1,
  source_type: 'manual',
  transaction_type: 'expense',
  amount_cents: 1,
  currency: 'EUR',
  description: 'x',
  occurred_at: 0,
  income_source_id: null,
  expense_category_id: null,
  external_id: null,
  revolut_account_id: null,
  merchant_name: null,
  raw_description: null,
  revolut_category: null,
  status: 'completed',
  completed_at: null,
  exclude_from_totals: false,
  created_at: 0,
  updated_at: 0,
};

const contract = JSON.parse(
  readFileSync(resolve(__dirname, '../../rust-core/contracts/api-shapes.json'), 'utf8'),
) as Record<string, string[]>;

const sorted = (value: object) => Object.keys(value).sort();

describe('TypeScript types match the rust-core JSON contract', () => {
  it('Settings', () => expect(sorted(settings)).toEqual(contract.Settings));
  it('MonthlySummary', () => expect(sorted(summary)).toEqual(contract.MonthlySummary));
  it('CategoryStatus', () => expect(sorted(category)).toEqual(contract.CategoryStatus));
  it('Transaction', () => expect(sorted(transaction)).toEqual(contract.Transaction));
});
