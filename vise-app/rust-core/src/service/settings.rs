//! Settings and onboarding use cases.
//!
//! `app_settings` is the one place that remembers what the user told us
//! (currency, expected monthly income and which income source it belongs
//! to, warning threshold, whether onboarding finished). Screens read
//! these values from here, so a change in Settings shows up everywhere.
//!
//! `complete_onboarding` writes everything onboarding collected in a
//! single database transaction: either all of it is saved and onboarding
//! is marked complete, or nothing is.

use diesel::Connection;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use super::{
    NewTransactionInput, upsert_category_budget, validate_currency, validate_new_transaction,
    validate_optional_limit, validate_text,
};
use crate::error::AppError;
use crate::models::app_settings::{AppSettings, UpdateAppSettings};
use crate::models::expense_category::NewExpenseCategory;
use crate::models::income_source::NewIncomeSource;
use crate::month::YearMonth;
use crate::repository::{
    app_settings_repository, expense_category_repository, income_source_repository,
    transaction_repository,
};

/// Income source used when the user gives a monthly income but no source name.
pub const DEFAULT_INCOME_SOURCE: &str = "Salary";

/// Settings as the frontend sees them.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SettingsView {
    pub currency: String,
    pub display_name: Option<String>,
    pub monthly_income_cents: Option<i64>,
    pub income_source_id: Option<i32>,
    pub income_source_name: Option<String>,
    pub warning_threshold_percent: i32,
    pub onboarding_completed: bool,
    /// "system" (follow the device), "light" or "dark".
    pub theme: String,
    /// Preset avatar id (one of [`AVATARS`]), or null to show initials.
    pub avatar: Option<String>,
    /// The folder chosen for backups on this phone, or null.
    pub backup_folder: Option<String>,
    /// Unix time of the last backup that reached its destination, or null if there never was one.
    pub last_backup_at: Option<i64>,
}

/// Values accepted for `theme`.
pub const THEMES: [&str; 3] = ["system", "light", "dark"];

/// Preset avatars the user can pick. Mirrored in `contracts/avatars.json`
/// and `src/data/avatars.ts`; never remove an id that may already be stored.
pub const AVATARS: [&str; 12] = [
    "cat", "dog", "rabbit", "panda", "bird", "fish", "turtle", "squirrel", "sprout", "sun", "moon",
    "rocket",
];

/// Fields left out are unchanged. For `display_name` and `monthly_income`
/// an empty string clears the value.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateSettingsInput {
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    /// e.g. "2500.00"
    #[serde(default)]
    pub monthly_income: Option<String>,
    #[serde(default)]
    pub income_source_id: Option<i32>,
    #[serde(default)]
    pub warning_threshold_percent: Option<i32>,
    /// "system", "light" or "dark".
    #[serde(default)]
    pub theme: Option<String>,
    /// A preset avatar id; an empty string goes back to initials.
    #[serde(default)]
    pub avatar: Option<String>,
    /// The backup folder's address; an empty string forgets it.
    #[serde(default)]
    pub backup_folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardingCategory {
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardingTransaction {
    /// "expense" or "income"
    pub transaction_type: String,
    pub amount: String,
    pub description: String,
    /// "YYYY-MM-DD"
    pub date: String,
    /// Only for expenses. Income belongs to the income source.
    #[serde(default)]
    pub category: Option<OnboardingCategory>,
}

/// Everything the onboarding flow collects.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardingInput {
    pub currency: String,
    /// Today as "YYYY-MM-DD"; its month is the month the budget applies to.
    pub today: String,
    #[serde(default)]
    pub display_name: Option<String>,
    /// Expected monthly income, e.g. "2500.00". Blank or missing = not set.
    #[serde(default)]
    pub monthly_income: Option<String>,
    /// Name of the income source (default "Salary").
    #[serde(default)]
    pub income_source_name: Option<String>,
    #[serde(default)]
    pub budget_category: Option<OnboardingCategory>,
    /// Monthly limit for `budget_category`. Blank or missing = no budget.
    #[serde(default)]
    pub monthly_limit: Option<String>,
    #[serde(default)]
    pub first_transaction: Option<OnboardingTransaction>,
}

