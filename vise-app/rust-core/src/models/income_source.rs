use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use crate::db::schema::income_sources;


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
#[diesel(table_name = income_sources)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct IncomeSource{
    pub id: Option<i32>,
    pub name: String,
    pub is_active: bool,
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
#[diesel(table_name = income_sources)]
pub struct NewIncomeSource {
    pub name: String,
    pub is_active: bool,
}

#[derive(
    Debug,
    Clone,
    AsChangeset,
    Serialize,
    Deserialize,
    Default,
)]
#[diesel(table_name = income_sources)]
pub struct UpdateIncomeSource {
    pub name: Option<String>,
    pub is_active: Option<bool>,
}