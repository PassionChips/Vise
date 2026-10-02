-- ============================================================
-- Category budgets
-- A spending limit for one expense category in one budget month.
-- Limits can differ from month to month, so they hang off
-- budget_months instead of expense_categories.
--
-- Additive migration: no existing table or row is changed.
-- ============================================================

CREATE TABLE category_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    budget_month_id INTEGER NOT NULL,
    expense_category_id INTEGER NOT NULL,

    -- Store €250.00 as 25000
    limit_cents BIGINT NOT NULL CHECK (
        limit_cents >= 0
    ),

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    -- Deleting a month or a category removes its limits too
    FOREIGN KEY (budget_month_id)
        REFERENCES budget_months(id)
        ON DELETE CASCADE,

    FOREIGN KEY (expense_category_id)
        REFERENCES expense_categories(id)
        ON DELETE CASCADE,

    -- One limit per category per month
    UNIQUE(budget_month_id, expense_category_id)
);


CREATE INDEX idx_category_budgets_category
    ON category_budgets(expense_category_id);
