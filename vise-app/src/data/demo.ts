// Demo data shown until the native Rust bridge exists (see README "Rust bridge").
// Figures match the Figma "2 · Main app (tabs)" frames and are internally consistent
// (category spend adds up to the month total, etc.). All money is integer cents.
//
// Shapes follow src/services/types.ts where one exists, so screens can switch
// to viseCore calls without changing their props.

import type { CategoryBreakdown, CategoryStatus, MonthSpending } from '../services/types';
import type { CategoryIconName } from '../components/CategoryIcon';

export const DEMO_TODAY = '2026-09-18';
export const CURRENCY = 'EUR';

export const user = { name: 'Aoife Murphy', firstName: 'Aoife', email: 'aoife@example.com' };

export const month = { label: 'September 2026', daysLeft: 12 };

export const summary = {
  income_cents: 425_000,
  spent_cents: 218_460,
  remaining_cents: 206_540,
  predicted_cents: 312_000,
  income_change_percent: 4,
  previous_month_name: 'August',
  transaction_count: 23,
};

// ----- Dashboard: weekly spending -----

export interface WeekSpending {
  label: string;
  spent_cents: number;
  predicted: boolean;
}

export const weeklySpending: WeekSpending[] = [
  { label: 'W1', spent_cents: 61_140, predicted: false },
  { label: 'W2', spent_cents: 86_410, predicted: false },
  { label: 'W3', spent_cents: 70_910, predicted: false },
  { label: 'W4', spent_cents: 52_170, predicted: true },
  { label: 'W5', spent_cents: 41_570, predicted: true },
];

export const weeklySpendingSummary =
  '€2,184.60 spent in 3 weeks — €186 less than this point in August. Weeks 4–5 are estimates.';

// ----- Budgets -----

export type DemoCategoryStatus = CategoryStatus & { icon: CategoryIconName; limit_cents: number };

export const categoryBudgets: DemoCategoryStatus[] = [
  { category_id: 1, name: 'Shopping', icon: 'shopping-bag', color: null, spent_cents: 32_530, limit_cents: 30_000, remaining_cents: -2_530, status: 'over_limit' },
  { category_id: 2, name: 'Food & Dining', icon: 'utensils', color: null, spent_cents: 35_200, limit_cents: 40_000, remaining_cents: 4_800, status: 'within_limit' },
  { category_id: 3, name: 'Bills', icon: 'zap', color: null, spent_cents: 48_000, limit_cents: 70_000, remaining_cents: 22_000, status: 'within_limit' },
  { category_id: 4, name: 'Groceries', icon: 'shopping-cart', color: null, spent_cents: 31_040, limit_cents: 50_000, remaining_cents: 18_960, status: 'within_limit' },
  { category_id: 5, name: 'Transport', icon: 'bus', color: null, spent_cents: 8_420, limit_cents: 15_000, remaining_cents: 6_580, status: 'within_limit' },
  { category_id: 6, name: 'Entertainment', icon: 'film', color: null, spent_cents: 4_500, limit_cents: 12_000, remaining_cents: 7_500, status: 'within_limit' },
];

/** Categories pinned to the Dashboard, in display order. */
export const dashboardBudgetIds = [4, 2, 1];

export const budgetOverview = {
  budget_cents: 217_000,
  spent_cents: 159_690,
  left_cents: 57_310,
  unbudgeted_spent_cents: 58_770,
};

/** Settings › Budgets › Warning threshold. */
export const warningThresholdPercent = 80;

// ----- Transactions -----

export interface DemoTransaction {
  id: number;
  title: string;
  category: string;
  icon: CategoryIconName;
  /** Time of day or payment method, shown after the category on the Transactions tab. */
  detail: string;
  date: string; // YYYY-MM-DD
  amount_cents: number; // signed: income positive, expense negative
}

