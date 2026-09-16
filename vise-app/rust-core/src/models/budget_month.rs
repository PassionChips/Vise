use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::db::schema::budget_months;

#[derive(
    Debug,
    Clone,
    Queryable,
    Selectable,
    Identifiable,
    Serialize,
    Deserialize,
    PartialEq,
)]
#[diesel(table_name = budget_months)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct BudgetMonth {
    pub id: Option<i32>,
    pub month: String,
    pub currency: String,
    pub spending_limit_cents: Option<i64>,
    pub savings_target_cents: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(
    Debug,
    Clone,
    Insertable,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = budget_months)]
pub struct NewBudgetMonth {
    pub month: String,
    pub currency: String,
    pub spending_limit_cents: Option<i64>,
    pub savings_target_cents: Option<i64>,
}

#[derive(
    Debug,
    Clone,
    AsChangeset,
    Serialize,
    Deserialize,
    Default,
)]
#[diesel(table_name = budget_months)]
pub struct UpdateBudgetMonth {
    pub month: Option<String>,
    pub currency: Option<String>,

    // Double Option allows the existing value to be cleared.
    pub spending_limit_cents: Option<Option<i64>>,
    pub savings_target_cents: Option<Option<i64>>,
}