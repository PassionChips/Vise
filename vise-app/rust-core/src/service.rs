//! Use cases the app performs, such as "add a transaction" or "show this
//! month's summary".
//!
//! Each function follows the same three steps:
//! 1. validate the input (turning UI strings into typed values),
//! 2. load or save data through the `repository` functions,
//! 3. run the pure `calculations` and return a serialisable result.
//!
//! The frontend never does money maths or validation itself; it sends the
//! raw form values here and displays what comes back.

use chrono::NaiveDate;
use diesel::result::{DatabaseErrorKind, Error as DieselError};
use diesel::sqlite::SqliteConnection;
use serde::Deserialize;
use std::collections::HashMap;

use crate::calculations::analytics::{self, CategoryBreakdown, MonthSpending};
use crate::calculations::budget_check;
use crate::calculations::predictions::{self, Prediction};
use crate::calculations::summary::{self, MonthlySummary};
use crate::calculations::totals;
use crate::error::AppError;
use crate::models::budget_month::{BudgetMonth, NewBudgetMonth, UpdateBudgetMonth};
use crate::models::category_budget::{CategoryBudget, NewCategoryBudget};
use crate::models::expense_category::{ExpenseCategory, NewExpenseCategory};
use crate::models::income_source::{IncomeSource, NewIncomeSource};
use crate::models::transaction::{NewTransaction, Transaction};
use crate::money::{parse_amount_cents, parse_limit_cents};
use crate::month::YearMonth;
use crate::repository::{
    budget_month_repository, category_budget_repository, expense_category_repository,
    income_source_repository, transaction_repository,
};

/// Longest description or name accepted from the UI.
pub const MAX_TEXT_LENGTH: usize = 100;
/// How many months of history the prediction looks at.
pub const PREDICTION_LOOKBACK_MONTHS: u32 = 6;
/// Upper bound for the trend chart, to keep the query small.
pub const MAX_TREND_MONTHS: u32 = 24;

// ---------------------------------------------------------------------------
// Inputs (exactly what the frontend sends, as JSON)
// ---------------------------------------------------------------------------

/// Form values for a new transaction. Amount and date stay as the strings
/// the user typed; Rust does the parsing.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewTransactionInput {
    pub transaction_type: String,
    /// e.g. "12.50"
    pub amount: String,
    pub currency: String,
    pub description: String,
    /// "YYYY-MM-DD"
    pub date: String,
    #[serde(default)]
    pub expense_category_id: Option<i32>,
    #[serde(default)]
    pub income_source_id: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewCategoryInput {
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    /// "#RRGGBB"
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewIncomeSourceInput {
    pub name: String,
}

/// Monthly totals. An empty or missing string clears the value.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MonthBudgetInput {
    pub month: String,
    pub currency: String,
    #[serde(default)]
    pub spending_limit: Option<String>,
    #[serde(default)]
    pub savings_target: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CategoryBudgetInput {
    pub month: String,
    pub currency: String,
    pub expense_category_id: i32,
    pub limit: String,
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: [&str; 4] = ["income", "expense", "refund", "transfer"];

fn validate_month(month: &str) -> Result<YearMonth, AppError> {
    YearMonth::parse(month.trim()).map_err(|message| AppError::validation("month", message))
}

/// Currencies are three-letter ISO codes such as "EUR". Lower case input
/// is accepted and upper-cased.
pub fn validate_currency(currency: &str) -> Result<String, AppError> {
    let code = currency.trim().to_ascii_uppercase();
    if code.len() == 3 && code.chars().all(|c| c.is_ascii_uppercase()) {
        Ok(code)
    } else {
        Err(AppError::validation(
            "currency",
            "Use a three-letter currency code such as EUR",
        ))
    }
}

/// Trims text and checks it is present and not too long.
fn validate_text(field: &str, label: &str, value: &str) -> Result<String, AppError> {
    let text = value.trim();
    if text.is_empty() {
        return Err(AppError::validation(field, format!("Enter a {label}")));
    }
    if text.chars().count() > MAX_TEXT_LENGTH {
        return Err(AppError::validation(
            field,
            format!("Keep the {label} under {MAX_TEXT_LENGTH} characters"),
        ));
    }
    Ok(text.to_string())
}

fn validate_color(color: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(color) = color.map(str::trim).filter(|c| !c.is_empty()) else {
        return Ok(None);
    };
    let hex = color.strip_prefix('#').unwrap_or("");
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(Some(color.to_ascii_uppercase()))
    } else {
        Err(AppError::validation(
            "color",
            "Use a colour in #RRGGBB format",
        ))
    }
}

/// Parses an optional limit; `None` or blank means "no limit".
fn validate_optional_limit(field: &str, value: Option<&str>) -> Result<Option<i64>, AppError> {
    match value.map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(text) => parse_limit_cents(text)
            .map(Some)
            .map_err(|message| AppError::validation(field, message)),
    }
}

