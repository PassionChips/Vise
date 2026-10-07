//! Imports a transactions file whose columns can be named anything.
//!
//! `preview` reads the file and reports what it found (which column is the
//! date, how dates and amounts are written, how many rows are new) without
//! touching the database. `commit` runs the same analysis and saves the
//! rows in one database transaction, so a failure saves nothing.
//!
//! Dates missing from a row are taken from the nearest dated row above it,
//! else the nearest below it, else the day of the import. Rows borrowing a
//! date keep their file order by a one-second step each.

pub mod amounts;
pub mod categorize;
pub mod columns;
pub mod dates;
pub mod table;

use std::collections::{HashMap, HashSet};

use chrono::NaiveDate;
use diesel::Connection;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::transaction::NewTransaction;
use crate::repository::transaction_repository;
use crate::service::{MAX_TEXT_LENGTH, validate_currency};

use amounts::{Decimal, DecimalGuess, guess_decimal, parse_signed_cents};
use categorize::{CategoryChoice, ImportGroup};
use columns::Mapping;
use dates::{DateOrder, OrderGuess, guess_order, parse_date};
use table::{Row, Table, read_table};

const MAX_CONTENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_ROWS: usize = 50_000;
const MAX_REPORTED_ERRORS: usize = 100;
const SAMPLE_ROWS: usize = 10;
const SECONDS_PER_DAY: i64 = 86_400;
/// Whole-row labels of totals lines ("Total", "Summe"), matched exactly.
const SUMMARY_LABELS: [&str; 9] = [
    "total",
    "subtotal",
    "grand total",
    "balance",
    "summary",
    "sum",
    "summe",
    "gesamt",
    "totals",
];
/// Lines that start with one of these are balances, not purchases.
const SUMMARY_PREFIXES: [&str; 5] = [
    "opening balance",
    "closing balance",
    "balance brought forward",
    "balance carried forward",
    "brought forward",
];

// ----- Input -----

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportInput {
    /// The text of the CSV file.
    pub content: String,
    /// Today as YYYY-MM-DD: the date for rows when the file has none.
    pub today: String,
    /// Currency for rows without one, usually the app's currency.
    pub default_currency: String,
    /// Columns chosen by the user, overriding what was detected.
    #[serde(default)]
    pub mapping: Option<MappingInput>,
    /// Fields the user says the file does not have, e.g. `["category"]`, so a wrong
    /// detection can be switched off. Same names as the mapping fields.
    #[serde(default)]
    pub no_columns: Option<Vec<String>>,
    /// "dmy", "mdy" or "ymd".
    #[serde(default)]
    pub date_order: Option<String>,
    /// "dot" or "comma".
    #[serde(default)]
    pub decimal_separator: Option<String>,
    /// What a positive amount means when the file has no sign convention: "income" or "expense".
    #[serde(default)]
    pub positive_is: Option<String>,
    /// Skip rows already stored (same day, amount, currency and description). Default true.
    #[serde(default)]
    pub skip_duplicates: Option<bool>,
    /// The user's category choice per group (`ImportPreview.groups`). Groups not listed stay uncategorized.
    #[serde(default)]
    pub categories: Option<Vec<CategoryChoice>>,
}

/// Column numbers (0-based), as listed in the preview.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MappingInput {
    pub date: Option<usize>,
    pub description: Option<usize>,
    pub amount: Option<usize>,
    pub debit: Option<usize>,
    pub credit: Option<usize>,
    pub transaction_type: Option<usize>,
    pub currency: Option<usize>,
    pub category: Option<usize>,
}

// ----- Output -----

