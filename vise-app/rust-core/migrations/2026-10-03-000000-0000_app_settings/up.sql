-- ============================================================
-- App settings
-- One row (id = 1) holding the user's preferences and what they
-- entered during onboarding, so every screen reads the same values.
--
-- Additive migration: no existing table or row is changed.
-- ============================================================

CREATE TABLE app_settings (
    -- Singleton: the CHECK makes a second row impossible.
    id INTEGER PRIMARY KEY CHECK (id = 1),

    -- Default currency for new transactions and budgets
    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (
        length(currency) = 3
    ),

    display_name TEXT,

    -- What the user expects to earn each month (entered in onboarding).
    -- Actual income always comes from transactions.
    monthly_income_cents BIGINT CHECK (
        monthly_income_cents IS NULL
        OR monthly_income_cents >= 0
    ),

    -- The source that monthly income, and onboarding's income
    -- transaction, belong to (for example "Salary").
    income_source_id INTEGER,

    -- Percentage of a category limit at which a budget shows "near limit"
    warning_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (
        warning_threshold_percent BETWEEN 1 AND 100
    ),

    -- NULL until onboarding has been fully saved
    onboarding_completed_at BIGINT,

    created_at BIGINT NOT NULL DEFAULT (unixepoch()),
    updated_at BIGINT NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (income_source_id)
        REFERENCES income_sources(id)
        ON DELETE SET NULL
);

INSERT INTO app_settings (id) VALUES (1);