pub fn get_settings(connection: &mut SqliteConnection) -> Result<SettingsView, AppError> {
    let settings = app_settings_repository::get(connection)?;
    view(connection, settings)
}

fn view(
    connection: &mut SqliteConnection,
    settings: AppSettings,
) -> Result<SettingsView, AppError> {
    let income_source_name = match settings.income_source_id {
        Some(id) => income_source_repository::get_by_id(connection, id)?.map(|s| s.name),
        None => None,
    };
    Ok(SettingsView {
        currency: settings.currency,
        display_name: settings.display_name,
        monthly_income_cents: settings.monthly_income_cents,
        income_source_id: settings.income_source_id,
        income_source_name,
        warning_threshold_percent: settings.warning_threshold_percent,
        onboarding_completed: settings.onboarding_completed_at.is_some(),
        theme: settings.theme,
        avatar: settings.avatar,
        backup_folder: settings.backup_folder,
        last_backup_at: settings.last_backup_at,
    })
}

pub fn update_settings(
    connection: &mut SqliteConnection,
    input: &UpdateSettingsInput,
) -> Result<SettingsView, AppError> {
    let mut changes = UpdateAppSettings::default();

    if let Some(currency) = &input.currency {
        changes.currency = Some(validate_currency(currency)?);
    }
    if let Some(name) = &input.display_name {
        changes.display_name = Some(optional_text("display_name", "name", name)?);
    }
    if let Some(income) = &input.monthly_income {
        changes.monthly_income_cents = Some(validate_optional_limit(
            "monthly_income",
            Some(income.as_str()),
        )?);
    }
    if let Some(id) = input.income_source_id {
        if income_source_repository::get_by_id(connection, id)?.is_none() {
            return Err(AppError::validation(
                "income_source_id",
                "That income source no longer exists",
            ));
        }
        changes.income_source_id = Some(Some(id));
    }
    if let Some(percent) = input.warning_threshold_percent {
        if !(1..=100).contains(&percent) {
            return Err(AppError::validation(
                "warning_threshold_percent",
                "Choose a percentage between 1 and 100",
            ));
        }
        changes.warning_threshold_percent = Some(percent);
    }
    if let Some(theme) = &input.theme {
        let theme = theme.trim().to_ascii_lowercase();
        if !THEMES.contains(&theme.as_str()) {
            return Err(AppError::validation(
                "theme",
                "Choose Light, Dark or System",
            ));
        }
        changes.theme = Some(theme);
    }
    if let Some(avatar) = &input.avatar {
        let avatar = avatar.trim();
        changes.avatar = Some(if avatar.is_empty() {
            None
        } else if AVATARS.contains(&avatar) {
            Some(avatar.to_string())
        } else {
            return Err(AppError::validation("avatar", "Choose one of the avatars"));
        });
    }
    if let Some(folder) = &input.backup_folder {
        let folder = folder.trim();
        if folder.chars().count() > MAX_BACKUP_FOLDER_LENGTH {
            return Err(AppError::validation(
                "backup_folder",
                "That folder address is too long",
            ));
        }
        changes.backup_folder = Some((!folder.is_empty()).then(|| folder.to_string()));
    }

    let updated = app_settings_repository::update(connection, &changes)?;
    view(connection, updated)
}

/// Longest folder address kept (matches the column's CHECK).
const MAX_BACKUP_FOLDER_LENGTH: usize = 2048;

/// Records that a backup reached its destination just now.
pub fn mark_backup_done(connection: &mut SqliteConnection) -> Result<SettingsView, AppError> {
    let changes = UpdateAppSettings {
        last_backup_at: Some(Some(chrono::Utc::now().timestamp())),
        ..Default::default()
    };
    let updated = app_settings_repository::update(connection, &changes)?;
    view(connection, updated)
}

/// Blank text clears the value; otherwise it is trimmed and length-checked.
fn optional_text(field: &str, label: &str, value: &str) -> Result<Option<String>, AppError> {
    if value.trim().is_empty() {
        Ok(None)
    } else {
        validate_text(field, label, value).map(Some)
    }
}