/// Turns form input into a row ready to insert. Checks only the input
/// itself; `add_transaction` also checks that referenced ids exist.
pub fn validate_new_transaction(input: &NewTransactionInput) -> Result<NewTransaction, AppError> {
    let transaction_type = input.transaction_type.trim();
    if !TRANSACTION_TYPES.contains(&transaction_type) {
        return Err(AppError::validation(
            "transaction_type",
            "Choose income, expense, refund or transfer",
        ));
    }

    let amount_cents = parse_amount_cents(&input.amount)
        .map_err(|message| AppError::validation("amount", message))?;
    let currency = validate_currency(&input.currency)?;
    let description = validate_text("description", "description", &input.description)?;

    let occurred_at = NaiveDate::parse_from_str(input.date.trim(), "%Y-%m-%d")
        .ok()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .map(|datetime| datetime.and_utc().timestamp())
        .ok_or_else(|| AppError::validation("date", "Enter a date in YYYY-MM-DD format"))?;

    // Income is tracked by source, spending by category; mixing them
    // would make the totals ambiguous.
    if transaction_type == "income" && input.expense_category_id.is_some() {
        return Err(AppError::validation(
            "expense_category_id",
            "Income cannot have an expense category",
        ));
    }
    if transaction_type != "income" && input.income_source_id.is_some() {
        return Err(AppError::validation(
            "income_source_id",
            "Only income can have an income source",
        ));
    }

    Ok(NewTransaction {
        source_type: "manual".to_string(),
        transaction_type: transaction_type.to_string(),
        amount_cents,
        currency,
        description,
        occurred_at,
        income_source_id: input.income_source_id,
        expense_category_id: input.expense_category_id,
        external_id: None,
        revolut_account_id: None,
        merchant_name: None,
        raw_description: None,
        revolut_category: None,
        status: "completed".to_string(),
        completed_at: Some(occurred_at),
        exclude_from_totals: transaction_type == "transfer",
    })
}

/// Turns a UNIQUE constraint failure into a friendly validation error.
fn duplicate_name_error(error: DieselError, field: &str, name: &str) -> AppError {
    match error {
        DieselError::DatabaseError(DatabaseErrorKind::UniqueViolation, _) => {
            AppError::validation(field, format!("'{name}' already exists"))
        }
        other => AppError::Database(other),
    }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

pub fn add_transaction(
    connection: &mut SqliteConnection,
    input: &NewTransactionInput,
) -> Result<Transaction, AppError> {
    let new_transaction = validate_new_transaction(input)?;

    if let Some(id) = new_transaction.expense_category_id
        && expense_category_repository::get_by_id(connection, id)?.is_none()
    {
        return Err(AppError::validation(
            "expense_category_id",
            "That category no longer exists",
        ));
    }
    if let Some(id) = new_transaction.income_source_id
        && income_source_repository::get_by_id(connection, id)?.is_none()
    {
        return Err(AppError::validation(
            "income_source_id",
            "That income source no longer exists",
        ));
    }

    Ok(transaction_repository::insert(
        connection,
        &new_transaction,
    )?)
}

pub fn delete_transaction(connection: &mut SqliteConnection, id: i32) -> Result<(), AppError> {
    if transaction_repository::delete(connection, id)? {
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "Transaction {id} was not found"
        )))
    }
}

