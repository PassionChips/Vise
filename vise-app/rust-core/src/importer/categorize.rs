//! Helps the user categorize imported rows with a few taps instead of one per row.
//!
//! Expense and refund rows are put into groups: rows that name a category in
//! the file group by that name, the rest group by merchant ("LIDL STORE 1234"
//! and "Lidl store 77" are one group). Each group gets a suggested category,
//! from the file or from how the user categorized the same merchant before.
//! The user confirms or changes one choice per group; `commit` applies it to
//! every row in the group. Income and transfers are never grouped.

use std::collections::{HashMap, HashSet};

use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::repository::{expense_category_repository, transaction_repository};
use crate::service::{self, NewCategoryInput};

use super::Resolved;

const MAX_GROUPS: usize = 500;
const MERCHANT_WORDS: usize = 2;
/// Words banks put in front of or around the merchant name.
const FILLER_WORDS: [&str; 18] = [
    "pos",
    "card",
    "payment",
    "purchase",
    "debit",
    "credit",
    "visa",
    "mastercard",
    "to",
    "at",
    "from",
    "the",
    "ltd",
    "gmbh",
    "inc",
    "llc",
    "store",
    "sq",
];
const NO_CATEGORY: [&str; 6] = [
    "uncategorized",
    "uncategorised",
    "none",
    "n/a",
    "unknown",
    "-",
];

/// The merchant a description is about: lower case, punctuation, filler words and
/// numbers (store numbers, reference codes) dropped, first two words kept.
/// `"LIDL STORE 1234 BERLIN"` and `"Lidl Berlin 77"` both give `"lidl berlin"`.
pub fn merchant_key(description: &str) -> String {
    let lower = description.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| {
            !w.is_empty() && !w.chars().any(|c| c.is_ascii_digit()) && !FILLER_WORDS.contains(w)
        })
        .take(MERCHANT_WORDS)
        .collect();
    if words.is_empty() {
        lower.trim().to_string()
    } else {
        words.join(" ")
    }
}

/// A category name written in the file, or `None` for blanks and "Uncategorized".
pub fn clean_category(cell: &str) -> Option<String> {
    let text = cell.trim();
    let usable = !text.is_empty() && !NO_CATEGORY.contains(&text.to_lowercase().as_str());
    usable.then(|| text.chars().take(service::MAX_TEXT_LENGTH).collect())
}

/// Only spending is categorized.
fn is_categorizable(kind: &str) -> bool {
    kind == "expense" || kind == "refund"
}

/// Gives each categorizable row its group key.
pub(super) fn assign_groups(rows: &mut [Resolved]) {
    for row in rows
        .iter_mut()
        .filter(|r| !r.duplicate && is_categorizable(r.transaction_type))
    {
        row.group = Some(match &row.file_category {
            Some(name) => format!("cat:{}", name.to_lowercase()),
            None => format!("m:{}", merchant_key(&row.description)),
        });
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Suggestion {
    /// The existing category, or `None` if the file names one that does not exist yet.
    pub category_id: Option<i32>,
    pub name: String,
    /// "file" or "history".
    pub source: &'static str,
    /// True if applying it creates the category.
    pub is_new: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportGroup {
    /// Send this back in `categories` to choose for the whole group.
    pub key: String,
    /// "merchant" or "file_category".
    pub kind: &'static str,
    /// What to show: the most common description, or the category name from the file.
    pub label: String,
    pub rows: usize,
    pub total_cents: i64,
    pub suggestion: Option<Suggestion>,
}

#[derive(Default)]
struct Totals {
    rows: usize,
    total_cents: i64,
    /// Original spellings, so the label looks like the file.
    spellings: HashMap<String, usize>,
}

fn most_common(counts: &HashMap<String, usize>) -> String {
    counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
        .map(|(text, _)| text.clone())
        .unwrap_or_default()
}

/// The user's active categories and how each merchant was categorized before.
struct History {
    categories: HashMap<i32, String>,
    /// merchant key -> category id -> number of transactions.
    by_merchant: HashMap<String, HashMap<i32, usize>>,
}

fn load_history(connection: &mut SqliteConnection) -> Result<History, AppError> {
    let categories: HashMap<i32, String> = expense_category_repository::get_all(connection)?
        .into_iter()
        .filter(|c| c.is_active)
        .filter_map(|c| c.id.map(|id| (id, c.name)))
        .collect();
    let mut by_merchant: HashMap<String, HashMap<i32, usize>> = HashMap::new();
    for t in transaction_repository::get_all(connection)? {
        if let Some(category) = t.expense_category_id.filter(|c| categories.contains_key(c)) {
            *by_merchant
                .entry(merchant_key(&t.description))
                .or_default()
                .entry(category)
                .or_insert(0) += 1;
        }
    }
    Ok(History {
        categories,
        by_merchant,
    })
}

fn most_used(counts: &HashMap<i32, usize>) -> Option<i32> {
    counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
        .map(|(id, _)| *id)
}

/// The category the user usually files this merchant under, if they have done so before.
pub fn suggest_category(
    connection: &mut SqliteConnection,
    description: &str,
) -> Result<Option<Suggestion>, AppError> {
    let History {
        categories,
        by_merchant,
    } = load_history(connection)?;
    Ok(by_merchant
        .get(&merchant_key(description))
        .and_then(most_used)
        .map(|id| Suggestion {
            category_id: Some(id),
            name: categories[&id].clone(),
            source: "history",
            is_new: false,
        }))
}

/// One group per merchant or file category, biggest spending first.
pub(super) fn build_groups(
    rows: &[Resolved],
    connection: &mut SqliteConnection,
) -> Result<Vec<ImportGroup>, AppError> {
    let mut totals: HashMap<&str, Totals> = HashMap::new();
    for row in rows {
        let Some(key) = row.group.as_deref() else {
            continue;
        };
        let entry = totals.entry(key).or_default();
        entry.rows += 1;
        entry.total_cents += row.amount_cents;
        let spelling = row
            .file_category
            .clone()
            .unwrap_or_else(|| row.description.clone());
        *entry.spellings.entry(spelling).or_insert(0) += 1;
    }
    if totals.is_empty() {
        return Ok(Vec::new());
    }

    let History {
        categories,
        by_merchant: history,
    } = load_history(connection)?;
    let by_name: HashMap<String, (i32, &String)> = categories
        .iter()
        .map(|(id, name)| (name.to_lowercase(), (*id, name)))
        .collect();

    let mut groups: Vec<ImportGroup> = totals
        .into_iter()
        .map(|(key, t)| {
            let label = most_common(&t.spellings);
            let (kind, suggestion) = if key.starts_with("cat:") {
                let suggestion = match by_name.get(&label.to_lowercase()) {
                    Some((id, name)) => Suggestion {
                        category_id: Some(*id),
                        name: (*name).clone(),
                        source: "file",
                        is_new: false,
                    },
                    None => Suggestion {
                        category_id: None,
                        name: label.clone(),
                        source: "file",
                        is_new: true,
                    },
                };
                ("file_category", Some(suggestion))
            } else {
                let best = history
                    .get(key.trim_start_matches("m:"))
                    .and_then(|counts| {
                        counts.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))
                    });
                let suggestion = best.map(|(id, _)| Suggestion {
                    category_id: Some(*id),
                    name: categories[id].clone(),
                    source: "history",
                    is_new: false,
                });
                ("merchant", suggestion)
            };
            ImportGroup {
                key: key.to_string(),
                kind,
                label,
                rows: t.rows,
                total_cents: t.total_cents,
                suggestion,
            }
        })
        .collect();
    groups.sort_by(|a, b| {
        b.total_cents
            .cmp(&a.total_cents)
            .then_with(|| a.key.cmp(&b.key))
    });
    groups.truncate(MAX_GROUPS);
    Ok(groups)
}

/// The user's decision for one group.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CategoryChoice {
    /// `ImportGroup.key`.
    pub group: String,
    /// An existing category...
    #[serde(default)]
    pub category_id: Option<i32>,
    /// ...or the name of one to create (an existing one with that name is reused).
    /// With neither, the group is left uncategorized.
    #[serde(default)]
    pub new_category: Option<String>,
}