/// Finds an income source by name (case-insensitive) or creates it.
fn ensure_income_source(connection: &mut SqliteConnection, name: &str) -> Result<i32, AppError> {
    let existing = income_source_repository::get_all(connection)?
        .into_iter()
        .find(|s| s.name.eq_ignore_ascii_case(name));
    let source = match existing {
        Some(source) => source,
        None => income_source_repository::insert(
            connection,
            &NewIncomeSource {
                name: name.to_string(),
                is_active: true,
            },
        )?,
    };
    source
        .id
        .ok_or_else(|| AppError::NotFound("Income source has no id".to_string()))
}

/// Finds an expense category by name (case-insensitive) or creates it.
fn ensure_category(
    connection: &mut SqliteConnection,
    category: &OnboardingCategory,
) -> Result<i32, AppError> {
    let name = validate_text("budget_category", "category name", &category.name)?;
    let existing = expense_category_repository::get_all(connection)?
        .into_iter()
        .find(|c| c.name.eq_ignore_ascii_case(&name));
    let found = match existing {
        Some(found) => found,
        None => expense_category_repository::insert(
            connection,
            &NewExpenseCategory {
                name,
                icon: category
                    .icon
                    .as_deref()
                    .map(str::trim)
                    .filter(|i| !i.is_empty())
                    .map(String::from),
                color: None,
                is_default: false,
                is_active: true,
            },
        )?,
    };
    found
        .id
        .ok_or_else(|| AppError::NotFound("Category has no id".to_string()))
}

