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
  /** Appearance: follow the device, or force light / dark. */
  theme: ThemeSetting;
  /** Preset avatar id (see src/data/avatars.ts), or null to show initials. */
  avatar: string | null;
  /** The folder chosen for backups on this phone (an address from the file picker), or null. */
  backup_folder: string | null;
  /** Unix time of the last backup that reached its destination, or null if there never was one. */
  last_backup_at: number | null;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

/** Fields left out are unchanged; blank display_name / monthly_income clears them. */
export interface UpdateSettingsInput {
  currency?: string;
  display_name?: string;
  monthly_income?: string;
  income_source_id?: number;
  warning_threshold_percent?: number;
  theme?: ThemeSetting;
  /** A preset avatar id; '' goes back to initials. */
  avatar?: string;
  /** The backup folder's address; '' forgets it. */
  backup_folder?: string;
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

// ----- Data management -----

/** What "Delete all my data" would erase. */
export interface DataOverview {
  transactions: number;
  categories: number;
  income_sources: number;
  /** Monthly budgets plus per-category limits. */
  budgets: number;
}

export interface CsvExport {
  filename: string;
  csv: string;
  transaction_count: number;
  budget_count: number;
}

export interface DeletedCounts {
  transactions: number;
  categories: number;
  income_sources: number;
  budgets: number;
}

// ----- Import -----

/** Column numbers (0-based) as listed in `ImportPreview.columns`. `null` = no such column. */
export interface ImportMapping {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  transaction_type: number | null;
  currency: number | null;
  category: number | null;
}

export type ImportMappingField = keyof ImportMapping;

export type ImportDateOrder = 'dmy' | 'mdy' | 'ymd';
export type ImportDecimalSeparator = 'dot' | 'comma';

/** Same input for the preview and the save, so the user sees exactly what will be stored. */
export interface ImportInput {
  /** The text of the CSV file. */
  content: string;
  /** Today, YYYY-MM-DD: the date for rows when the file has none. */
  today: string;
  /** Currency for rows without one. */
  default_currency: string;
  /** Columns the user chose, overriding what was detected. */
  mapping?: Partial<ImportMapping>;
  /** Fields the file does not have, to switch off a wrong detection. */
  no_columns?: ImportMappingField[];
  date_order?: ImportDateOrder;
  decimal_separator?: ImportDecimalSeparator;
  /** What a positive amount means when the file does not say. */
  positive_is?: 'income' | 'expense';
  /** Default true. */
  skip_duplicates?: boolean;
  /** One choice per group in `ImportPreview.groups`. Groups left out are saved uncategorized. */
  categories?: ImportCategoryChoice[];
}

/** The user's decision for one group. With neither field set the group stays uncategorized. */
export interface ImportCategoryChoice {
  /** `ImportGroup.key`. */
  group: string;
  /** An existing category... */
  category_id?: number;
  /** ...or the name of one to create (an existing one with that name is reused). Not both. */
  new_category?: string;
}

export interface ImportSuggestion {
  /** The existing category; null if the file names one that does not exist yet. */
  category_id: number | null;
  name: string;
  source: 'file' | 'history';
  /** Applying it creates the category. */
  is_new: boolean;
}

/** Expense and refund rows that share a merchant, or the category named in the file. */
export interface ImportGroup {
  key: string;
  kind: 'merchant' | 'file_category';
  /** Show this: the most common description, or the category name from the file. */
  label: string;
  rows: number;
  total_cents: number;
  suggestion: ImportSuggestion | null;
}

export interface ImportColumn {
  index: number;
  name: string;
  example: string;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportStats {
  rows_in_file: number;
  /** Rows that will be saved. */
  ready: number;
  duplicates: number;
  /** Totals, notes and empty rows left out; not errors. */
  skipped: number;
  errors: number;
  dated: number;
  filled_from_above: number;
  filled_from_below: number;
  filled_with_import_date: number;
}

export interface ImportSampleRow {
  row: number;
  date: string;
  date_source: 'file' | 'above' | 'below' | 'import_day';
  description: string;
  amount_cents: number;
  currency: string;
  transaction_type: TransactionType;
  duplicate: boolean;
}

export interface ImportPreview {
  header_row: number | null;
  columns: ImportColumn[];
  mapping: ImportMapping;
  date_order: ImportDateOrder;
  date_order_ambiguous: boolean;
  decimal_separator: ImportDecimalSeparator;
  decimal_ambiguous: boolean;
  positive_is: 'income' | 'expense';
  stats: ImportStats;
  warnings: string[];
  /** The first 100 row errors; `stats.errors` is the full count. */
  errors: ImportRowError[];
  sample: ImportSampleRow[];
  /** Biggest spending first. Income and transfers are not grouped. */
  groups: ImportGroup[];
}

export interface ImportSummary {
  inserted: number;
  duplicates: number;
  skipped: number;
  error_count: number;
  errors: ImportRowError[];
  filled_dates: number;
  /** Rows saved with a category. */
  categorized: number;
  categories_created: number;
}

// ----- Receipt scanning -----

/** One line of text the phone's OCR found, with its box on the photo. */
export interface OcrLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ReceiptInput {
  lines: OcrLine[];
  /** Today, YYYY-MM-DD. */
  today: string;
  /** Currency to assume when the receipt shows none. */
  default_currency: string;
}

export interface TotalCandidate {
  amount_cents: number;
  /** The row of the receipt it came from. */
  line: string;
  /** "total": a labelled total. "likely": a card payment line. "possible": a guess. */
  confidence: 'total' | 'likely' | 'possible';
}

/** What was read from a receipt photo: a proposal for the user to check, never saved by itself. */
export interface ReceiptScan {
  merchant: string | null;
  /** YYYY-MM-DD, if a plausible date was printed. */
  date: string | null;
  /** Best guess first. Empty if no amount was found. */
  totals: TotalCandidate[];
  currency: string;
  /** False if the receipt showed no currency and `currency` is the default. */
  currency_found: boolean;
  suggestion: ImportSuggestion | null;
  warnings: string[];
}

// ----- Backup and restore -----

export interface BackupSummary {
  transactions: number;
  categories: number;
  income_sources: number;
  /** Monthly budgets plus per-category limits. */
  budgets: number;
  /** YYYY-MM-DD of the oldest and newest transaction, if there are any. */
  first_transaction_date: string | null;
  last_transaction_date: string | null;
}

export interface BackupInfo {
  path: string;
  bytes: number;
  encrypted: boolean;
  /** ISO 8601, UTC. */
  created_at: string;
  summary: BackupSummary;
}

/** What is in a backup file, without restoring it. A protected file reports `needs_passphrase` until unlocked. */
export interface BackupInspection {
  encrypted: boolean;
  needs_passphrase: boolean;
  created_at: string;
  summary: BackupSummary | null;
}

// ----- Errors -----

export type ErrorKind = 'validation' | 'not_found' | 'invalid_request' | 'database' | 'bridge_unavailable';

export interface ErrorBody {
  kind: ErrorKind;
  field?: string; // set for validation errors: the form field to highlight
  message: string; // safe to show to the user
}
