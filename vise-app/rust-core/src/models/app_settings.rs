use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::db::schema::app_settings;

/// The single settings row (`id = 1`).
#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Serialize, Deserialize, PartialEq)]
#[diesel(table_name = app_settings)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct AppSettings {
    pub id: Option<i32>,
    pub currency: String,
    pub display_name: Option<String>,
    pub monthly_income_cents: Option<i64>,
    pub income_source_id: Option<i32>,
    pub warning_threshold_percent: i32,
    pub onboarding_completed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    /// "system", "light" or "dark".
    pub theme: String,
    /// Preset avatar id, or None for initials.
    pub avatar: Option<String>,
    /// Where the user keeps backups on this phone (an address from the file picker).
    pub backup_folder: Option<String>,
    /// Unix time of the last backup that reached its destination.
    pub last_backup_at: Option<i64>,
}

#[derive(Debug, Clone, AsChangeset, Default)]
#[diesel(table_name = app_settings)]
pub struct UpdateAppSettings {
    pub currency: Option<String>,
    // Double Option allows the existing value to be cleared.
    pub display_name: Option<Option<String>>,
    pub monthly_income_cents: Option<Option<i64>>,
    pub income_source_id: Option<Option<i32>>,
    pub warning_threshold_percent: Option<i32>,
    pub onboarding_completed_at: Option<Option<i64>>,
    pub theme: Option<String>,
    pub avatar: Option<Option<String>>,
    pub backup_folder: Option<Option<String>>,
    pub last_backup_at: Option<Option<i64>>,
}