/// Checks the choices and turns them into group key -> category id, creating
/// new categories. Call inside the import's transaction so a failure undoes it.
pub fn resolve_choices(
    connection: &mut SqliteConnection,
    choices: &[CategoryChoice],
    known_groups: &HashSet<&str>,
) -> Result<(HashMap<String, i32>, usize), AppError> {
    let mut resolved = HashMap::new();
    let mut created = 0;
    for choice in choices {
        if !known_groups.contains(choice.group.as_str()) {
            return Err(AppError::validation(
                "categories",
                format!("'{}' is not a group in this file", choice.group),
            ));
        }
        let id = match (
            choice.category_id,
            choice.new_category.as_deref().map(str::trim),
        ) {
            (None, None) => continue,
            (Some(_), Some(_)) => {
                return Err(AppError::validation(
                    "categories",
                    "Choose an existing category or a new one, not both",
                ));
            }
            (Some(id), None) => {
                if expense_category_repository::get_by_id(connection, id)?.is_none() {
                    return Err(AppError::validation(
                        "categories",
                        "That category no longer exists",
                    ));
                }
                id
            }
            (None, Some(name)) => {
                let existing = expense_category_repository::get_all(connection)?
                    .into_iter()
                    .find(|c| c.name.trim().eq_ignore_ascii_case(name))
                    .and_then(|c| c.id);
                match existing {
                    Some(id) => id,
                    None => {
                        let category = service::add_category(
                            connection,
                            &NewCategoryInput {
                                name: name.to_string(),
                                icon: None,
                                color: None,
                            },
                        )?;
                        created += 1;
                        category.id.expect("a saved category has an id")
                    }
                }
            }
        };
        resolved.insert(choice.group.clone(), id);
    }
    Ok((resolved, created))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_merchant_one_key_whatever_the_bank_adds() {
        assert_eq!(merchant_key("LIDL STORE 1234 BERLIN"), "lidl berlin");
        assert_eq!(merchant_key("Lidl Berlin 77"), "lidl berlin");
        assert_eq!(
            merchant_key("CARD PAYMENT TO Netflix.com 8832"),
            "netflix com"
        );
        assert_eq!(merchant_key("POS Shell 4410"), "shell");
        assert_eq!(merchant_key("  Taxi  "), "taxi");
    }

    #[test]
    fn a_description_of_only_numbers_still_gets_a_key() {
        assert_eq!(merchant_key("12345"), "12345");
        assert_eq!(merchant_key(""), "");
    }

    #[test]
    fn blank_and_placeholder_categories_are_ignored() {
        assert_eq!(clean_category(" Groceries "), Some("Groceries".to_string()));
        for text in ["", "  ", "Uncategorized", "N/A", "-"] {
            assert_eq!(clean_category(text), None, "{text}");
        }
    }
}
