//! "Export data (CSV)" and "Delete all my data".
//!
//! The export is one CSV file holding everything the user entered:
//! every transaction plus every monthly and per-category budget, one row
//! each, distinguished by the `record` column. Amounts are plain decimals
//! (`12.50`) that the importer's parser reads back exactly.
//!
//! Deleting wipes every user table in one database transaction (all or
//! nothing) and resets the settings row (name, income, avatar, …), so
//! the app starts onboarding again. Only the appearance preference is
//! kept: it describes the device, not the user's finances.

use std::collections::HashMap;

use diesel::connection::SimpleConnection;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use crate::db::schema::{
    app_settings, auto_category_rules, budget_months, captured_payments, category_budgets,
    expense_categories, income_sources, revolut_accounts, sync_state, transactions,
};
use crate::error::AppError;
use crate::money::format_cents;
use crate::repository::{
    budget_month_repository, category_budget_repository, expense_category_repository,
    income_source_repository, transaction_repository,
};

/// Columns of the export, in order.
pub const CSV_HEADER: [&str; 12] = [
    "record",
    "date",
    "month",
    "type",
    "amount",
    "currency",
    "description",
    "category",
    "income_source",
    "status",
    "limit",
    "savings_target",
];

/// The word the app must send to confirm deleting everything.
pub const DELETE_CONFIRMATION: &str = "DELETE";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CsvExport {
    /// e.g. "vise-export-2026-10-04.csv"
    pub filename: String,
    pub csv: String,
    pub transaction_count: usize,
    pub budget_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteAllInput {
    /// Must be exactly "DELETE"; guards against an accidental call.
    pub confirm: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DeletedCounts {
    pub transactions: usize,
    pub categories: usize,
    pub income_sources: usize,
    pub budgets: usize,
}

/// Counts shown in the "Delete all my data?" warning, so the user sees
/// exactly what will be erased.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DataOverview {
    pub transactions: i64,
    pub categories: i64,
    pub income_sources: i64,
    pub budgets: i64,
}

pub fn get_data_overview(connection: &mut SqliteConnection) -> Result<DataOverview, AppError> {
    let month_budgets: i64 = budget_months::table.count().get_result(connection)?;
    let category_limits: i64 = category_budgets::table.count().get_result(connection)?;
    Ok(DataOverview {
        transactions: transactions::table.count().get_result(connection)?,
        categories: expense_categories::table.count().get_result(connection)?,
        income_sources: income_sources::table.count().get_result(connection)?,
        budgets: month_budgets + category_limits,
    })
}

/// Builds the CSV export of everything the user has entered.
pub fn export_csv(connection: &mut SqliteConnection, today: &str) -> Result<CsvExport, AppError> {
    let today = chrono::NaiveDate::parse_from_str(today.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::validation("today", "Enter a date in YYYY-MM-DD format"))?;

    let categories: HashMap<i32, String> = expense_category_repository::get_all(connection)?
        .into_iter()
        .filter_map(|c| c.id.map(|id| (id, c.name)))
        .collect();
    let sources: HashMap<i32, String> = income_source_repository::get_all(connection)?
        .into_iter()
        .filter_map(|s| s.id.map(|id| (id, s.name)))
        .collect();
    let name_of = |map: &HashMap<i32, String>, id: Option<i32>| {
        id.and_then(|id| map.get(&id)).cloned().unwrap_or_default()
    };

    let mut transactions = transaction_repository::get_all(connection)?;
    transactions.sort_by_key(|t| (t.occurred_at, t.id));

    let mut writer = csv::Writer::from_writer(Vec::new());
    let mut write = |row: [String; 12]| writer.write_record(row).map_err(csv_error);
    write(CSV_HEADER.map(String::from))?;

    for t in &transactions {
        let date = chrono::DateTime::from_timestamp(t.occurred_at, 0)
            .map(|d| d.date_naive())
            .unwrap_or_default();
        write([
            "transaction".into(),
            date.format("%Y-%m-%d").to_string(),
            date.format("%Y-%m").to_string(),
            t.transaction_type.clone(),
            format_cents(t.amount_cents),
            t.currency.clone(),
            safe_text(&t.description),
            safe_text(&name_of(&categories, t.expense_category_id)),
            safe_text(&name_of(&sources, t.income_source_id)),
            t.status.clone(),
            String::new(),
            String::new(),
        ])?;
    }

    let mut budget_count = 0;
    let mut months = budget_month_repository::get_all(connection)?;
    months.sort_by(|a, b| (&a.month, &a.currency).cmp(&(&b.month, &b.currency)));
    for month in &months {
        if month.spending_limit_cents.is_some() || month.savings_target_cents.is_some() {
            budget_count += 1;
            write([
                "month_budget".into(),
                String::new(),
                month.month.clone(),
                String::new(),
                String::new(),
                month.currency.clone(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                month
                    .spending_limit_cents
                    .map(format_cents)
                    .unwrap_or_default(),
                month
                    .savings_target_cents
                    .map(format_cents)
                    .unwrap_or_default(),
            ])?;
        }
        let Some(month_id) = month.id else { continue };
        let mut limits = category_budget_repository::get_for_budget_month(connection, month_id)?;
        limits.sort_by_key(|l| name_of(&categories, Some(l.expense_category_id)));
        for limit in limits {
            budget_count += 1;
            write([
                "category_budget".into(),
                String::new(),
                month.month.clone(),
                String::new(),
                String::new(),
                month.currency.clone(),
                String::new(),
                safe_text(&name_of(&categories, Some(limit.expense_category_id))),
                String::new(),
                String::new(),
                format_cents(limit.limit_cents),
                String::new(),
            ])?;
        }
    }

    let bytes = writer.into_inner().map_err(|e| csv_error(e.into_error()))?;
    let csv = String::from_utf8(bytes)
        .map_err(|_| AppError::InvalidRequest("The export was not valid text".to_string()))?;

    Ok(CsvExport {
        filename: format!("vise-export-{}.csv", today.format("%Y-%m-%d")),
        csv,
        transaction_count: transactions.len(),
        budget_count,
    })
}

/// Spreadsheet apps run cells that start with `=`, `+`, `-`, `@` (or a
/// tab/CR) as formulas. Prefixing an apostrophe keeps user text inert
/// when the export is opened in Excel or Sheets.
fn safe_text(value: &str) -> String {
    match value.chars().next() {
        Some('=' | '+' | '-' | '@' | '\t' | '\r') => format!("'{value}"),
        _ => value.to_string(),
    }
}

fn csv_error(error: impl std::fmt::Display) -> AppError {
    AppError::InvalidRequest(format!("Could not build the CSV export: {error}"))
}

/// Erases all user data in one transaction and resets the settings row.
pub fn delete_all_data(
    connection: &mut SqliteConnection,
    input: &DeleteAllInput,
) -> Result<DeletedCounts, AppError> {
    if input.confirm != DELETE_CONFIRMATION {
        return Err(AppError::validation(
            "confirm",
            "Confirm that you want to delete all your data",
        ));
    }

    let counts = connection.transaction::<DeletedCounts, AppError, _>(|connection| {
        // Children before parents, so foreign keys are never violated.
        // The inbox first: it points at transactions and categories.
        diesel::delete(captured_payments::table).execute(connection)?;
        let transactions = diesel::delete(transactions::table).execute(connection)?;
        let category_limits = diesel::delete(category_budgets::table).execute(connection)?;
        let month_budgets = diesel::delete(budget_months::table).execute(connection)?;
        diesel::delete(auto_category_rules::table).execute(connection)?;
        diesel::delete(sync_state::table).execute(connection)?;
        diesel::delete(revolut_accounts::table).execute(connection)?;

        diesel::update(app_settings::table.filter(app_settings::id.eq(1)))
            .set((
                app_settings::currency.eq("EUR"),
                app_settings::display_name.eq(None::<String>),
                app_settings::monthly_income_cents.eq(None::<i64>),
                app_settings::income_source_id.eq(None::<i32>),
                app_settings::warning_threshold_percent.eq(80),
                app_settings::onboarding_completed_at.eq(None::<i64>),
                app_settings::avatar.eq(None::<String>),
                app_settings::backup_folder.eq(None::<String>),
                app_settings::last_backup_at.eq(None::<i64>),
            ))
            .execute(connection)?;

        let categories = diesel::delete(expense_categories::table).execute(connection)?;
        let income_sources = diesel::delete(income_sources::table).execute(connection)?;

        Ok(DeletedCounts {
            transactions,
            categories,
            income_sources,
            budgets: category_limits + month_budgets,
        })
    })?;

    // SQLite keeps deleted rows in free pages until the file is rebuilt.
    // The delete has already been committed, so a failed VACUUM does not
    // bring any data back; it only leaves the file larger.
    let _ = connection.batch_execute("VACUUM;");

    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;
    use crate::service::settings::{
        OnboardingCategory, OnboardingInput, OnboardingTransaction, UpdateSettingsInput,
        complete_onboarding, get_settings, update_settings,
    };
    use crate::service::{self, MonthBudgetInput, NewTransactionInput};

    fn onboarded() -> SqliteConnection {
        let mut connection = establish_connection_test().unwrap();
        complete_onboarding(
            &mut connection,
            &OnboardingInput {
                currency: "EUR".to_string(),
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
                    description: "Tesco, \"Express\"".to_string(),
                    date: "2026-09-18".to_string(),
                    category: Some(OnboardingCategory {
                        name: "Groceries".to_string(),
                        icon: None,
                    }),
                }),
            },
        )
        .unwrap();
        connection
    }

    #[test]
    fn export_contains_every_record_and_parses_back() {
        let mut connection = onboarded();
        let salary = get_settings(&mut connection).unwrap().income_source_id;
        service::add_transaction(
            &mut connection,
            &NewTransactionInput {
                transaction_type: "income".to_string(),
                amount: "4250".to_string(),
                currency: "EUR".to_string(),
                description: "=HYPERLINK(\"x\")".to_string(),
                date: "2026-09-01".to_string(),
                expense_category_id: None,
                income_source_id: salary,
            },
        )
        .unwrap();
        service::set_month_budget(
            &mut connection,
            &MonthBudgetInput {
                month: "2026-09".to_string(),
                currency: "EUR".to_string(),
                spending_limit: Some("2000".to_string()),
                savings_target: Some("300".to_string()),
            },
        )
        .unwrap();

        let export = export_csv(&mut connection, "2026-10-04").unwrap();

        assert_eq!(export.filename, "vise-export-2026-10-04.csv");
        assert_eq!(export.transaction_count, 2);
        assert_eq!(export.budget_count, 2);

        let mut reader = csv::Reader::from_reader(export.csv.as_bytes());
        assert_eq!(reader.headers().unwrap(), CSV_HEADER.as_slice());
        let rows: Vec<csv::StringRecord> = reader.records().map(Result::unwrap).collect();
        assert_eq!(rows.len(), 4);

        // Oldest transaction first; the formula is neutralised.
        assert_eq!(&rows[0][0], "transaction");
        assert_eq!(&rows[0][1], "2026-09-01");
        assert_eq!(&rows[0][4], "4250.00");
        assert_eq!(&rows[0][6], "'=HYPERLINK(\"x\")");
        assert_eq!(&rows[0][8], "Salary");

        // Commas and quotes survive the round trip.
        assert_eq!(&rows[1][6], "Tesco, \"Express\"");
        assert_eq!(&rows[1][7], "Groceries");
        assert_eq!(crate::money::parse_amount_cents(&rows[1][4]), Ok(4_280));

        assert_eq!(&rows[2][0], "month_budget");
        assert_eq!((&rows[2][10], &rows[2][11]), ("2000.00", "300.00"));
        assert_eq!(&rows[3][0], "category_budget");
        assert_eq!((&rows[3][7], &rows[3][10]), ("Groceries", "500.00"));
    }

    #[test]
    fn export_of_an_empty_database_is_just_the_header() {
        let mut connection = establish_connection_test().unwrap();
        let export = export_csv(&mut connection, "2026-10-04").unwrap();
        assert_eq!(export.transaction_count, 0);
        assert_eq!(export.csv.trim(), CSV_HEADER.join(","));
        assert!(matches!(
            export_csv(&mut connection, "04/10/2026"),
            Err(AppError::Validation { .. })
        ));
    }

    #[test]
    fn delete_all_needs_confirmation() {
        let mut connection = onboarded();
        let error = delete_all_data(
            &mut connection,
            &DeleteAllInput {
                confirm: "delete".to_string(),
            },
        )
        .unwrap_err();
        assert!(matches!(error, AppError::Validation { ref field, .. } if field == "confirm"));
        assert_eq!(get_data_overview(&mut connection).unwrap().transactions, 1);
    }

    #[test]
    fn delete_all_erases_everything_and_restarts_onboarding() {
        let mut connection = onboarded();
        let mut theme = UpdateSettingsInput {
            backup_folder: None,
            currency: None,
            display_name: None,
            monthly_income: None,
            income_source_id: None,
            warning_threshold_percent: Some(70),
            theme: Some("dark".to_string()),
            avatar: Some("cat".to_string()),
        };
        update_settings(&mut connection, &theme).unwrap();

        let before = get_data_overview(&mut connection).unwrap();
        assert_eq!(
            (
                before.transactions,
                before.categories,
                before.income_sources,
                before.budgets
            ),
            (1, 1, 1, 2)
        );

        let deleted = delete_all_data(
            &mut connection,
            &DeleteAllInput {
                confirm: DELETE_CONFIRMATION.to_string(),
            },
        )
        .unwrap();
        assert_eq!(deleted.transactions, 1);

        let after = get_data_overview(&mut connection).unwrap();
        assert_eq!(
            (
                after.transactions,
                after.categories,
                after.income_sources,
                after.budgets
            ),
            (0, 0, 0, 0)
        );

        let settings = get_settings(&mut connection).unwrap();
        assert!(!settings.onboarding_completed);
        assert_eq!(settings.display_name, None);
        assert_eq!(settings.monthly_income_cents, None);
        assert_eq!(settings.warning_threshold_percent, 80);
        assert_eq!(settings.avatar, None);
        // The device preference survives.
        assert_eq!(settings.theme, "dark");

        // Onboarding can run again on the emptied database.
        theme.theme = None;
        theme.avatar = None;
        assert!(update_settings(&mut connection, &theme).is_ok());
    }

    #[test]
    fn failed_delete_rolls_back_everything() {
        let mut connection = onboarded();
        connection
            .batch_execute(
                "CREATE TRIGGER block_settings BEFORE UPDATE ON app_settings
                 BEGIN SELECT RAISE(ABORT, 'blocked'); END;",
            )
            .unwrap();

        let error = delete_all_data(
            &mut connection,
            &DeleteAllInput {
                confirm: DELETE_CONFIRMATION.to_string(),
            },
        )
        .unwrap_err();

        assert!(matches!(error, AppError::Database(_)));
        let overview = get_data_overview(&mut connection).unwrap();
        assert_eq!((overview.transactions, overview.budgets), (1, 2));
        assert!(get_settings(&mut connection).unwrap().onboarding_completed);
    }
}