/// All transactions in a month, newest first.
pub fn list_transactions(
    connection: &mut SqliteConnection,
    month: &str,
) -> Result<Vec<Transaction>, AppError> {
    let month = validate_month(month)?;
    Ok(transaction_repository::get_in_range(
        connection,
        month.start_timestamp(),
        month.end_timestamp(),
    )?)
}

// ---------------------------------------------------------------------------
// Categories and income sources
// ---------------------------------------------------------------------------

pub fn list_categories(
    connection: &mut SqliteConnection,
) -> Result<Vec<ExpenseCategory>, AppError> {
    Ok(expense_category_repository::get_all(connection)?)
}

pub fn add_category(
    connection: &mut SqliteConnection,
    input: &NewCategoryInput,
) -> Result<ExpenseCategory, AppError> {
    let name = validate_text("name", "category name", &input.name)?;
    let new_category = NewExpenseCategory {
        name: name.clone(),
        icon: input
            .icon
            .as_deref()
            .map(str::trim)
            .filter(|i| !i.is_empty())
            .map(String::from),
        color: validate_color(input.color.as_deref())?,
        is_default: false,
        is_active: true,
    };
    expense_category_repository::insert(connection, &new_category)
        .map_err(|error| duplicate_name_error(error, "name", &name))
}

pub fn list_income_sources(
    connection: &mut SqliteConnection,
) -> Result<Vec<IncomeSource>, AppError> {
    Ok(income_source_repository::get_all(connection)?)
}

