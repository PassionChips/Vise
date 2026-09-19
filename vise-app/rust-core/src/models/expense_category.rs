use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::db::schema::expense_categories;

#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Serialize, Deserialize, PartialEq)]
#[diesel(table_name = expense_categories)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ExpenseCategory {
    pub id: Option<i32>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Insertable, Serialize, Deserialize)]
#[diesel(table_name = expense_categories)]
pub struct NewExpenseCategory {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, AsChangeset, Serialize, Deserialize, Default)]
#[diesel(table_name = expense_categories)]
pub struct UpdateExpenseCategory {
    pub name: Option<String>,

    // None                 = do not update
    // Some(None)           = set database value to NULL
    // Some(Some("icon"))   = update the value
    pub icon: Option<Option<String>>,
    pub color: Option<Option<String>>,

    pub is_default: Option<bool>,
    pub is_active: Option<bool>,
}
