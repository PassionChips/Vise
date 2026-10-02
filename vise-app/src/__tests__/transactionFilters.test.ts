import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applyTransactionFilters,
  DEFAULT_FILTERS,
  groupsByDay,
  matchesType,
  toggle,
  type TransactionFilters,
} from '../data/transactionFilters';
import type { Transaction, TransactionType } from '../services/types';

let nextId = 1;
function tx(type: TransactionType, amount: number, day: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId++,
    source_type: 'manual',
    transaction_type: type,
    amount_cents: amount,
    currency: 'EUR',
    description: `${type} ${amount}`,
    occurred_at: Date.UTC(2026, 8, day) / 1000,
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
    ...extra,
  };
}

const GROCERIES = 1;
const TRANSPORT = 2;
const SALARY = 10;

const lunch = tx('expense', 1250, 3, { expense_category_id: GROCERIES, description: 'Tesco lunch' });
const bus = tx('expense', 300, 5, { expense_category_id: TRANSPORT, description: 'Bus' });
const refund = tx('refund', 500, 6, { expense_category_id: GROCERIES, description: 'Refund' });
const pay = tx('income', 400000, 1, { income_source_id: SALARY, description: 'Pay' });
const gift = tx('income', 5000, 7, { description: 'Gift' });
const transfer = tx('transfer', 10000, 8, { description: 'To savings' });
const loose = tx('expense', 999, 9, { description: 'Uncategorised thing' });
const all = [lunch, bus, refund, pay, gift, transfer, loose];

const run = (filters: Partial<TransactionFilters>, search = '') =>
  applyTransactionFilters(all, { ...DEFAULT_FILTERS, ...filters }, search, (t) => t.description).map((t) => t.id);

describe('type chips follow the budget rules', () => {
  it('Expenses = expenses and refunds; Income = income; transfers only under All', () => {
    expect(all.filter((t) => matchesType(t, 'Expenses'))).toEqual([lunch, bus, refund, loose]);
    expect(all.filter((t) => matchesType(t, 'Income'))).toEqual([pay, gift]);
    expect(all.filter((t) => matchesType(t, 'All'))).toHaveLength(all.length);
  });
});

describe('more filters', () => {
  it('no extra filters shows everything, newest first', () => {
    expect(run({})).toEqual([loose, transfer, gift, refund, bus, lunch, pay].map((t) => t.id));
  });

  it('categories keep only spending in those categories (refunds included)', () => {
    expect(run({ categoryIds: [GROCERIES] })).toEqual([refund.id, lunch.id]);
  });

  it('null selects uncategorised spending', () => {
    expect(run({ categoryIds: [null] })).toEqual([loose.id]);
  });

  it('income sources keep only income from those sources', () => {
    expect(run({ sourceIds: [SALARY] })).toEqual([pay.id]);
    expect(run({ sourceIds: [null] })).toEqual([gift.id]);
  });

  it('categories and sources together show either kind', () => {
    expect(run({ categoryIds: [TRANSPORT], sourceIds: [SALARY] })).toEqual([bus.id, pay.id]);
  });

  it('combines with the type chip and the search box', () => {
    expect(run({ type: 'Income', categoryIds: [GROCERIES] })).toEqual([]);
    expect(run({ type: 'Expenses' }, 'TESCO')).toEqual([lunch.id]);
  });

  it('sorts by date or amount', () => {
    expect(run({ sort: 'oldest' })[0]).toBe(pay.id);
    expect(run({ sort: 'largest' }).slice(0, 2)).toEqual([pay.id, transfer.id]);
    expect(run({ sort: 'smallest' })[0]).toBe(bus.id);
  });

  it('does not change the list it was given', () => {
    const copy = [...all];
    run({ sort: 'largest', categoryIds: [GROCERIES] });
    expect(all).toEqual(copy);
  });
});

describe('filter helpers', () => {
  it('counts only the choices made in the sheet', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, type: 'Income' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: 'largest', categoryIds: [1, null], sourceIds: [3] })).toBe(4);
  });

  it('toggles values immutably', () => {
    const start = [1, 2];
    expect(toggle(start, 3)).toEqual([1, 2, 3]);
    expect(toggle(start, 1)).toEqual([2]);
    expect(start).toEqual([1, 2]);
  });

  it('groups by day only for date orders', () => {
    expect(groupsByDay('newest')).toBe(true);
    expect(groupsByDay('oldest')).toBe(true);
    expect(groupsByDay('largest')).toBe(false);
  });
});
