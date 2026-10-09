//! Payments noticed from notifications, waiting in an inbox for the user to confirm.
//!
//! ```text
//! notification from an allowed app ─▶ parse ─▶ captured_payments (pending) ─▶ user confirms ─▶ transaction
//!                                                                          └▶ user dismisses
//! ```
//!
//! Nothing is added to the user's transactions automatically, so a misread notification can never change a
//! total. The notification's text is kept only while the row is pending, so the user can see what was read, and
//! is emptied when it is confirmed or dismissed. Only apps in [`apps::SUPPORTED_PACKAGES`] are read; anything
//! else is dropped on the spot.

pub mod apps;
pub mod parser;

use chrono::NaiveDate;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::db::schema::captured_payments as cp;
use crate::error::AppError;
use crate::importer::categorize::{self, merchant_key};
use crate::money::format_cents;
use crate::repository::{
    app_settings_repository, expense_category_repository, transaction_repository,
};
use crate::service::{self, NewTransactionInput};

use apps::PaymentApp;
use parser::{Outcome, Parsed};

const EXCERPT_CHARS: usize = 300;
const DESCRIPTION_CHARS: usize = 100;
const INBOX_LIMIT: i64 = 200;
/// The same payment posted again within this window is the same payment.
const BUCKET_SECONDS: i64 = 600;
/// Resolved rows are kept this long, only so a re-posted notification is not captured again.
const KEEP_RESOLVED_SECONDS: i64 = 90 * 24 * 3600;
const SECONDS_PER_DAY: i64 = 86_400;