#[derive(Debug, Clone, Serialize)]
pub struct RowError {
    pub row: usize,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportStats {
    /// Data rows in the file, not counting blank lines.
    pub rows_in_file: usize,
    /// Rows that will be saved.
    pub ready: usize,
    pub duplicates: usize,
    /// Rows left out without being errors: totals, notes, rows with nothing to import.
    pub skipped: usize,
    pub errors: usize,
    pub dated: usize,
    pub filled_from_above: usize,
    pub filled_from_below: usize,
    pub filled_with_import_date: usize,
}

#[derive(Debug, Serialize)]
pub struct ColumnInfo {
    pub index: usize,
    pub name: String,
    pub example: String,
}

#[derive(Debug, Serialize)]
pub struct SampleRow {
    pub row: usize,
    pub date: String,
    /// "file", "above", "below" or "import_day".
    pub date_source: &'static str,
    pub description: String,
    pub amount_cents: i64,
    pub currency: String,
    pub transaction_type: &'static str,
    pub duplicate: bool,
}

#[derive(Debug, Serialize)]
pub struct ImportPreview {
    pub header_row: Option<usize>,
    pub columns: Vec<ColumnInfo>,
    pub mapping: Mapping,
    pub date_order: &'static str,
    pub date_order_ambiguous: bool,
    pub decimal_separator: &'static str,
    pub decimal_ambiguous: bool,
    pub positive_is: &'static str,
    pub stats: ImportStats,
    pub warnings: Vec<String>,
    pub errors: Vec<RowError>,
    pub sample: Vec<SampleRow>,
    /// Rows to categorize, grouped by merchant or by the category named in the file.
    pub groups: Vec<ImportGroup>,
}

#[derive(Debug, Serialize)]
pub struct ImportSummary {
    pub inserted: usize,
    pub duplicates: usize,
    pub skipped: usize,
    pub error_count: usize,
    pub errors: Vec<RowError>,
    pub filled_dates: usize,
    /// Rows saved with a category.
    pub categorized: usize,
    pub categories_created: usize,
}

// ----- Analysis -----

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DateSource {
    File,
    Above,
    Below,
    ImportDay,
}

impl DateSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Above => "above",
            Self::Below => "below",
            Self::ImportDay => "import_day",
        }
    }
}

/// A row that read correctly, before missing dates are filled in.
struct Pending {
    date: Option<NaiveDate>,
    description: String,
    signed_cents: i64,
    /// Type named by the file (a type column, or a debit/credit column).
    hint: Option<&'static str>,
    currency: String,
    file_category: Option<String>,
    number: usize,
}

struct Resolved {
    number: usize,
    date: NaiveDate,
    source: DateSource,
    occurred_at: i64,
    description: String,
    amount_cents: i64,
    currency: String,
    transaction_type: &'static str,
    duplicate: bool,
    /// The category named in the file, if any.
    file_category: Option<String>,
    /// Which category group the row belongs to (expenses and refunds only).
    group: Option<String>,
}

struct Analysis {
    table: Table,
    mapping: Mapping,
    order: OrderGuess,
    decimal: DecimalGuess,
    positive_is: &'static str,
    rows: Vec<Resolved>,
    errors: Vec<RowError>,
    stats: ImportStats,
    warnings: Vec<String>,
    groups: Vec<ImportGroup>,
}

fn invalid(field: &str, message: &str) -> AppError {
    AppError::validation(field, message)
}

fn parse_today(text: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(text.trim(), "%Y-%m-%d")
        .map_err(|_| invalid("today", "Enter a date in YYYY-MM-DD format"))
}

fn apply_overrides(
    mapping: &mut Mapping,
    input: &MappingInput,
    width: usize,
) -> Result<(), AppError> {
    let set = |field: &str, target: &mut Option<usize>, value: Option<usize>| match value {
        Some(index) if index >= width => {
            Err(invalid(field, "That column does not exist in the file"))
        }
        Some(index) => {
            *target = Some(index);
            Ok(())
        }
        None => Ok(()),
    };
    set("date", &mut mapping.date, input.date)?;
    set("description", &mut mapping.description, input.description)?;
    set("amount", &mut mapping.amount, input.amount)?;
    set("debit", &mut mapping.debit, input.debit)?;
    set("credit", &mut mapping.credit, input.credit)?;
    set(
        "transaction_type",
        &mut mapping.transaction_type,
        input.transaction_type,
    )?;
    set("currency", &mut mapping.currency, input.currency)?;
    set("category", &mut mapping.category, input.category)?;
    // An explicit amount column replaces debit and credit, and the other way round.
    if input.amount.is_some() && input.debit.is_none() && input.credit.is_none() {
        mapping.debit = None;
        mapping.credit = None;
    }
    if (input.debit.is_some() || input.credit.is_some()) && input.amount.is_none() {
        mapping.amount = None;
    }
    Ok(())
}