/// Saves everything onboarding collected and marks it complete, atomically.
///
/// Calling it again after onboarding finished changes nothing and returns
/// the saved settings, so a retry (for example after the app was killed
/// right as the save completed) cannot duplicate or overwrite data.
pub fn complete_onboarding(
    connection: &mut SqliteConnection,
    input: &OnboardingInput,
) -> Result<SettingsView, AppError> {
    // Validate before opening the transaction so bad input never touches the database.
    let currency = validate_currency(&input.currency)?;
    let today = chrono::NaiveDate::parse_from_str(input.today.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::validation("today", "Enter a date in YYYY-MM-DD format"))?;
    let month = YearMonth::parse(&today.format("%Y-%m").to_string())
        .map_err(|message| AppError::validation("month", message))?;
    let display_name = match &input.display_name {
        Some(name) => optional_text("display_name", "name", name)?,
        None => None,
    };
    let monthly_income_cents =
        validate_optional_limit("monthly_income", input.monthly_income.as_deref())?;
    let limit_cents = validate_optional_limit("limit", input.monthly_limit.as_deref())?;
    if limit_cents.is_some() && input.budget_category.is_none() {
        return Err(AppError::validation(
            "budget_category",
            "Choose a category for the budget",
        ));
    }
    let source_name = match input.income_source_name.as_deref().map(str::trim) {
        Some(name) if !name.is_empty() => {
            validate_text("income_source_name", "income source name", name)?
        }
        _ => DEFAULT_INCOME_SOURCE.to_string(),
    };

    let first_transaction = input
        .first_transaction
        .as_ref()
        .map(|tx| {
            if tx.transaction_type != "expense" && tx.transaction_type != "income" {
                return Err(AppError::validation(
                    "transaction_type",
                    "Choose income or expense",
                ));
            }
            let new = NewTransactionInput {
                transaction_type: tx.transaction_type.clone(),
                amount: tx.amount.clone(),
                currency: currency.clone(),
                description: tx.description.clone(),
                date: tx.date.clone(),
                expense_category_id: None,
                income_source_id: None,
            };
            validate_new_transaction(&new)?;
            Ok((tx, new))
        })
        .transpose()?;

    connection.transaction::<SettingsView, AppError, _>(|connection| {
        let current = app_settings_repository::get(connection)?;
        if current.onboarding_completed_at.is_some() {
            return view(connection, current);
        }

        let needs_income_source = monthly_income_cents.is_some()
            || first_transaction
                .as_ref()
                .is_some_and(|(tx, _)| tx.transaction_type == "income");
        let income_source_id = if needs_income_source {
            Some(ensure_income_source(connection, &source_name)?)
        } else {
            None
        };

        if let (Some(category), Some(limit_cents)) = (&input.budget_category, limit_cents) {
            let category_id = ensure_category(connection, category)?;
            upsert_category_budget(connection, month, &currency, category_id, limit_cents)?;
        }

        if let Some((tx, mut new)) = first_transaction.clone() {
            if tx.transaction_type == "income" {
                new.income_source_id = income_source_id;
            } else if let Some(category) = &tx.category {
                new.expense_category_id = Some(ensure_category(connection, category)?);
            }
            let row = validate_new_transaction(&new)?;
            transaction_repository::insert(connection, &row)?;
        }

        let saved = app_settings_repository::update(
            connection,
            &UpdateAppSettings {
                currency: Some(currency.clone()),
                display_name: Some(display_name.clone()),
                monthly_income_cents: Some(monthly_income_cents),
                income_source_id: Some(income_source_id),
                onboarding_completed_at: Some(Some(chrono::Utc::now().timestamp())),
                ..Default::default()
            },
        )?;
        view(connection, saved)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;
    use crate::service;

    fn onboarding() -> OnboardingInput {
        OnboardingInput {
            currency: "usd".to_string(),
            today: "2026-09-18".to_string(),
            display_name: Some("Aoife".to_string()),
            monthly_income: Some("4250".to_string()),
            income_source_name: None,
            budget_category: Some(OnboardingCategory {
                name: "Groceries".to_string(),
                icon: Some("shopping-cart".to_string()),
            }),
            monthly_limit: Some("500".to_string()),
            first_transaction: Some(OnboardingTransaction {
                transaction_type: "expense".to_string(),
                amount: "42.80".to_string(),
                description: "Tesco".to_string(),
                date: "2026-09-18".to_string(),
                category: Some(OnboardingCategory {
                    name: "groceries".to_string(),
                    icon: None,
                }),
            }),
        }
    }

    #[test]
    fn fresh_database_is_not_onboarded() {
        let mut connection = establish_connection_test().unwrap();
        let settings = get_settings(&mut connection).unwrap();
        assert!(!settings.onboarding_completed);
        assert_eq!(settings.monthly_income_cents, None);
    }

    #[test]
    fn onboarding_saves_everything_and_links_records() {
        let mut connection = establish_connection_test().unwrap();

        let settings = complete_onboarding(&mut connection, &onboarding()).unwrap();

        assert!(settings.onboarding_completed);
        assert_eq!(settings.currency, "USD");
        assert_eq!(settings.display_name.as_deref(), Some("Aoife"));
        assert_eq!(settings.monthly_income_cents, Some(425_000));
        assert_eq!(settings.income_source_name.as_deref(), Some("Salary"));

        // One category (matched case-insensitively) shared by budget and transaction.
        let categories = service::list_categories(&mut connection).unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].icon.as_deref(), Some("shopping-cart"));

        let summary = service::get_monthly_summary(&mut connection, "2026-09", "USD").unwrap();
        assert_eq!(summary.spent_cents, 4_280);
        assert_eq!(summary.expected_income_cents, Some(425_000));
        assert_eq!(summary.income_basis_cents, 425_000);
        assert_eq!(summary.left_cents, 425_000 - 4_280);
        assert_eq!(summary.category_limits_total_cents, 50_000);
        let groceries = &summary.categories[0];
        assert_eq!(groceries.limit_cents, Some(50_000));
        assert_eq!(groceries.spent_cents, 4_280);
    }

    #[test]
    fn income_transaction_is_linked_to_the_income_source() {
        let mut connection = establish_connection_test().unwrap();
        let mut input = onboarding();
        input.income_source_name = Some("Freelance".to_string());
        input.first_transaction = Some(OnboardingTransaction {
            transaction_type: "income".to_string(),
            amount: "1000".to_string(),
            description: "Invoice".to_string(),
            date: "2026-09-02".to_string(),
            category: None,
        });

        let settings = complete_onboarding(&mut connection, &input).unwrap();

        let source_id = settings.income_source_id.unwrap();
        assert_eq!(settings.income_source_name.as_deref(), Some("Freelance"));
        let transactions = service::list_transactions(&mut connection, "2026-09").unwrap();
        assert_eq!(transactions.len(), 1);
        assert_eq!(transactions[0].income_source_id, Some(source_id));
        assert_eq!(transactions[0].expense_category_id, None);
    }

    #[test]
    fn retrying_completed_onboarding_changes_nothing() {
        let mut connection = establish_connection_test().unwrap();
        complete_onboarding(&mut connection, &onboarding()).unwrap();

        let mut different = onboarding();
        different.monthly_income = Some("1".to_string());
        different.currency = "GBP".to_string();
        let again = complete_onboarding(&mut connection, &different).unwrap();

        assert_eq!(again.monthly_income_cents, Some(425_000));
        assert_eq!(again.currency, "USD");
        assert_eq!(
            service::list_transactions(&mut connection, "2026-09")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            service::list_income_sources(&mut connection).unwrap().len(),
            1
        );
    }

    #[test]
    fn existing_income_source_and_category_are_reused_not_duplicated() {
        let mut connection = establish_connection_test().unwrap();
        service::add_income_source(
            &mut connection,
            &service::NewIncomeSourceInput {
                name: "salary".to_string(),
            },
        )
        .unwrap();

        complete_onboarding(&mut connection, &onboarding()).unwrap();

        let sources = service::list_income_sources(&mut connection).unwrap();
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].name, "salary");
    }

    #[test]
    fn invalid_onboarding_saves_nothing_and_is_not_marked_complete() {
        let mut connection = establish_connection_test().unwrap();
        let mut input = onboarding();
        // Invalid input is rejected before anything is written.
        input.first_transaction.as_mut().unwrap().amount = "0".to_string();

        let error = complete_onboarding(&mut connection, &input).unwrap_err();

        assert!(matches!(error, AppError::Validation { ref field, .. } if field == "amount"));
        assert!(!get_settings(&mut connection).unwrap().onboarding_completed);
        assert!(
            service::list_categories(&mut connection)
                .unwrap()
                .is_empty()
        );
        assert!(
            service::list_income_sources(&mut connection)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn database_failure_midway_rolls_everything_back() {
        use diesel::connection::SimpleConnection;
        let mut connection = establish_connection_test().unwrap();
        // Make the final settings write fail after the other writes succeeded.
        connection
            .batch_execute(
                "CREATE TRIGGER block_settings BEFORE UPDATE ON app_settings
                 BEGIN SELECT RAISE(ABORT, 'blocked'); END;",
            )
            .unwrap();

        let error = complete_onboarding(&mut connection, &onboarding()).unwrap_err();

        assert!(matches!(error, AppError::Database(_)));
        assert!(
            service::list_categories(&mut connection)
                .unwrap()
                .is_empty()
        );
        assert!(
            service::list_income_sources(&mut connection)
                .unwrap()
                .is_empty()
        );
        assert!(
            service::list_transactions(&mut connection, "2026-09")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn validation_errors_name_the_field() {
        let mut connection = establish_connection_test().unwrap();
        let mut input = onboarding();
        input.monthly_limit = Some("abc".to_string());
        let error = complete_onboarding(&mut connection, &input).unwrap_err();
        assert!(matches!(error, AppError::Validation { ref field, .. } if field == "limit"));

        let mut input = onboarding();
        input.budget_category = None;
        let error = complete_onboarding(&mut connection, &input).unwrap_err();
        assert!(
            matches!(error, AppError::Validation { ref field, .. } if field == "budget_category")
        );
    }

    #[test]
    fn skipping_every_optional_step_still_completes() {
        let mut connection = establish_connection_test().unwrap();
        let input = OnboardingInput {
            currency: "EUR".to_string(),
            today: "2026-09-18".to_string(),
            display_name: None,
            monthly_income: None,
            income_source_name: None,
            budget_category: None,
            monthly_limit: None,
            first_transaction: None,
        };

        let settings = complete_onboarding(&mut connection, &input).unwrap();

        assert!(settings.onboarding_completed);
        assert_eq!(settings.monthly_income_cents, None);
        assert_eq!(settings.income_source_id, None);
    }

    #[test]
    fn theme_defaults_to_system_and_is_validated() {
        let mut connection = establish_connection_test().unwrap();
        assert_eq!(get_settings(&mut connection).unwrap().theme, "system");

        let input = |theme: &str| UpdateSettingsInput {
            backup_folder: None,
            currency: None,
            display_name: None,
            monthly_income: None,
            income_source_id: None,
            warning_threshold_percent: None,
            theme: Some(theme.to_string()),
            avatar: None,
        };
        assert_eq!(
            update_settings(&mut connection, &input("Dark"))
                .unwrap()
                .theme,
            "dark"
        );
        // Persisted, not just echoed back.
        assert_eq!(get_settings(&mut connection).unwrap().theme, "dark");

        let error = update_settings(&mut connection, &input("sepia")).unwrap_err();
        assert!(matches!(error, AppError::Validation { ref field, .. } if field == "theme"));
        assert_eq!(get_settings(&mut connection).unwrap().theme, "dark");
    }

    #[test]
    fn avatar_is_chosen_from_the_presets_and_can_be_cleared() {
        let mut connection = establish_connection_test().unwrap();
        assert_eq!(get_settings(&mut connection).unwrap().avatar, None);

        let input = |avatar: &str| UpdateSettingsInput {
            backup_folder: None,
            currency: None,
            display_name: None,
            monthly_income: None,
            income_source_id: None,
            warning_threshold_percent: None,
            theme: None,
            avatar: Some(avatar.to_string()),
        };
        update_settings(&mut connection, &input("panda")).unwrap();
        assert_eq!(
            get_settings(&mut connection).unwrap().avatar.as_deref(),
            Some("panda")
        );

        for bad in [
            "unicorn",
            "PANDA",
            "https://example.com/me.png",
            "data:image/png;base64,AAAA",
        ] {
            let error = update_settings(&mut connection, &input(bad)).unwrap_err();
            assert!(
                matches!(error, AppError::Validation { ref field, .. } if field == "avatar"),
                "{bad}"
            );
        }
        // The rejected values changed nothing.
        assert_eq!(
            get_settings(&mut connection).unwrap().avatar.as_deref(),
            Some("panda")
        );

        update_settings(&mut connection, &input("")).unwrap();
        assert_eq!(get_settings(&mut connection).unwrap().avatar, None);
    }

    #[test]
    fn avatar_list_matches_the_shared_contract() {
        let contract: serde_json::Value =
            serde_json::from_str(include_str!("../../contracts/avatars.json")).unwrap();
        let ids: Vec<&str> = contract["avatars"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(ids, AVATARS);
    }

    #[test]
    fn settings_changes_are_stored_and_validated() {
        let mut connection = establish_connection_test().unwrap();
        complete_onboarding(&mut connection, &onboarding()).unwrap();

        let updated = update_settings(
            &mut connection,
            &UpdateSettingsInput {
                backup_folder: None,
                currency: None,
                display_name: Some("".to_string()),
                monthly_income: Some("5000".to_string()),
                income_source_id: None,
                warning_threshold_percent: Some(90),
                theme: None,
                avatar: None,
            },
        )
        .unwrap();

        assert_eq!(updated.display_name, None);
        assert_eq!(updated.monthly_income_cents, Some(500_000));
        assert_eq!(updated.warning_threshold_percent, 90);
        assert_eq!(updated.currency, "USD");
        assert!(updated.onboarding_completed);
        assert_eq!(get_settings(&mut connection).unwrap(), updated);

        // The summary reflects the changed income.
        let summary = service::get_monthly_summary(&mut connection, "2026-09", "USD").unwrap();
        assert_eq!(summary.expected_income_cents, Some(500_000));

        for bad in [
            UpdateSettingsInput {
                backup_folder: None,
                currency: Some("EURO".to_string()),
                display_name: None,
                monthly_income: None,
                income_source_id: None,
                warning_threshold_percent: None,
                theme: None,
                avatar: None,
            },
            UpdateSettingsInput {
                backup_folder: None,
                currency: None,
                display_name: None,
                monthly_income: None,
                income_source_id: Some(999),
                warning_threshold_percent: None,
                theme: None,
                avatar: None,
            },
            UpdateSettingsInput {
                backup_folder: None,
                currency: None,
                display_name: None,
                monthly_income: None,
                income_source_id: None,
                warning_threshold_percent: Some(0),
                theme: None,
                avatar: None,
            },
        ] {
            assert!(matches!(
                update_settings(&mut connection, &bad),
                Err(AppError::Validation { .. })
            ));
        }
    }
}
