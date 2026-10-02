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

import { invalidateData } from '../data/store';

import type {
  BudgetMonth,
  CategoryBreakdown,
  CategoryBudget,
  CategoryBudgetInput,
  CategoryBudgetKey,
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
  OnboardingInput,
  Settings,
  UpdateSettingsInput,
  UpdateTransactionInput,
  Prediction,
  Transaction,
} from './types';

/** Shape of the native module (modules/vise-core). */
interface ViseCoreNativeModule {
  call(method: string, payloadJson: string): Promise<string>;
}

/** Looked up per call, so the missing-module case can be tested. */
const nativeModule = () => requireOptionalNativeModule<ViseCoreNativeModule>('ViseCore');

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
  const native = nativeModule();
  if (!native) {
    throw new ViseError({
      kind: 'bridge_unavailable',
      message: 'The VISE core is not available in this build.',
    });
  }
  const reply = JSON.parse(await native.call(method, JSON.stringify(payload))) as Reply<T>;
  if (!reply.ok) {
    throw new ViseError(reply.error);
  }
  return reply.data;
}

/** A write: after it succeeds every screen showing stored data is told to reload. */
async function mutate<T>(method: string, payload: object): Promise<T> {
  const data = await call<T>(method, payload);
  invalidateData();
  return data;
}

// ----- Transactions -----

export const addTransaction = (input: NewTransactionInput) =>
  mutate<Transaction>('addTransaction', input);

export const updateTransaction = (input: UpdateTransactionInput) =>
  mutate<Transaction>('updateTransaction', input);

export const deleteTransaction = (id: number) => mutate<null>('deleteTransaction', { id });

export const listTransactions = (month: string) =>
  call<Transaction[]>('listTransactions', { month });

// ----- Categories & income sources -----

export const listCategories = () => call<ExpenseCategory[]>('listCategories');

export const addCategory = (input: NewCategoryInput) =>
  mutate<ExpenseCategory>('addCategory', input);

export const listIncomeSources = () => call<IncomeSource[]>('listIncomeSources');

export const addIncomeSource = (input: NewIncomeSourceInput) =>
  mutate<IncomeSource>('addIncomeSource', input);

// ----- Budgets -----

export const setMonthBudget = (input: MonthBudgetInput) =>
  mutate<BudgetMonth>('setMonthBudget', input);

export const setCategoryBudget = (input: CategoryBudgetInput) =>
  mutate<CategoryBudget>('setCategoryBudget', input);

export const deleteCategoryBudget = (input: CategoryBudgetKey) =>
  mutate<null>('deleteCategoryBudget', input);

// ----- Settings & onboarding -----

export const getSettings = () => call<Settings>('getSettings');

export const updateSettings = (input: UpdateSettingsInput) => mutate<Settings>('updateSettings', input);

/** Saves everything onboarding collected in one database transaction. */
export const completeOnboarding = (input: OnboardingInput) =>
  mutate<Settings>('completeOnboarding', input);

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