/// Words in a type column, such as "Credit" or "Purchase".
fn type_from_word(word: &str) -> Option<&'static str> {
    let w = word.trim().to_ascii_lowercase();
    if w.is_empty() {
        return None;
    }
    let has = |words: &[&str]| words.iter().any(|x| w.contains(x));
    let is = |words: &[&str]| words.contains(&w.as_str());
    if has(&["refund"]) {
        Some("refund")
    } else if has(&["transfer"]) {
        Some("transfer")
    } else if has(&[
        "income", "credit", "deposit", "salary", "received", "inflow", "incoming", "paid in",
        "money in",
    ]) || is(&["cr", "in"])
    {
        Some("income")
    } else if has(&[
        "expense",
        "debit",
        "withdraw",
        "purchase",
        "payment",
        "spent",
        "outflow",
        "outgoing",
        "paid out",
        "money out",
    ]) || is(&["dr", "out"])
    {
        Some("expense")
    } else {
        None
    }
}

/// The amount in a row as (signed cents, type named by the file). `None` if the row has no amount.
fn read_amount(
    row: &Row,
    mapping: &Mapping,
    decimal: Decimal,
) -> Result<Option<(i64, Option<&'static str>)>, String> {
    let type_hint = type_from_word(row.cell(mapping.transaction_type));
    if mapping.amount.is_some() {
        return Ok(parse_signed_cents(row.cell(mapping.amount), decimal)?.map(|c| (c, type_hint)));
    }
    let debit = parse_signed_cents(row.cell(mapping.debit), decimal)?.filter(|&c| c != 0);
    let credit = parse_signed_cents(row.cell(mapping.credit), decimal)?.filter(|&c| c != 0);
    match (debit, credit) {
        (Some(_), Some(_)) => Err("Both the debit and the credit column are filled in".to_string()),
        (Some(d), None) => Ok(Some((d.abs(), Some("expense")))),
        (None, Some(c)) => Ok(Some((c.abs(), Some("income")))),
        (None, None) => Ok(None),
    }
}

/// A totals or balance line, not a transaction. "Opening coffee" is a purchase; "Opening balance" is not.
fn is_summary_row(description: &str) -> bool {
    let text = description.trim().trim_end_matches(':').to_lowercase();
    SUMMARY_LABELS.contains(&text.as_str()) || SUMMARY_PREFIXES.iter().any(|p| text.starts_with(p))
}

