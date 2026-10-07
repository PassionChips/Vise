//! Reads a photographed receipt: finds the total, the date, the merchant and the
//! currency in the text the phone's OCR returned, and suggests a category from how
//! the user filed that merchant before.
//!
//! The OCR runs on the device and the image never leaves it. It gives back lines of
//! text with their position on the page; this module joins lines that sit on the same
//! row (so `TOTAL` ends up next to `45.30`) and then reads the rows. The result is only
//! a proposal: the app pre-fills the Add expense form and the user confirms it.

use chrono::{Datelike, Days, NaiveDate};
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::importer::amounts::{guess_decimal, parse_signed_cents};
use crate::importer::categorize::{self, Suggestion};
use crate::importer::dates::{DateOrder, guess_order, parse_date};
use crate::service::{MAX_TEXT_LENGTH, validate_currency};

const HEADER_ROWS: usize = 8;
const MAX_CANDIDATES: usize = 5;
const MIN_YEAR: i32 = 2000;

/// One line of recognized text and its box on the photo (any unit, top-left origin).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OcrLine {
    pub text: String,
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReceiptInput {
    pub lines: Vec<OcrLine>,
    /// Today as YYYY-MM-DD; dates in the future are not receipt dates.
    pub today: String,
    /// Currency to assume when the receipt shows none.
    pub default_currency: String,
}

