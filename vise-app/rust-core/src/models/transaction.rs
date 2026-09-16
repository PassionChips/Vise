use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::db::schema::transactions;

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
#[diesel(table_name = transactions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Transaction {
    pub id: Option<i32>,

    pub source_type: String,
    pub transaction_type: String,

    pub amount_cents: i64,
    pub currency: String,
    pub description: String,
    pub occurred_at: i64,

    pub income_source_id: Option<i32>,
    pub expense_category_id: Option<i32>,

    pub external_id: Option<String>,
    pub revolut_account_id: Option<i32>,
    pub merchant_name: Option<String>,
    pub raw_description: Option<String>,
    pub revolut_category: Option<String>,

    pub status: String,
    pub completed_at: Option<i64>,
    pub exclude_from_totals: bool,

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
#[diesel(table_name = transactions)]
pub struct NewTransaction {
    pub source_type: String,
    pub transaction_type: String,

    pub amount_cents: i64,
    pub currency: String,
    pub description: String,
    pub occurred_at: i64,

    pub income_source_id: Option<i32>,
    pub expense_category_id: Option<i32>,

    pub external_id: Option<String>,
    pub revolut_account_id: Option<i32>,
    pub merchant_name: Option<String>,
    pub raw_description: Option<String>,
    pub revolut_category: Option<String>,

    pub status: String,
    pub completed_at: Option<i64>,
    pub exclude_from_totals: bool,
}

#[derive(
    Debug,
    Clone,
    AsChangeset,
    Serialize,
    Deserialize,
    Default,
)]
#[diesel(table_name = transactions)]
pub struct UpdateTransaction {
    pub source_type: Option<String>,
    pub transaction_type: Option<String>,

    pub amount_cents: Option<i64>,
    pub currency: Option<String>,
    pub description: Option<String>,
    pub occurred_at: Option<i64>,

    // These use Option<Option<T>> because the database columns are nullable.
    pub income_source_id: Option<Option<i32>>,
    pub expense_category_id: Option<Option<i32>>,

    pub external_id: Option<Option<String>>,
    pub revolut_account_id: Option<Option<i32>>,
    pub merchant_name: Option<Option<String>>,
    pub raw_description: Option<Option<String>>,
    pub revolut_category: Option<Option<String>>,

    pub status: Option<String>,
    pub completed_at: Option<Option<i64>>,
    pub exclude_from_totals: Option<bool>,
}