fn analyze(input: &ImportInput) -> Result<Analysis, AppError> {
    if input.content.len() > MAX_CONTENT_BYTES {
        return Err(invalid(
            "content",
            "That file is too large to import (limit 10 MB)",
        ));
    }
    let today = parse_today(&input.today)?;
    let default_currency = validate_currency(&input.default_currency)?;
    let table = read_table(&input.content).map_err(|m| invalid("content", &m))?;
    if table.rows.is_empty() {
        return Err(invalid("content", "The file has no rows to import"));
    }
    if table.rows.len() > MAX_ROWS {
        return Err(invalid(
            "content",
            "That file has too many rows (limit 50,000)",
        ));
    }

    let mut mapping = columns::detect(&table);
    if let Some(overrides) = &input.mapping {
        apply_overrides(&mut mapping, overrides, table.headers.len())?;
    }

    for field in input.no_columns.as_deref().unwrap_or_default() {
        let target = match field.as_str() {
            "date" => &mut mapping.date,
            "description" => &mut mapping.description,
            "amount" => &mut mapping.amount,
            "debit" => &mut mapping.debit,
            "credit" => &mut mapping.credit,
            "transaction_type" => &mut mapping.transaction_type,
            "currency" => &mut mapping.currency,
            "category" => &mut mapping.category,
            other => {
                return Err(invalid(
                    "no_columns",
                    &format!("'{other}' is not a column field"),
                ));
            }
        };
        *target = None;
    }

    let order = match input.date_order.as_deref() {
        Some(text) => OrderGuess {
            order: DateOrder::parse(text)
                .ok_or_else(|| invalid("date_order", "Use dmy, mdy or ymd"))?,
            ambiguous: false,
        },
        None => guess_order(&mapping.date.map(|i| table.column(i)).unwrap_or_default()),
    };
    let amount_cells: Vec<&str> = [mapping.amount, mapping.debit, mapping.credit]
        .into_iter()
        .flatten()
        .flat_map(|i| table.column(i))
        .collect();
    let decimal = match input.decimal_separator.as_deref() {
        Some(text) => DecimalGuess {
            decimal: Decimal::parse(text)
                .ok_or_else(|| invalid("decimal_separator", "Use dot or comma"))?,
            ambiguous: false,
        },
        None => guess_decimal(&amount_cells),
    };

    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    let mut stats = ImportStats {
        rows_in_file: table.rows.len(),
        ..Default::default()
    };
    let mut pending: Vec<Pending> = Vec::new();

    let has_amount =
        mapping.amount.is_some() || mapping.debit.is_some() || mapping.credit.is_some();
    if !has_amount {
        warnings
            .push("No amount column was found. Choose which column holds the amounts.".to_string());
    }
    if mapping.date.is_none() {
        warnings.push("No date column was found, so every row uses the import date.".to_string());
    }

    let mut truncated = 0;
    for row in table.rows.iter().filter(|_| has_amount) {
        let date_cell = row.cell(mapping.date);
        let description = row.cell(mapping.description);
        let mut fail = |message: String| {
            errors.push(RowError {
                row: row.number,
                message,
            })
        };

        if is_summary_row(description) {
            stats.skipped += 1;
            continue;
        }
        let amount = match read_amount(row, &mapping, decimal.decimal) {
            Ok(amount) => amount,
            Err(message) => {
                fail(message);
                continue;
            }
        };
        let Some((signed_cents, hint)) = amount else {
            if date_cell.is_empty() {
                stats.skipped += 1;
            } else {
                fail("This row has a date but no amount".to_string());
            }
            continue;
        };
        if signed_cents == 0 {
            fail("Amount must be greater than zero".to_string());
            continue;
        }
        let date = if date_cell.is_empty() {
            None
        } else {
            match parse_date(date_cell, order.order, mapping.date.is_some()) {
                Some(date) => Some(date),
                None => {
                    fail(format!("Could not read the date '{date_cell}'"));
                    continue;
                }
            }
        };
        let currency = match row.cell(mapping.currency) {
            "" => default_currency.clone(),
            code => match validate_currency(code) {
                Ok(code) => code,
                Err(_) => {
                    fail(format!("'{code}' is not a three-letter currency code"));
                    continue;
                }
            },
        };
        let description = if description.is_empty() {
            "Imported"
        } else {
            description
        };
        let description = if description.chars().count() > MAX_TEXT_LENGTH {
            truncated += 1;
            description.chars().take(MAX_TEXT_LENGTH).collect()
        } else {
            description.to_string()
        };
        pending.push(Pending {
            date,
            description,
            signed_cents,
            hint,
            currency,
            file_category: categorize::clean_category(row.cell(mapping.category)),
            number: row.number,
        });
    }
    if truncated > 0 {
        warnings.push(format!("{truncated} descriptions were longer than {MAX_TEXT_LENGTH} characters and were shortened."));
    }

    let positive_is = match input.positive_is.as_deref() {
        Some("income") => "income",
        Some("expense") => "expense",
        Some(_) => return Err(invalid("positive_is", "Use income or expense")),
        None if pending
            .iter()
            .any(|p| p.hint.is_none() && p.signed_cents < 0) =>
        {
            "income"
        }
        None => {
            if mapping.amount.is_some()
                && !pending.is_empty()
                && pending.iter().all(|p| p.hint.is_none())
            {
                warnings.push("Every amount is positive, so all rows were read as expenses. Change this if some are income.".to_string());
            }
            "expense"
        }
    };

    let rows = fill_dates(pending, today, positive_is, &mut stats);

    if stats.dated < rows.len() && stats.dated * 2 < rows.len() && mapping.date.is_some() {
        warnings.push(
            "More than half of the rows have no date. Their dates were guessed from nearby rows."
                .to_string(),
        );
    }
    let (min_year, max_year) = (1990, chrono::Datelike::year(&today) + 1);
    let odd = rows
        .iter()
        .filter(|r| {
            let year = chrono::Datelike::year(&r.date);
            r.source == DateSource::File && !(min_year..=max_year).contains(&year)
        })
        .count();
    if odd > 0 {
        warnings.push(format!(
            "{odd} rows have dates before {min_year} or after {max_year}. Check the date format."
        ));
    }
    if order.ambiguous && mapping.date.is_some() {
        warnings.push("Dates like 03/04/2026 could be day-first or month-first. They were read day first. Change the date order if that is wrong.".to_string());
    }
    if decimal.ambiguous {
        warnings.push("Amounts like 1,234 could be one thousand or one and a bit. They were read with a dot as the decimal point. Change the decimal separator if that is wrong.".to_string());
    }

    stats.errors = errors.len();
    errors.truncate(MAX_REPORTED_ERRORS);
    Ok(Analysis {
        table,
        mapping,
        order,
        decimal,
        positive_is,
        rows,
        errors,
        stats,
        warnings,
        groups: Vec::new(),
    })
}

