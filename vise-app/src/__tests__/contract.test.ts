import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
  CategoryStatus,
  CsvExport,
  DataOverview,
  DeletedCounts,
  ImportGroup,
  ImportMapping,
  ImportPreview,
  ImportSampleRow,
  ImportSuggestion,
  ImportStats,
  ImportSummary,
  MonthlySummary,
  ReceiptScan,
  Settings,
  TotalCandidate,
  Transaction,
} from '../services/types';

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
  theme: 'system',
  avatar: null,
};

const overview: DataOverview = {
  transactions: 0,
  categories: 0,
  income_sources: 0,
  budgets: 0,
};

const csvExport: CsvExport = { filename: 'vise-export-2026-10-04.csv', csv: '', transaction_count: 0, budget_count: 0 };

const deleted: DeletedCounts = { transactions: 0, categories: 0, income_sources: 0, budgets: 0 };

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

const importMapping: ImportMapping = {
  date: null,
  description: null,
  amount: null,
  debit: null,
  credit: null,
  transaction_type: null,
  currency: null,
  category: null,
};

const importStats: ImportStats = {
  rows_in_file: 0,
  ready: 0,
  duplicates: 0,
  skipped: 0,
  errors: 0,
  dated: 0,
  filled_from_above: 0,
  filled_from_below: 0,
  filled_with_import_date: 0,
};

const importSample: ImportSampleRow = {
  row: 2,
  date: '2026-09-01',
  date_source: 'file',
  description: 'x',
  amount_cents: 1,
  currency: 'EUR',
  transaction_type: 'expense',
  duplicate: false,
};

const importSuggestion: ImportSuggestion = { category_id: 1, name: 'Groceries', source: 'history', is_new: false };

const importGroup: ImportGroup = {
  key: 'm:lidl',
  kind: 'merchant',
  label: 'Lidl',
  rows: 1,
  total_cents: 1,
  suggestion: importSuggestion,
};

const importPreview: ImportPreview = {
  header_row: 1,
  columns: [],
  mapping: importMapping,
  date_order: 'dmy',
  date_order_ambiguous: false,
  decimal_separator: 'dot',
  decimal_ambiguous: false,
  positive_is: 'expense',
  stats: importStats,
  warnings: [],
  errors: [],
  sample: [importSample],
  groups: [importGroup],
};

const importSummary: ImportSummary = {
  inserted: 0,
  duplicates: 0,
  skipped: 0,
  error_count: 0,
  errors: [],
  filled_dates: 0,
  categorized: 0,
  categories_created: 0,
};

const totalCandidate: TotalCandidate = { amount_cents: 1, line: 'TOTAL 0.01', confidence: 'total' };

const receiptScan: ReceiptScan = {
  merchant: 'Shop',
  date: '2026-09-01',
  totals: [totalCandidate],
  currency: 'EUR',
  currency_found: false,
  suggestion: importSuggestion,
  warnings: [],
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
  it('DataOverview', () => expect(sorted(overview)).toEqual(contract.DataOverview));
  it('CsvExport', () => expect(sorted(csvExport)).toEqual(contract.CsvExport));
  it('DeletedCounts', () => expect(sorted(deleted)).toEqual(contract.DeletedCounts));
  it('ImportPreview', () => expect(sorted(importPreview)).toEqual(contract.ImportPreview));
  it('ImportMapping', () => expect(sorted(importMapping)).toEqual(contract.ImportMapping));
  it('ImportStats', () => expect(sorted(importStats)).toEqual(contract.ImportStats));
  it('ImportSampleRow', () => expect(sorted(importSample)).toEqual(contract.ImportSampleRow));
  it('ImportGroup', () => expect(sorted(importGroup)).toEqual(contract.ImportGroup));
  it('ImportSuggestion', () => expect(sorted(importSuggestion)).toEqual(contract.ImportSuggestion));
  it('ReceiptScan', () => expect(sorted(receiptScan)).toEqual(contract.ReceiptScan));
  it('TotalCandidate', () => expect(sorted(totalCandidate)).toEqual(contract.TotalCandidate));
  it('ImportSummary', () => expect(sorted(importSummary)).toEqual(contract.ImportSummary));
});
