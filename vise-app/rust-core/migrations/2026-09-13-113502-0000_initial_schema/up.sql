-- Your SQL goes here
-- ============================================================
-- 1. Income sources
-- Examples: Salary, Freelance, Investment, Benefits
-- ============================================================

CREATE TABLE income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL COLLATE NOCASE UNIQUE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch())
);


-- ============================================================
-- 2. Expense categories
-- Examples: Housing, Groceries, Transport, Entertainment
-- ============================================================

CREATE TABLE expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    icon TEXT,
    color TEXT,

    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch())
);


-- ============================================================
-- 3. Budget months
-- Stores user targets only.
-- Actual income and spending are calculated from transactions.
-- ============================================================

CREATE TABLE budget_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Format: YYYY-MM, for example 2026-09
    month TEXT NOT NULL CHECK (
        length(month) = 7
        AND substr(month, 5, 1) = '-'
        AND CAST(substr(month, 6, 2) AS INTEGER) BETWEEN 1 AND 12
    ),

    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (
        length(currency) = 3
    ),

    spending_limit_cents BIGINT CHECK (
        spending_limit_cents IS NULL
        OR spending_limit_cents >= 0
    ),

    savings_target_cents BIGINT CHECK (
        savings_target_cents IS NULL
        OR savings_target_cents >= 0
    ),

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    UNIQUE(month, currency)
);


-- ============================================================
-- 4. Revolut accounts
-- Post-MVP table
-- ============================================================

CREATE TABLE revolut_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identifier supplied by Revolut
    external_id TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    account_type TEXT CHECK (
        account_type IS NULL
        OR account_type IN (
            'personal',
            'joint',
            'savings',
            'business',
            'other'
        )
    ),

    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (
        length(currency) = 3
    ),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch())
);


-- ============================================================
-- 5. Transactions
-- Contains both manually entered and Revolut transactions.
-- amount_cents is always positive.
-- transaction_type determines whether it is income or spending.
-- ============================================================

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Where this transaction came from
    source_type TEXT NOT NULL CHECK (
        source_type IN (
            'manual',
            'revolut'
        )
    ),

    -- Financial meaning of the transaction
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN (
            'income',
            'expense',
            'refund',
            'transfer'
        )
    ),

    -- Store €12.50 as 1250
    amount_cents BIGINT NOT NULL CHECK (
        amount_cents > 0
    ),

    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (
        length(currency) = 3
    ),

    description TEXT NOT NULL,

    -- Unix timestamp for when the transaction happened
    occurred_at BIGINT NOT NULL,

    -- Used for manually entered income
    income_source_id INTEGER,

    -- Used for manually entered or categorized expenses
    expense_category_id INTEGER,

    -- Revolut fields are NULL for manual transactions
    external_id TEXT UNIQUE,
    revolut_account_id INTEGER,
    merchant_name TEXT,
    raw_description TEXT,
    revolut_category TEXT,

    status TEXT NOT NULL DEFAULT 'completed' CHECK (
        status IN (
            'pending',
            'completed',
            'reverted',
            'failed'
        )
    ),

    completed_at BIGINT,

    -- Transfers or ignored transactions should not affect totals
    exclude_from_totals BOOLEAN NOT NULL DEFAULT FALSE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (income_source_id)
        REFERENCES income_sources(id)
        ON DELETE SET NULL,

    FOREIGN KEY (expense_category_id)
        REFERENCES expense_categories(id)
        ON DELETE SET NULL,

    FOREIGN KEY (revolut_account_id)
        REFERENCES revolut_accounts(id)
        ON DELETE SET NULL
);


-- Speeds up daily, weekly, monthly and yearly reports
CREATE INDEX idx_transactions_occurred_at
    ON transactions(occurred_at);


-- Speeds up income/expense queries over a date range
CREATE INDEX idx_transactions_type_and_date
    ON transactions(transaction_type, occurred_at);


CREATE INDEX idx_transactions_source_type
    ON transactions(source_type);


CREATE INDEX idx_transactions_income_source
    ON transactions(income_source_id);


CREATE INDEX idx_transactions_expense_category
    ON transactions(expense_category_id);


CREATE INDEX idx_transactions_revolut_account
    ON transactions(revolut_account_id);


CREATE INDEX idx_transactions_status
    ON transactions(status);


-- ============================================================
-- 6. Revolut synchronization state
-- One synchronization state per Revolut account.
-- Post-MVP table.
-- ============================================================

CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    revolut_account_id INTEGER NOT NULL UNIQUE,

    -- Cursor/token used for incremental synchronization
    sync_cursor TEXT,

    last_sync_started_at BIGINT,
    last_sync_completed_at BIGINT,

    sync_status TEXT NOT NULL DEFAULT 'never_synced' CHECK (
        sync_status IN (
            'never_synced',
            'in_progress',
            'completed',
            'failed'
        )
    ),

    last_error TEXT,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (revolut_account_id)
        REFERENCES revolut_accounts(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 7. Automatic category rules
-- Post-MVP table.
-- Example:
-- merchant_name contains "TESCO" -> Groceries
-- ============================================================

CREATE TABLE auto_category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    expense_category_id INTEGER NOT NULL,

    -- The transaction field that should be examined
    match_field TEXT NOT NULL CHECK (
        match_field IN (
            'merchant_name',
            'description',
            'revolut_category'
        )
    ),

    -- How the pattern should be matched
    match_type TEXT NOT NULL CHECK (
        match_type IN (
            'exact',
            'contains',
            'starts_with',
            'ends_with',
            'regex'
        )
    ),

    pattern TEXT NOT NULL,

    -- Higher priority rules are evaluated first
    priority INTEGER NOT NULL DEFAULT 0,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (expense_category_id)
        REFERENCES expense_categories(id)
        ON DELETE CASCADE,

    UNIQUE(match_field, match_type, pattern)
);


CREATE INDEX idx_auto_category_rules_priority
    ON auto_category_rules(priority DESC);


CREATE INDEX idx_auto_category_rules_category
    ON auto_category_rules(expense_category_id);