/// Gives every row a date: its own, else the nearest dated row above, else
/// the nearest below, else the import day. Also decides the type.
fn fill_dates(
    pending: Vec<Pending>,
    today: NaiveDate,
    positive_is: &'static str,
    stats: &mut ImportStats,
) -> Vec<Resolved> {
    let mut above: Vec<Option<NaiveDate>> = Vec::with_capacity(pending.len());
    let mut last = None;
    for p in &pending {
        last = p.date.or(last);
        above.push(last);
    }
    let mut below: Vec<Option<NaiveDate>> = vec![None; pending.len()];
    let mut next = None;
    for (i, p) in pending.iter().enumerate().rev() {
        next = p.date.or(next);
        below[i] = next;
    }

    pending
        .into_iter()
        .enumerate()
        .map(|(index, p)| {
            let (date, source) = match (p.date, above[index], below[index]) {
                (Some(date), _, _) => (date, DateSource::File),
                (None, Some(date), _) => (date, DateSource::Above),
                (None, None, Some(date)) => (date, DateSource::Below),
                (None, None, None) => (today, DateSource::ImportDay),
            };
            match source {
                DateSource::File => stats.dated += 1,
                DateSource::Above => stats.filled_from_above += 1,
                DateSource::Below => stats.filled_from_below += 1,
                DateSource::ImportDay => stats.filled_with_import_date += 1,
            }
            // Rows without a date of their own keep the file order within the day.
            let offset = if source == DateSource::File {
                0
            } else {
                index as i64 % SECONDS_PER_DAY
            };
            let midnight = date
                .and_hms_opt(0, 0, 0)
                .expect("midnight exists")
                .and_utc()
                .timestamp();
            Resolved {
                number: p.number,
                date,
                source,
                occurred_at: midnight + offset,
                description: p.description,
                amount_cents: p.signed_cents.abs(),
                currency: p.currency,
                transaction_type: p.hint.unwrap_or(if p.signed_cents < 0 {
                    "expense"
                } else {
                    positive_is
                }),
                duplicate: false,
                file_category: p.file_category,
                group: None,
            }
        })
        .collect()
}

type DuplicateKey = (i64, i64, String, String, String);

fn key(
    occurred_at: i64,
    cents: i64,
    currency: &str,
    kind: &str,
    description: &str,
) -> DuplicateKey {
    let description = description
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    (
        occurred_at.div_euclid(SECONDS_PER_DAY),
        cents,
        currency.to_string(),
        kind.to_string(),
        description,
    )
}

/// Marks rows that already exist. Each stored transaction cancels out at
/// most one row of the file, so two real identical purchases on one day,
/// both in the file, are both kept.
fn mark_duplicates(
    analysis: &mut Analysis,
    connection: &mut SqliteConnection,
) -> Result<(), AppError> {
    let (Some(first), Some(last)) = (
        analysis.rows.iter().map(|r| r.occurred_at).min(),
        analysis.rows.iter().map(|r| r.occurred_at).max(),
    ) else {
        return Ok(());
    };
    let start = first.div_euclid(SECONDS_PER_DAY) * SECONDS_PER_DAY;
    let end = (last.div_euclid(SECONDS_PER_DAY) + 1) * SECONDS_PER_DAY;
    let mut stored: HashMap<DuplicateKey, usize> = HashMap::new();
    for t in transaction_repository::get_in_range(connection, start, end)? {
        *stored
            .entry(key(
                t.occurred_at,
                t.amount_cents,
                &t.currency,
                &t.transaction_type,
                &t.description,
            ))
            .or_insert(0) += 1;
    }
    for row in &mut analysis.rows {
        let k = key(
            row.occurred_at,
            row.amount_cents,
            &row.currency,
            row.transaction_type,
            &row.description,
        );
        if let Some(count) = stored.get_mut(&k).filter(|c| **c > 0) {
            *count -= 1;
            row.duplicate = true;
        }
    }
    analysis.stats.duplicates = analysis.rows.iter().filter(|r| r.duplicate).count();
    analysis.stats.ready = analysis.rows.len() - analysis.stats.duplicates;
    Ok(())
}