pub fn add_income_source(
    connection: &mut SqliteConnection,
    input: &NewIncomeSourceInput,
) -> Result<IncomeSource, AppError> {
    let name = validate_text("name", "income source name", &input.name)?;
    income_source_repository::insert(
        connection,
        &NewIncomeSource {
            name: name.clone(),
            is_active: true,
        },
    )
    .map_err(|error| duplicate_name_error(error, "name", &name))
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/// Returns the budget row for the month, creating an empty one if needed.
fn get_or_create_budget_month(
    connection: &mut SqliteConnection,
    month: YearMonth,
    currency: &str,
) -> Result<BudgetMonth, AppError> {
    let month_text = month.to_string();
    if let Some(existing) =
        budget_month_repository::get_by_month(connection, &month_text, currency)?
    {
        return Ok(existing);
    }
    Ok(budget_month_repository::insert(
        connection,
        &NewBudgetMonth {
            month: month_text,
            currency: currency.to_string(),
            spending_limit_cents: None,
            savings_target_cents: None,
        },
    )?)
}

/// Sets (or clears) the overall spending limit and savings target.
pub fn set_month_budget(
    connection: &mut SqliteConnection,
    input: &MonthBudgetInput,
) -> Result<BudgetMonth, AppError> {
    let month = validate_month(&input.month)?;
    let currency = validate_currency(&input.currency)?;
    let spending_limit =
        validate_optional_limit("spending_limit", input.spending_limit.as_deref())?;
    let savings_target =
        validate_optional_limit("savings_target", input.savings_target.as_deref())?;

    let budget = get_or_create_budget_month(connection, month, &currency)?;
    let id = budget
        .id
        .ok_or_else(|| AppError::NotFound("Budget month has no id".to_string()))?;
    let changes = UpdateBudgetMonth {
        spending_limit_cents: Some(spending_limit),
        savings_target_cents: Some(savings_target),
        ..Default::default()
    };
    budget_month_repository::update(connection, id, &changes)?
        .ok_or_else(|| AppError::NotFound(format!("Budget for {month} was not found")))
}

/// Sets the spending limit for one category in one month.
pub fn set_category_budget(
    connection: &mut SqliteConnection,
    input: &CategoryBudgetInput,
) -> Result<CategoryBudget, AppError> {
    let month = validate_month(&input.month)?;
    let currency = validate_currency(&input.currency)?;
    let limit_cents = parse_limit_cents(&input.limit)
        .map_err(|message| AppError::validation("limit", message))?;

    if expense_category_repository::get_by_id(connection, input.expense_category_id)?.is_none() {
        return Err(AppError::validation(
            "expense_category_id",
            "That category no longer exists",
        ));
    }

    let budget = get_or_create_budget_month(connection, month, &currency)?;
    let budget_month_id = budget
        .id
        .ok_or_else(|| AppError::NotFound("Budget month has no id".to_string()))?;

    Ok(category_budget_repository::upsert(
        connection,
        &NewCategoryBudget {
            budget_month_id,
            expense_category_id: input.expense_category_id,
            limit_cents,
        },
    )?)
}

// ---------------------------------------------------------------------------
// Summaries, reports and predictions
// ---------------------------------------------------------------------------

pub fn get_monthly_summary(
    connection: &mut SqliteConnection,
    month: &str,
    currency: &str,
) -> Result<MonthlySummary, AppError> {
    let month = validate_month(month)?;
    let currency = validate_currency(currency)?;

    let transactions = transaction_repository::get_in_range(
        connection,
        month.start_timestamp(),
        month.end_timestamp(),
    )?;
    let categories = expense_category_repository::get_all(connection)?;
    let budget = budget_month_repository::get_by_month(connection, &month.to_string(), &currency)?;

    let limits: HashMap<i32, i64> = match budget.as_ref().and_then(|b| b.id) {
        Some(budget_id) => category_budget_repository::get_for_budget_month(connection, budget_id)?
            .into_iter()
            .map(|limit| (limit.expense_category_id, limit.limit_cents))
            .collect(),
        None => HashMap::new(),
    };

    let month_totals = totals::month_totals(&transactions, &currency);
    let category_rows =
        budget_check::check_categories(&categories, &month_totals.spent_by_category, &limits);

    Ok(summary::build_summary(
        month,
        &currency,
        &month_totals,
        budget.as_ref(),
        category_rows,
    ))
}

pub fn get_category_breakdown(
    connection: &mut SqliteConnection,
    month: &str,
    currency: &str,
) -> Result<Vec<CategoryBreakdown>, AppError> {
    let summary = get_monthly_summary(connection, month, currency)?;
    Ok(analytics::category_breakdown(&summary.categories))
}

/// Spending for `months` months ending with (and including) `month`.
pub fn get_spending_trend(
    connection: &mut SqliteConnection,
    month: &str,
    currency: &str,
    months: u32,
) -> Result<Vec<MonthSpending>, AppError> {
    let last = validate_month(month)?;
    let currency = validate_currency(currency)?;
    if !(1..=MAX_TREND_MONTHS).contains(&months) {
        return Err(AppError::validation(
            "months",
            format!("Choose between 1 and {MAX_TREND_MONTHS} months"),
        ));
    }

    let first = (1..months).fold(last, |m, _| m.previous());
    let transactions = transaction_repository::get_in_range(
        connection,
        first.start_timestamp(),
        last.end_timestamp(),
    )?;
    let by_month = totals::spending_by_month(&transactions, &currency);

    Ok(analytics::spending_trend(&by_month, first, last))
}

/// Predicts spending for `month` from the months before it.
///
/// Months before your first recorded spending are skipped, so a new user
/// is not predicted to spend almost nothing because of empty early months.
pub fn predict_spending(
    connection: &mut SqliteConnection,
    month: &str,
    currency: &str,
) -> Result<Prediction, AppError> {
    let target = validate_month(month)?;
    let currency = validate_currency(currency)?;

    let last = target.previous();
    let first = (1..PREDICTION_LOOKBACK_MONTHS).fold(last, |m, _| m.previous());
    let transactions = transaction_repository::get_in_range(
        connection,
        first.start_timestamp(),
        last.end_timestamp(),
    )?;
    let by_month = totals::spending_by_month(&transactions, &currency);

    let history: Vec<i64> = analytics::spending_trend(&by_month, first, last)
        .into_iter()
        .map(|m| m.spent_cents)
        .skip_while(|&spent| spent == 0)
        .collect();

    let (predicted, method) = predictions::predict_next(&history);
    Ok(Prediction {
        month: target.to_string(),
        predicted_spent_cents: predicted,
        method,
        months_used: history.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calculations::budget_check::BudgetStatus;
    use crate::calculations::predictions::PredictionMethod;
    use crate::db::connection::establish_connection_test;

    fn expense(amount: &str, date: &str, category: Option<i32>) -> NewTransactionInput {
        NewTransactionInput {
            transaction_type: "expense".to_string(),
            amount: amount.to_string(),
            currency: "EUR".to_string(),
            description: "Test".to_string(),
            date: date.to_string(),
            expense_category_id: category,
            income_source_id: None,
        }
    }

    fn field_of(error: AppError) -> String {
        match error {
            AppError::Validation { field, .. } => field,
            other => panic!("expected validation error, got {other:?}"),
        }
    }

    fn category(connection: &mut SqliteConnection, name: &str) -> i32 {
        add_category(
            connection,
            &NewCategoryInput {
                name: name.to_string(),
                icon: None,
                color: None,
            },
        )
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn validation_reports_the_offending_field() {
        let mut bad_amount = expense("abc", "2026-09-01", None);
        assert_eq!(
            field_of(validate_new_transaction(&bad_amount).unwrap_err()),
            "amount"
        );

        bad_amount.amount = "10".to_string();
        bad_amount.date = "2026-02-30".to_string();
        assert_eq!(
            field_of(validate_new_transaction(&bad_amount).unwrap_err()),
            "date"
        );

        let mut bad_type = expense("10", "2026-09-01", None);
        bad_type.transaction_type = "gift".to_string();
        assert_eq!(
            field_of(validate_new_transaction(&bad_type).unwrap_err()),
            "transaction_type"
        );

        let mut blank = expense("10", "2026-09-01", None);
        blank.description = "   ".to_string();
        assert_eq!(
            field_of(validate_new_transaction(&blank).unwrap_err()),
            "description"
        );

        let mut bad_currency = expense("10", "2026-09-01", None);
        bad_currency.currency = "EU".to_string();
        assert_eq!(
            field_of(validate_new_transaction(&bad_currency).unwrap_err()),
            "currency"
        );

        let mut income_with_category = expense("10", "2026-09-01", Some(1));
        income_with_category.transaction_type = "income".to_string();
        assert_eq!(
            field_of(validate_new_transaction(&income_with_category).unwrap_err()),
            "expense_category_id"
        );
    }

    #[test]
    fn validation_normalises_input() {
        let mut input = expense(" 12,50 ", "2026-09-15", None);
        input.currency = "eur".to_string();
        input.description = "  Lunch  ".to_string();

        let transaction = validate_new_transaction(&input).unwrap();

        assert_eq!(transaction.amount_cents, 1250);
        assert_eq!(transaction.currency, "EUR");
        assert_eq!(transaction.description, "Lunch");
        assert_eq!(transaction.occurred_at, 1_789_430_400); // 2026-09-15T00:00:00Z
    }

    #[test]
    fn transfers_are_excluded_from_totals() {
        let mut input = expense("100", "2026-09-01", None);
        input.transaction_type = "transfer".to_string();
        assert!(
            validate_new_transaction(&input)
                .unwrap()
                .exclude_from_totals
        );
    }

    #[test]
    fn add_transaction_rejects_missing_category() {
        let mut connection = establish_connection_test().unwrap();
        let error =
            add_transaction(&mut connection, &expense("10", "2026-09-01", Some(42))).unwrap_err();
        assert_eq!(field_of(error), "expense_category_id");
    }

    #[test]
    fn duplicate_category_name_is_a_validation_error() {
        let mut connection = establish_connection_test().unwrap();
        category(&mut connection, "Groceries");

        let error = add_category(
            &mut connection,
            &NewCategoryInput {
                name: "groceries".to_string(), // the column is COLLATE NOCASE
                icon: None,
                color: None,
            },
        )
        .unwrap_err();

        assert_eq!(field_of(error), "name");
    }

    #[test]
    fn invalid_colour_is_rejected() {
        let mut connection = establish_connection_test().unwrap();
        let error = add_category(
            &mut connection,
            &NewCategoryInput {
                name: "Fun".to_string(),
                icon: None,
                color: Some("red".to_string()),
            },
        )
        .unwrap_err();
        assert_eq!(field_of(error), "color");
    }

    #[test]
    fn delete_missing_transaction_is_not_found() {
        let mut connection = establish_connection_test().unwrap();
        assert!(matches!(
            delete_transaction(&mut connection, 1),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn monthly_summary_end_to_end() {
        let mut connection = establish_connection_test().unwrap();
        let groceries = category(&mut connection, "Groceries");
        let transport = category(&mut connection, "Transport");

        let mut salary = expense("3200", "2026-09-01", None);
        salary.transaction_type = "income".to_string();
        for input in [
            salary,
            expense("250", "2026-09-03", Some(groceries)),
            expense("80.50", "2026-09-20", Some(groceries)),
            expense("40", "2026-09-30", Some(transport)),
            expense("999", "2026-10-01", Some(transport)), // next month
        ] {
            add_transaction(&mut connection, &input).unwrap();
        }
        set_month_budget(
            &mut connection,
            &MonthBudgetInput {
                month: "2026-09".to_string(),
                currency: "EUR".to_string(),
                spending_limit: Some("2000".to_string()),
                savings_target: Some("500".to_string()),
            },
        )
        .unwrap();
        set_category_budget(
            &mut connection,
            &CategoryBudgetInput {
                month: "2026-09".to_string(),
                currency: "EUR".to_string(),
                expense_category_id: groceries,
                limit: "300".to_string(),
            },
        )
        .unwrap();

        let summary = get_monthly_summary(&mut connection, "2026-09", "EUR").unwrap();

        assert_eq!(summary.income_cents, 320_000);
        assert_eq!(summary.spent_cents, 37_050);
        assert_eq!(summary.net_cents, 282_950);
        assert_eq!(summary.remaining_cents, Some(162_950));
        assert_eq!(summary.savings_target_met, Some(true));
        assert_eq!(summary.categories[0].status, BudgetStatus::OverLimit);
        assert_eq!(summary.categories[0].remaining_cents, Some(-3_050));
        assert_eq!(summary.categories[1].status, BudgetStatus::NoLimit);

        let breakdown = get_category_breakdown(&mut connection, "2026-09", "EUR").unwrap();
        assert_eq!(breakdown[0].name, "Groceries");

        assert_eq!(
            list_transactions(&mut connection, "2026-09").unwrap().len(),
            4
        );
    }

    #[test]
    fn set_month_budget_can_clear_values() {
        let mut connection = establish_connection_test().unwrap();
        let mut input = MonthBudgetInput {
            month: "2026-09".to_string(),
            currency: "EUR".to_string(),
            spending_limit: Some("100".to_string()),
            savings_target: None,
        };
        set_month_budget(&mut connection, &input).unwrap();

        input.spending_limit = Some(String::new());
        let cleared = set_month_budget(&mut connection, &input).unwrap();

        assert_eq!(cleared.spending_limit_cents, None);
        assert_eq!(
            budget_month_repository::get_all(&mut connection)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn trend_and_prediction_use_history() {
        let mut connection = establish_connection_test().unwrap();
        for (amount, date) in [
            ("100", "2026-06-10"),
            ("200", "2026-07-10"),
            ("300", "2026-08-10"),
        ] {
            add_transaction(&mut connection, &expense(amount, date, None)).unwrap();
        }

        let trend = get_spending_trend(&mut connection, "2026-08", "EUR", 4).unwrap();
        let values: Vec<i64> = trend.iter().map(|m| m.spent_cents).collect();
        assert_eq!(values, vec![0, 10_000, 20_000, 30_000]);

        let prediction = predict_spending(&mut connection, "2026-09", "EUR").unwrap();
        assert_eq!(prediction.method, PredictionMethod::LinearRegression);
        assert_eq!(prediction.months_used, 3); // empty months before June are skipped
        assert_eq!(prediction.predicted_spent_cents, 40_000);
    }

    #[test]
    fn prediction_without_history_is_zero() {
        let mut connection = establish_connection_test().unwrap();
        let prediction = predict_spending(&mut connection, "2026-09", "EUR").unwrap();
        assert_eq!(prediction.method, PredictionMethod::NoData);
        assert_eq!(prediction.predicted_spent_cents, 0);
    }

    #[test]
    fn trend_rejects_out_of_range_month_counts() {
        let mut connection = establish_connection_test().unwrap();
        let error = get_spending_trend(&mut connection, "2026-09", "EUR", 0).unwrap_err();
        assert_eq!(field_of(error), "months");
    }
}
