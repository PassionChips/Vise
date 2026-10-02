use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::db::schema::category_budgets;

/// A spending limit for one expense category in one budget month.
#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Serialize, Deserialize, PartialEq)]
#[diesel(table_name = category_budgets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct CategoryBudget {
    pub id: Option<i32>,
    pub budget_month_id: i32,
    pub expense_category_id: i32,
    pub limit_cents: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Insertable, Serialize, Deserialize)]
#[diesel(table_name = category_budgets)]
pub struct NewCategoryBudget {
    pub budget_month_id: i32,
    pub expense_category_id: i32,
    pub limit_cents: i64,
}