// ----- Input and output -----

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptureInput {
    /// The Android package that posted the notification.
    pub package: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub text: String,
    /// When it was posted, in unix seconds.
    pub posted_at: i64,
    /// The phone's local date at that moment, YYYY-MM-DD (so the transaction lands on the day the user paid).
    pub local_date: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct CaptureResult {
    /// "captured", "duplicate" (already seen), "ignored" (not a completed payment) or "unsupported_app".
    pub status: &'static str,
    pub id: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConfirmInput {
    pub id: i32,
    /// For an expense; defaults to the suggestion.
    #[serde(default)]
    pub expense_category_id: Option<i32>,
    /// For income.
    #[serde(default)]
    pub income_source_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DismissInput {
    pub id: i32,
}

/// A payment waiting for the user.
#[derive(Debug, Serialize, PartialEq)]
pub struct CapturedPayment {
    pub id: i32,
    /// "googlepay", "phonepe", ...
    pub app: String,
    pub app_name: String,
    /// "expense" or "income"; null if it was not clear.
    pub direction: Option<String>,
    pub amount_cents: Option<i64>,
    pub currency: Option<String>,
    pub merchant: Option<String>,
    pub reference: Option<String>,
    /// YYYY-MM-DD.
    pub occurred_on: String,
    pub occurred_at: i64,
    /// What the notification said, to show what was read.
    pub excerpt: String,
    pub suggested_category_id: Option<i32>,
    pub suggested_category_name: Option<String>,
    /// A transaction with the same day, amount and type already exists.
    pub possible_duplicate: bool,
    /// False if only an amount was found: the user has to add it themselves.
    pub understood: bool,
}

// ----- Rows -----

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = cp)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
struct Row {
    id: Option<i32>,
    app: String,
    direction: Option<String>,
    amount_cents: Option<i64>,
    currency: Option<String>,
    merchant: Option<String>,
    reference: Option<String>,
    occurred_at: i64,
    occurred_on: String,
    excerpt: String,
    suggested_category_id: Option<i32>,
    possible_duplicate: bool,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = cp)]
struct NewRow {
    app: String,
    direction: Option<String>,
    amount_cents: Option<i64>,
    currency: Option<String>,
    merchant: Option<String>,
    reference: Option<String>,
    occurred_at: i64,
    occurred_on: String,
    excerpt: String,
    suggested_category_id: Option<i32>,
    possible_duplicate: bool,
    fingerprint: String,
}

// ----- Capture -----

/// A stable fingerprint of a short text, to recognise the same notification posted again.
fn hash(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

fn fingerprint(app: PaymentApp, parsed: Option<&Parsed>, excerpt: &str, posted_at: i64) -> String {
    match parsed {
        // The same reference is the same payment, whichever notification carried it.
        Some(Parsed {
            reference: Some(reference),
            ..
        }) => format!("ref:{reference}"),
        Some(p) => format!(
            "pay:{}|{}|{}|{}|{}|{}",
            app.id(),
            p.direction.as_str(),
            p.amount_cents,
            p.currency.as_deref().unwrap_or("-"),
            p.merchant.as_deref().map(merchant_key).unwrap_or_default(),
            posted_at.div_euclid(BUCKET_SECONDS)
        ),
        None => format!(
            "text:{}|{:x}|{}",
            app.id(),
            hash(excerpt),
            posted_at.div_euclid(BUCKET_SECONDS)
        ),
    }
}

fn midnight(date: NaiveDate) -> i64 {
    date.and_hms_opt(0, 0, 0)
        .expect("midnight exists")
        .and_utc()
        .timestamp()
}

/// Reads one notification. Unknown apps and anything that is not a completed payment are dropped.
pub fn capture(
    connection: &mut SqliteConnection,
    input: &CaptureInput,
) -> Result<CaptureResult, AppError> {
    let Some(app) = PaymentApp::from_package(&input.package) else {
        return Ok(CaptureResult {
            status: "unsupported_app",
            id: None,
        });
    };
    let date = NaiveDate::parse_from_str(input.local_date.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::validation("local_date", "Enter a date in YYYY-MM-DD format"))?;

    let parsed = match parser::parse(app, &input.title, &input.text) {
        Outcome::Ignored => {
            return Ok(CaptureResult {
                status: "ignored",
                id: None,
            });
        }
        Outcome::Payment(parsed) => Some(parsed),
        Outcome::Unclear => None,
    };
    let excerpt: String = format!("{} · {}", input.title.trim(), input.text.trim())
        .trim_matches(|c: char| c == '·' || c.is_whitespace())
        .chars()
        .take(EXCERPT_CHARS)
        .collect();

    // The category the user usually files this merchant under, and whether they may have entered it already.
    let suggested = match parsed
        .as_ref()
        .filter(|p| p.direction == parser::Direction::Expense)
    {
        Some(Parsed {
            merchant: Some(name),
            ..
        }) => categorize::suggest_category(connection, name)?.and_then(|s| s.category_id),
        _ => None,
    };
    let possible_duplicate = match &parsed {
        Some(p) => {
            let start = midnight(date);
            transaction_repository::get_in_range(connection, start, start + SECONDS_PER_DAY)?
                .iter()
                .any(|t| {
                    t.amount_cents == p.amount_cents && t.transaction_type == p.direction.as_str()
                })
        }
        None => false,
    };

    let row = NewRow {
        app: app.id().to_string(),
        direction: parsed.as_ref().map(|p| p.direction.as_str().to_string()),
        amount_cents: parsed.as_ref().map(|p| p.amount_cents),
        currency: parsed.as_ref().and_then(|p| p.currency.clone()),
        merchant: parsed.as_ref().and_then(|p| p.merchant.clone()),
        reference: parsed.as_ref().and_then(|p| p.reference.clone()),
        occurred_at: input.posted_at,
        occurred_on: date.format("%Y-%m-%d").to_string(),
        suggested_category_id: suggested,
        possible_duplicate,
        fingerprint: fingerprint(app, parsed.as_ref(), &excerpt, input.posted_at),
        excerpt,
    };

    // Housekeeping: old resolved rows only matter for spotting a repeat, and not for long.
    diesel::delete(
        cp::table
            .filter(cp::status.ne("pending"))
            .filter(cp::created_at.lt(input.posted_at - KEEP_RESOLVED_SECONDS)),
    )
    .execute(connection)?;

    let inserted = diesel::insert_or_ignore_into(cp::table)
        .values(&row)
        .execute(connection)?;
    if inserted == 0 {
        return Ok(CaptureResult {
            status: "duplicate",
            id: None,
        });
    }
    let id: Option<i32> = cp::table
        .filter(cp::fingerprint.eq(&row.fingerprint))
        .select(cp::id)
        .first(connection)?;
    Ok(CaptureResult {
        status: "captured",
        id,
    })
}

// ----- The inbox -----

fn view(row: Row, categories: &HashMap<i32, String>) -> CapturedPayment {
    let app = PaymentApp::from_id(&row.app);
    CapturedPayment {
        id: row.id.unwrap_or_default(),
        app_name: app.map_or_else(|| row.app.clone(), |a| a.name().to_string()),
        app: row.app,
        understood: row.direction.is_some() && row.amount_cents.is_some(),
        direction: row.direction,
        amount_cents: row.amount_cents,
        currency: row.currency,
        merchant: row.merchant,
        reference: row.reference,
        occurred_on: row.occurred_on,
        occurred_at: row.occurred_at,
        excerpt: row.excerpt,
        suggested_category_name: row
            .suggested_category_id
            .and_then(|id| categories.get(&id).cloned()),
        suggested_category_id: row.suggested_category_id,
        possible_duplicate: row.possible_duplicate,
    }
}

/// The payments waiting for the user, newest first.
pub fn list(connection: &mut SqliteConnection) -> Result<Vec<CapturedPayment>, AppError> {
    let categories: HashMap<i32, String> = expense_category_repository::get_all(connection)?
        .into_iter()
        .filter_map(|c| c.id.map(|id| (id, c.name)))
        .collect();
    let rows: Vec<Row> = cp::table
        .filter(cp::status.eq("pending"))
        .order((cp::occurred_at.desc(), cp::id.desc()))
        .limit(INBOX_LIMIT)
        .select(Row::as_select())
        .load(connection)?;
    Ok(rows.into_iter().map(|row| view(row, &categories)).collect())
}

fn pending(connection: &mut SqliteConnection, id: i32) -> Result<Row, AppError> {
    cp::table
        .filter(cp::id.eq(id))
        .filter(cp::status.eq("pending"))
        .select(Row::as_select())
        .first(connection)
        .optional()?
        .ok_or_else(|| AppError::NotFound("That payment is no longer waiting".to_string()))
}

/// Turns a waiting payment into a real transaction, dated the day it happened. All or nothing.
pub fn confirm(
    connection: &mut SqliteConnection,
    input: &ConfirmInput,
) -> Result<crate::models::transaction::Transaction, AppError> {
    connection.transaction::<_, AppError, _>(|connection| {
        let row = pending(connection, input.id)?;
        let (Some(direction), Some(cents)) = (row.direction.clone(), row.amount_cents) else {
            return Err(AppError::validation(
                "id",
                "VISE could not tell what this payment was. Add it yourself with +",
            ));
        };
        let expense = direction == "expense";
        let app = PaymentApp::from_id(&row.app);
        let description = row.merchant.clone().unwrap_or_else(|| {
            format!(
                "{} {}",
                app.map_or("Payment", |a| a.name()),
                if expense { "payment" } else { "received" }
            )
        });
        let currency = match row.currency.clone() {
            Some(code) => code,
            None => app_settings_repository::get(connection)?.currency,
        };

        let transaction = service::add_transaction(
            connection,
            &NewTransactionInput {
                transaction_type: direction,
                amount: format_cents(cents),
                currency,
                description: description.chars().take(DESCRIPTION_CHARS).collect(),
                date: row.occurred_on.clone(),
                expense_category_id: if expense {
                    input.expense_category_id.or(row.suggested_category_id)
                } else {
                    None
                },
                income_source_id: if expense {
                    None
                } else {
                    input.income_source_id
                },
            },
        )?;
        diesel::update(cp::table.filter(cp::id.eq(input.id)))
            .set((
                cp::status.eq("confirmed"),
                cp::transaction_id.eq(transaction.id),
                cp::excerpt.eq(""),
            ))
            .execute(connection)?;
        Ok(transaction)
    })
}

/// Drops a waiting payment. Its text is erased; only its fingerprint stays, so a re-posted notification is not captured again.
pub fn dismiss(connection: &mut SqliteConnection, input: &DismissInput) -> Result<(), AppError> {
    pending(connection, input.id)?;
    diesel::update(cp::table.filter(cp::id.eq(input.id)))
        .set((cp::status.eq("dismissed"), cp::excerpt.eq("")))
        .execute(connection)?;
    Ok(())
}

#[cfg(test)]
mod tests;