export const transactions: DemoTransaction[] = [
  { id: 1, title: 'Tesco Express', category: 'Groceries', icon: 'shopping-cart', detail: '14:20', date: '2026-09-18', amount_cents: -4_280 },
  { id: 2, title: 'Dublin Bus', category: 'Transport', icon: 'bus', detail: '08:12', date: '2026-09-18', amount_cents: -260 },
  { id: 3, title: 'Netflix', category: 'Subscriptions', icon: 'repeat', detail: 'Card', date: '2026-09-17', amount_cents: -1_399 },
  { id: 4, title: 'Bread 41', category: 'Food & Dining', icon: 'utensils', detail: '12:45', date: '2026-09-17', amount_cents: -4_750 },
  { id: 5, title: 'Arnotts', category: 'Shopping', icon: 'shopping-bag', detail: '16:02', date: '2026-09-15', amount_cents: -12_530 },
  { id: 6, title: 'Salary — Acme Ltd', category: 'Salary', icon: 'briefcase', detail: 'Bank transfer', date: '2026-09-01', amount_cents: 425_000 },
  { id: 7, title: 'Rent — September', category: 'Housing', icon: 'house', detail: 'Standing order', date: '2026-09-01', amount_cents: -55_000 },
];

/** Transaction ids shown under "Recent transactions" on the Dashboard. */
export const recentTransactionIds = [1, 2, 3, 6];

// ----- Reports -----

export const reportPeriod = {
  label: 'APR – SEP 2026',
  months: 6,
  income_cents: 2_520_000,
  kept_cents: 766_540,
  average_spent_cents: 307_000,
  average_range: 'Apr–Aug',
  in_progress_month: 'September',
};

export type MonthIncomeExpense = MonthSpending & { label: string; income_cents: number; in_progress: boolean };

export const incomeVsExpenses: MonthIncomeExpense[] = [
  { month: '2026-04', label: 'Apr', income_cents: 410_000, spent_cents: 304_000, in_progress: false },
  { month: '2026-05', label: 'May', income_cents: 410_000, spent_cents: 289_000, in_progress: false },
  { month: '2026-06', label: 'Jun', income_cents: 425_000, spent_cents: 330_300, in_progress: false },
  { month: '2026-07', label: 'Jul', income_cents: 425_000, spent_cents: 296_500, in_progress: false },
  { month: '2026-08', label: 'Aug', income_cents: 425_000, spent_cents: 315_200, in_progress: false },
  { month: '2026-09', label: 'Sep', income_cents: 425_000, spent_cents: 218_460, in_progress: true },
];

export type DemoBreakdown = CategoryBreakdown & { icon: CategoryIconName };

export const categoryBreakdown: DemoBreakdown[] = [
  { category_id: 7, name: 'Housing', icon: 'house', color: null, spent_cents: 55_000, percentage: 25 },
  { category_id: 3, name: 'Bills', icon: 'zap', color: null, spent_cents: 48_000, percentage: 22 },
  { category_id: 2, name: 'Food & Dining', icon: 'utensils', color: null, spent_cents: 35_200, percentage: 16 },
  { category_id: 1, name: 'Shopping', icon: 'shopping-bag', color: null, spent_cents: 32_530, percentage: 15 },
  { category_id: 4, name: 'Groceries', icon: 'shopping-cart', color: null, spent_cents: 31_040, percentage: 14 },
  { category_id: null, name: 'Other', icon: 'circle-dot', color: null, spent_cents: 16_690, percentage: 8 },
];

export const monthOverMonth = {
  compared_with: 'August',
  day_of_month: 18,
  rows: [
    { name: 'Food & Dining', change_cents: 6_400, change_percent: 22 },
    { name: 'Shopping', change_cents: 9_130, change_percent: 39 },
    { name: 'Transport', change_cents: -3_840, change_percent: -31 },
  ],
};

// ----- Goals -----

export interface DemoGoal {
  id: number;
  name: string;
  icon: CategoryIconName;
  subtitle: string;
  saved_cents: number;
  target_cents: number;
}

export const goals: DemoGoal[] = [
  { id: 1, name: 'Emergency fund', icon: 'piggy-bank', subtitle: 'Target · March 2027', saved_cents: 325_000, target_cents: 500_000 },
  { id: 2, name: 'Lisbon trip', icon: 'piggy-bank', subtitle: 'Target · May 2027 · about €50/week to stay on track', saved_cents: 116_000, target_cents: 280_000 },
  { id: 3, name: 'New laptop', icon: 'briefcase', subtitle: 'Reached 2 Sep 2026', saved_cents: 120_000, target_cents: 120_000 },
];
