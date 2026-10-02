// TypeScript mirrors of the JSON produced by rust-core (`src/api.rs`).
// Field names are snake_case because they come straight from serde.
// All money is integer cents; format it for display, never do maths on it here.

export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer';
export type BudgetStatus = 'no_limit' | 'within_limit' | 'over_limit';
export type PredictionMethod = 'no_data' | 'average' | 'linear_regression';

export interface Transaction {
  id: number;
  source_type: 'manual' | 'revolut';
  transaction_type: TransactionType;
  amount_cents: number;
  currency: string;
  description: string;
  occurred_at: number; // Unix seconds
  income_source_id: number | null;
  expense_category_id: number | null;
  external_id: string | null;
  revolut_account_id: number | null;
  merchant_name: string | null;
  raw_description: string | null;
  revolut_category: string | null;
  status: 'pending' | 'completed' | 'reverted' | 'failed';
  completed_at: number | null;
  exclude_from_totals: boolean;
  created_at: number;
  updated_at: number;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface IncomeSource {
  id: number;
  name: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface BudgetMonth {
  id: number;
  month: string; // YYYY-MM
  currency: string;
  spending_limit_cents: number | null;
  savings_target_cents: number | null;
  created_at: number;
  updated_at: number;
}

export interface CategoryBudget {
  id: number;
  budget_month_id: number;
  expense_category_id: number;
  limit_cents: number;
  created_at: number;
  updated_at: number;
}

export interface CategoryStatus {
  category_id: number | null; // null = "Uncategorised"
  name: string;
  icon: string | null;
  color: string | null;
  spent_cents: number;
  limit_cents: number | null;
  remaining_cents: number | null;
  status: BudgetStatus;
}

export interface MonthlySummary {
  month: string;
  currency: string;
  income_cents: number;
  spent_cents: number;
  net_cents: number;
  spending_limit_cents: number | null;
  remaining_cents: number | null;
  savings_target_cents: number | null;
  savings_target_met: boolean | null;
  status: BudgetStatus;
  /** From Settings; null if never set. */
  expected_income_cents: number | null;
  /** The larger of actual and expected income. */
  income_basis_cents: number;
  /** income_basis_cents − spent_cents. */
  left_cents: number;
  category_limits_total_cents: number;
  /** Spending in categories that have a limit. */
  budgeted_spent_cents: number;
  unbudgeted_spent_cents: number;
  categories: CategoryStatus[];
}

export interface CategoryBreakdown {
  category_id: number | null;
  name: string;
  color: string | null;
  spent_cents: number;
  percentage: number; // 0-100
}

export interface MonthSpending {
  month: string;
  spent_cents: number;
}

export interface Prediction {
  month: string;
  predicted_spent_cents: number;
  method: PredictionMethod;
  months_used: number;
}

// ----- Inputs: raw form values; Rust validates and parses them -----

export interface NewTransactionInput {
  transaction_type: TransactionType;
  amount: string; // as typed, e.g. "12.50"
  currency: string;
  description: string;
  date: string; // YYYY-MM-DD
  expense_category_id?: number | null;
  income_source_id?: number | null;
}

export interface NewCategoryInput {
  name: string;
  icon?: string | null;
  color?: string | null; // #RRGGBB
}

export interface NewIncomeSourceInput {
  name: string;
}

export interface MonthBudgetInput {
  month: string;
  currency: string;
  spending_limit?: string | null; // blank clears it
  savings_target?: string | null;
}

export interface CategoryBudgetInput {
  month: string;
  currency: string;
  expense_category_id: number;
  limit: string;
}

export interface CategoryBudgetKey {
  month: string;
  currency: string;
  expense_category_id: number;
}

export interface UpdateTransactionInput extends NewTransactionInput {
  id: number;
}

// ----- Settings & onboarding -----

export interface Settings {
  currency: string;
  display_name: string | null;
  monthly_income_cents: number | null;
  income_source_id: number | null;
  income_source_name: string | null;
  warning_threshold_percent: number;
  onboarding_completed: boolean;
}

/** Fields left out are unchanged; blank display_name / monthly_income clears them. */
export interface UpdateSettingsInput {
  currency?: string;
  display_name?: string;
  monthly_income?: string;
  income_source_id?: number;
  warning_threshold_percent?: number;
}

export interface OnboardingCategory {
  name: string;
  icon?: string | null;
}

export interface OnboardingInput {
  currency: string;
  today: string; // YYYY-MM-DD
  display_name?: string | null;
  monthly_income?: string | null;
  income_source_name?: string | null;
  budget_category?: OnboardingCategory | null;
  monthly_limit?: string | null;
  first_transaction?: {
    transaction_type: 'expense' | 'income';
    amount: string;
    description: string;
    date: string;
    category?: OnboardingCategory | null;
  } | null;
}

// ----- Errors -----

export type ErrorKind = 'validation' | 'not_found' | 'invalid_request' | 'database' | 'bridge_unavailable';

export interface ErrorBody {
  kind: ErrorKind;
  field?: string; // set for validation errors: the form field to highlight
  message: string; // safe to show to the user
}
