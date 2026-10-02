// The only file in the app that talks to Rust.
//
// Every call goes through one native function, `call(method, payloadJson)`,
// which forwards to `dispatch` in rust-core/src/api.rs and returns
// `{ ok: true, data }` or `{ ok: false, error }`. This file turns that
// envelope into a typed Promise that resolves with `data` or rejects with a
// `ViseError`.
//
// Screens should import from here and never parse JSON or do money maths.

import { requireOptionalNativeModule } from 'expo';

import type {
  BudgetMonth,
  CategoryBreakdown,
  CategoryBudget,
  CategoryBudgetInput,
  ErrorBody,
  ErrorKind,
  ExpenseCategory,
  IncomeSource,
  MonthBudgetInput,
  MonthlySummary,
  MonthSpending,
  NewCategoryInput,
  NewIncomeSourceInput,
  NewTransactionInput,
  Prediction,
  Transaction,
} from './types';

/** Shape of the native module. It is not built yet; see README "Rust bridge". */
interface ViseCoreNativeModule {
  call(method: string, payloadJson: string): Promise<string>;
}

const nativeModule = requireOptionalNativeModule<ViseCoreNativeModule>('ViseCore');

export class ViseError extends Error {
  readonly kind: ErrorKind;
  readonly field?: string;

  constructor(body: ErrorBody) {
    super(body.message);
    this.name = 'ViseError';
    this.kind = body.kind;
    this.field = body.field;
  }
}

type Reply<T> = { ok: true; data: T } | { ok: false; error: ErrorBody };

async function call<T>(method: string, payload: object = {}): Promise<T> {
  if (!nativeModule) {
    throw new ViseError({
      kind: 'bridge_unavailable',
      message: 'The VISE core is not available in this build.',
    });
  }
  const reply = JSON.parse(await nativeModule.call(method, JSON.stringify(payload))) as Reply<T>;
  if (!reply.ok) {
    throw new ViseError(reply.error);
  }
  return reply.data;
}

// ----- Transactions -----

export const addTransaction = (input: NewTransactionInput) =>
  call<Transaction>('addTransaction', input);

export const deleteTransaction = (id: number) => call<null>('deleteTransaction', { id });

export const listTransactions = (month: string) =>
  call<Transaction[]>('listTransactions', { month });

// ----- Categories & income sources -----

export const listCategories = () => call<ExpenseCategory[]>('listCategories');

export const addCategory = (input: NewCategoryInput) =>
  call<ExpenseCategory>('addCategory', input);

export const listIncomeSources = () => call<IncomeSource[]>('listIncomeSources');

export const addIncomeSource = (input: NewIncomeSourceInput) =>
  call<IncomeSource>('addIncomeSource', input);

// ----- Budgets -----

export const setMonthBudget = (input: MonthBudgetInput) =>
  call<BudgetMonth>('setMonthBudget', input);

export const setCategoryBudget = (input: CategoryBudgetInput) =>
  call<CategoryBudget>('setCategoryBudget', input);

// ----- Reports -----

export const getMonthlySummary = (month: string, currency: string) =>
  call<MonthlySummary>('getMonthlySummary', { month, currency });

export const getCategoryBreakdown = (month: string, currency: string) =>
  call<CategoryBreakdown[]>('getCategoryBreakdown', { month, currency });

export const getSpendingTrend = (month: string, currency: string, months: number) =>
  call<MonthSpending[]>('getSpendingTrend', { month, currency, months });

/** Predicts spending for `month` from the months before it. */
export const predictSpending = (month: string, currency: string) =>
  call<Prediction>('predictSpending', { month, currency });