fn plan(connection: &mut SqliteConnection, input: &ImportInput) -> Result<Analysis, AppError> {
    let mut analysis = analyze(input)?;
    if input.skip_duplicates.unwrap_or(true) {
        mark_duplicates(&mut analysis, connection)?;
    } else {
        analysis.stats.ready = analysis.rows.len();
    }
    categorize::assign_groups(&mut analysis.rows);
    analysis.groups = categorize::build_groups(&analysis.rows, connection)?;
    Ok(analysis)
}

// ----- Public API -----

/// Reads the file and reports what an import would do. Writes nothing.
pub fn preview(
    connection: &mut SqliteConnection,
    input: &ImportInput,
) -> Result<ImportPreview, AppError> {
    let analysis = plan(connection, input)?;
    let columns = analysis
        .table
        .headers
        .iter()
        .enumerate()
        .map(|(index, name)| ColumnInfo {
            index,
            name: name.clone(),
            example: analysis
                .table
                .column(index)
                .first()
                .map(|s| s.to_string())
                .unwrap_or_default(),
        })
        .collect();
    let sample = analysis
        .rows
        .iter()
        .take(SAMPLE_ROWS)
        .map(|r| SampleRow {
            row: r.number,
            date: r.date.format("%Y-%m-%d").to_string(),
            date_source: r.source.as_str(),
            description: r.description.clone(),
            amount_cents: r.amount_cents,
            currency: r.currency.clone(),
            transaction_type: r.transaction_type,
            duplicate: r.duplicate,
        })
        .collect();
    Ok(ImportPreview {
        header_row: analysis.table.header_row,
        columns,
        mapping: analysis.mapping,
        date_order: analysis.order.order.as_str(),
        date_order_ambiguous: analysis.order.ambiguous,
        decimal_separator: analysis.decimal.decimal.as_str(),
        decimal_ambiguous: analysis.decimal.ambiguous,
        positive_is: analysis.positive_is,
        stats: analysis.stats,
        warnings: analysis.warnings,
        errors: analysis.errors,
        sample,
        groups: analysis.groups,
    })
}

/// Saves every new row in one database transaction.
pub fn commit(
    connection: &mut SqliteConnection,
    input: &ImportInput,
) -> Result<ImportSummary, AppError> {
    let analysis = plan(connection, input)?;
    let m = &analysis.mapping;
    if m.amount.is_none() && m.debit.is_none() && m.credit.is_none() {
        return Err(invalid("amount", "Choose which column holds the amounts"));
    }
    let new_rows: Vec<&Resolved> = analysis.rows.iter().filter(|r| !r.duplicate).collect();
    let known_groups: HashSet<&str> = new_rows.iter().filter_map(|r| r.group.as_deref()).collect();
    let choices = input.categories.as_deref().unwrap_or_default();

    let (categorized, categories_created) =
        connection.transaction::<_, AppError, _>(|connection| {
            // Categories are chosen (and created) in the same transaction as the rows, so a
            // failure anywhere saves nothing, not even a new category.
            let (chosen, created) =
                categorize::resolve_choices(connection, choices, &known_groups)?;
            let mut categorized = 0;
            for row in &new_rows {
                let category = row
                    .group
                    .as_ref()
                    .and_then(|group| chosen.get(group))
                    .copied();
                categorized += usize::from(category.is_some());
                transaction_repository::insert(
                    connection,
                    &NewTransaction {
                        source_type: "manual".to_string(),
                        transaction_type: row.transaction_type.to_string(),
                        amount_cents: row.amount_cents,
                        currency: row.currency.clone(),
                        description: row.description.clone(),
                        occurred_at: row.occurred_at,
                        income_source_id: None,
                        expense_category_id: category,
                        external_id: None,
                        revolut_account_id: None,
                        merchant_name: None,
                        raw_description: None,
                        revolut_category: None,
                        status: "completed".to_string(),
                        completed_at: Some(row.occurred_at),
                        exclude_from_totals: row.transaction_type == "transfer",
                    },
                )?;
            }
            Ok((categorized, created))
        })?;
    let stats = &analysis.stats;
    Ok(ImportSummary {
        inserted: new_rows.len(),
        duplicates: stats.duplicates,
        skipped: stats.skipped,
        error_count: stats.errors,
        errors: analysis.errors,
        filled_dates: stats.filled_from_above
            + stats.filled_from_below
            + stats.filled_with_import_date,
        categorized,
        categories_created,
    })
}

#[cfg(test)]
mod tests;