#[derive(Debug, Serialize)]
pub struct TotalCandidate {
    pub amount_cents: i64,
    /// The row of the receipt it came from.
    pub line: String,
    /// "total" (a labelled total), "likely" (a card payment line or similar) or "possible".
    pub confidence: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ReceiptScan {
    pub merchant: Option<String>,
    /// YYYY-MM-DD, if a plausible date was printed on the receipt.
    pub date: Option<String>,
    /// Best guess first.
    pub totals: Vec<TotalCandidate>,
    pub currency: String,
    /// False if the receipt showed no currency and `currency` is the default.
    pub currency_found: bool,
    pub suggestion: Option<Suggestion>,
    pub warnings: Vec<String>,
}

// ----- Rows -----

/// Joins lines that sit on the same row of the page, left to right, so a label and its
/// price (which OCR often returns as separate blocks) end up together.
pub fn rows_from_lines(lines: &[OcrLine]) -> Vec<String> {
    struct Row {
        center: f64,
        height: f64,
        parts: Vec<(f64, String)>,
    }
    let mut sorted: Vec<&OcrLine> = lines.iter().filter(|l| !l.text.trim().is_empty()).collect();
    sorted.sort_by(|a, b| (a.top + a.bottom).total_cmp(&(b.top + b.bottom)));

    let mut rows: Vec<Row> = Vec::new();
    for line in sorted {
        let (center, height) = (
            (line.top + line.bottom) / 2.0,
            (line.bottom - line.top).abs().max(1.0),
        );
        let text = line.text.split_whitespace().collect::<Vec<_>>().join(" ");
        match rows
            .last_mut()
            .filter(|r| (center - r.center).abs() <= 0.5 * r.height.max(height))
        {
            Some(row) => {
                row.center =
                    (row.center * row.parts.len() as f64 + center) / (row.parts.len() as f64 + 1.0);
                row.height = row.height.max(height);
                row.parts.push((line.left, text));
            }
            None => rows.push(Row {
                center,
                height,
                parts: vec![(line.left, text)],
            }),
        }
    }
    rows.into_iter()
        .map(|mut row| {
            row.parts.sort_by(|a, b| a.0.total_cmp(&b.0));
            row.parts
                .into_iter()
                .map(|(_, t)| t)
                .collect::<Vec<_>>()
                .join("  ")
        })
        .collect()
}

// ----- Merchant -----

const NOT_A_MERCHANT: [&str; 22] = [
    "receipt",
    "invoice",
    "welcome",
    "thank you",
    "thanks",
    "tel",
    "phone",
    "www.",
    "http",
    "vat no",
    "vat reg",
    "kasse",
    "beleg",
    "rechnung",
    "quittung",
    "customer copy",
    "duplicate",
    "order",
    "table",
    "cashier",
    "date",
    "@",
];

fn title_case(text: &str) -> String {
    text.split(' ')
        .map(|word| {
            let mut chars = word.chars();
            chars.next().map_or(String::new(), |first| {
                first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The first of the top rows that reads like a shop name.
fn find_merchant(rows: &[String]) -> Option<String> {
    rows.iter().take(HEADER_ROWS).find_map(|row| {
        let lower = row.to_lowercase();
        let letters = row.chars().filter(|c| c.is_alphabetic()).count();
        let readable =
            letters >= 3 && letters * 2 >= row.chars().filter(|c| !c.is_whitespace()).count();
        if !readable || NOT_A_MERCHANT.iter().any(|w| lower.contains(w)) {
            return None;
        }
        let name = row
            .split("  ")
            .next()
            .unwrap_or(row)
            .trim()
            .trim_matches(|c: char| !c.is_alphanumeric());
        let name = if name.chars().any(char::is_lowercase) {
            name.to_string()
        } else {
            title_case(name)
        };
        Some(name.chars().take(MAX_TEXT_LENGTH).collect())
    })
}

// ----- Date -----

fn find_date(rows: &[String], today: NaiveDate, warnings: &mut Vec<String>) -> Option<NaiveDate> {
    let words: Vec<Vec<&str>> = rows
        .iter()
        .map(|r| r.split_whitespace().collect())
        .collect();
    let all: Vec<&str> = words.iter().flatten().copied().collect();
    let guess = guess_order(&all);
    let latest = today.checked_add_days(Days::new(1))?;
    let plausible = |d: &NaiveDate| d.year() >= MIN_YEAR && *d <= latest;

    // A date is one word (`12/09/2026`) or three (`12 Sep 2026`, `Sep 12, 2026`).
    let found = words.iter().find_map(|row| {
        (0..row.len()).find_map(|i| {
            let single = parse_date(row[i], guess.order, false);
            let triple = row
                .get(i..i + 3)
                .and_then(|w| parse_date(&w.join(" "), guess.order, false));
            single.or(triple).filter(plausible)
        })
    });
    if found.is_some() && guess.ambiguous && guess.order != DateOrder::Ymd {
        warnings.push(
            "The date could be day-first or month-first. It was read day first; check it."
                .to_string(),
        );
    }
    found
}

// ----- Amounts -----

/// Two decimals, like a price: `12.50`, `1.234,56`, `€12,50`. Dates, times, percentages,
/// phone numbers and quantities do not qualify.
fn is_price_token(token: &str) -> bool {
    if token.contains([':', '/', '%', '*', '@']) {
        return false;
    }
    let core = token.trim_matches(|c: char| !c.is_ascii_digit());
    match core.rfind(['.', ',']) {
        Some(i) => {
            core.len() - i - 1 == 2 && core[i + 1..].bytes().all(|b| b.is_ascii_digit()) && i > 0
        }
        None => false,
    }
}

/// A tax code letter glued to the price (`2,49A`) is not part of the number.
fn without_tax_code(token: &str) -> &str {
    let trimmed = token.trim_end_matches(|c: char| c.is_ascii_alphabetic());
    let removed = token.len() - trimmed.len();
    if (1..=2).contains(&removed) && trimmed.ends_with(|c: char| c.is_ascii_digit()) {
        trimmed
    } else {
        token
    }
}

fn price_tokens(row: &str) -> Vec<&str> {
    row.split_whitespace()
        .map(without_tax_code)
        .filter(|t| is_price_token(t))
        .collect()
}

// Words that mark a row as not being the amount to pay.
const EXCLUDED: [&str; 24] = [
    "subtotal",
    "sub total",
    "sub-total",
    "zwischensumme",
    "change",
    "rückgeld",
    "rueckgeld",
    "wechselgeld",
    "cash",
    "tendered",
    "gegeben",
    "tip",
    "trinkgeld",
    "discount",
    "rabatt",
    "savings",
    "you saved",
    "points",
    "punkte",
    "vat",
    "mwst",
    "tax",
    "steuer",
    "netto",
];
/// Excluded only as a whole word: German "Bar" (cash) must not exclude "Barista".
const EXCLUDED_WORDS: [&str; 2] = ["bar", "bargeld"];
const STRONG_LABELS: [(&str, u32); 19] = [
    ("grand total", 110),
    ("total due", 110),
    ("amount due", 110),
    ("balance due", 110),
    ("total to pay", 110),
    ("amount to pay", 110),
    ("zu zahlen", 110),
    ("gesamtbetrag", 100),
    ("gesamtsumme", 100),
    ("total a pagar", 100),
    ("importe total", 100),
    ("montant total", 100),
    ("net a payer", 100),
    ("to pay", 110),
    ("totale", 100),
    ("total", 100),
    ("summe", 100),
    ("gesamt", 100),
    ("betrag", 100),
];
const TAX_WORDS: [&str; 7] = ["tax", "vat", "mwst", "ust", "steuer", "savings", "discount"];
const PAYMENT_WORDS: [&str; 14] = [
    "visa",
    "mastercard",
    "maestro",
    "amex",
    "card",
    "karte",
    "debit",
    "contactless",
    "paid",
    "bezahlt",
    "girocard",
    "apple pay",
    "google pay",
    "paypal",
];

/// How likely a row is the total: 0 means it is not a candidate at all.
fn row_score(row: &str) -> u32 {
    let lower = row.to_lowercase();
    let start = lower.trim_start_matches(|c: char| !c.is_alphanumeric());
    if let Some((label, score)) = STRONG_LABELS
        .iter()
        .find(|(label, _)| start.starts_with(label))
    {
        let rest = start[label.len()..].trim_start_matches(|c: char| !c.is_alphanumeric());
        return if TAX_WORDS.iter().any(|w| rest.starts_with(w)) {
            0
        } else {
            *score
        };
    }
    let words: Vec<&str> = lower.split(|c: char| !c.is_alphanumeric()).collect();
    if EXCLUDED.iter().any(|w| lower.contains(w))
        || EXCLUDED_WORDS.iter().any(|w| words.contains(w))
    {
        return 0;
    }
    if ["total", "summe", "gesamt"]
        .iter()
        .any(|w| lower.contains(w))
    {
        return 70;
    }
    if PAYMENT_WORDS.iter().any(|w| lower.contains(w)) {
        return 50;
    }
    10
}

fn find_totals(rows: &[String], warnings: &mut Vec<String>) -> Vec<TotalCandidate> {
    let prices: Vec<&str> = rows.iter().flat_map(|r| price_tokens(r)).collect();
    let decimal = guess_decimal(&prices).decimal;

    // The last price on a row is its amount (`2 x 1.50  3.00`).
    let mut candidates: Vec<(i64, u32, &String)> = rows
        .iter()
        .filter_map(|row| {
            let token = price_tokens(row).last().copied()?;
            let cents = parse_signed_cents(token, decimal).ok().flatten()?.abs();
            let score = row_score(row);
            (cents > 0 && score > 0).then_some((cents, score, row))
        })
        .collect();
    // With nothing labelled, the biggest amount is the best guess.
    if let Some(largest) = candidates.iter().map(|c| c.0).max() {
        for c in candidates.iter_mut().filter(|c| c.0 == largest) {
            c.1 += 30;
        }
    }
    candidates.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));

    let mut totals: Vec<TotalCandidate> = Vec::new();
    for (cents, score, row) in candidates {
        if totals.iter().all(|t| t.amount_cents != cents) {
            let confidence = if score >= 100 {
                "total"
            } else if score >= 50 {
                "likely"
            } else {
                "possible"
            };
            totals.push(TotalCandidate {
                amount_cents: cents,
                line: row.clone(),
                confidence,
            });
        }
    }
    totals.truncate(MAX_CANDIDATES);

    match totals.as_slice() {
        [] => warnings.push("Could not find a total. Enter the amount yourself.".to_string()),
        [first, second, ..] if first.confidence == "total" && second.confidence == "total" => {
            warnings
                .push("Several amounts look like the total. Check which one is right.".to_string());
        }
        [first, ..] if first.confidence == "possible" => {
            warnings
                .push("No total line was recognized. The amount is a guess; check it.".to_string());
        }
        _ => {}
    }
    totals
}

// ----- Currency -----

const CODES: [&str; 7] = ["EUR", "USD", "GBP", "INR", "CAD", "AUD", "CHF"];

/// A currency printed on the receipt. A bare `$` means the user's own dollar currency if
/// they use one, else US dollars.
fn find_currency(rows: &[String], default: &str) -> Option<String> {
    rows.iter()
        .flat_map(|r| {
            r.chars()
                .map(|c| c.to_string())
                .chain(r.split_whitespace().map(String::from))
        })
        .find_map(|part| {
            match part.trim_matches(|c: char| {
                !c.is_alphanumeric() && c != '€' && c != '£' && c != '$' && c != '₹'
            }) {
                "€" => Some("EUR".to_string()),
                "£" => Some("GBP".to_string()),
                "₹" => Some("INR".to_string()),
                "$" => Some(
                    if ["USD", "CAD", "AUD"].contains(&default) {
                        default
                    } else {
                        "USD"
                    }
                    .to_string(),
                ),
                code if CODES.contains(&code) => Some(code.to_string()),
                _ => None,
            }
        })
}

// ----- Entry point -----

pub fn parse(
    connection: &mut SqliteConnection,
    input: &ReceiptInput,
) -> Result<ReceiptScan, AppError> {
    let today = NaiveDate::parse_from_str(input.today.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::validation("today", "Enter a date in YYYY-MM-DD format"))?;
    let default_currency = validate_currency(&input.default_currency)?;

    let rows = rows_from_lines(&input.lines);
    let mut warnings = Vec::new();
    if rows.is_empty() {
        warnings.push(
            "No text was found in the photo. Try again with the receipt flat and well lit."
                .to_string(),
        );
    }

    let merchant = find_merchant(&rows);
    let date = find_date(&rows, today, &mut warnings);
    let totals = find_totals(&rows, &mut warnings);
    let found_currency = find_currency(&rows, &default_currency);
    let suggestion = match &merchant {
        Some(name) => categorize::suggest_category(connection, name)?,
        None => None,
    };

    Ok(ReceiptScan {
        merchant,
        date: date.map(|d| d.format("%Y-%m-%d").to_string()),
        totals,
        currency_found: found_currency.is_some(),
        currency: found_currency.unwrap_or(default_currency),
        suggestion,
        warnings,
    })
}

#[cfg(test)]
mod tests;
