-- This file should undo anything in `up.sql`
-- Tables must be removed in reverse dependency order.

DROP TABLE IF EXISTS auto_category_rules;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS revolut_accounts;
DROP TABLE IF EXISTS budget_months;
DROP TABLE IF EXISTS expense_categories;
DROP TABLE IF EXISTS income_sources;