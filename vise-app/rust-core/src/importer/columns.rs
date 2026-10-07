//! Guesses which column is the date, the amount, and so on, from the header
//! names and from what the cells contain, so files can use any column names.

use serde::Serialize;

use super::amounts::looks_like_amount;
use super::dates::looks_like_date;
use super::table::Table;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Mapping {
    pub date: Option<usize>,
    pub description: Option<usize>,
    pub amount: Option<usize>,
    pub debit: Option<usize>,
    pub credit: Option<usize>,
    pub transaction_type: Option<usize>,
    pub currency: Option<usize>,
    pub category: Option<usize>,
}

impl Mapping {
    fn taken(&self, index: usize) -> bool {
        [
            self.date,
            self.description,
            self.amount,
            self.debit,
            self.credit,
            self.transaction_type,
            self.currency,
            self.category,
        ]
        .contains(&Some(index))
    }
}

const DATE: &[&str] = &[
    "date",
    "transactiondate",
    "bookingdate",
    "postingdate",
    "posteddate",
    "dateposted",
    "txndate",
    "transdate",
    "datum",
    "day",
    "timestamp",
    "datetime",
    "completeddate",
    "startdate",
    "when",
];
/// Dates that are usually not the one meant (value date, due date).
const DATE_WEAK: &[&str] = &["valuedate", "settlementdate", "effectivedate", "duedate"];
const AMOUNT: &[&str] = &[
    "amount",
    "amt",
    "transactionamount",
    "sum",
    "value",
    "total",
    "price",
    "cost",
    "money",
    "betrag",
];
const DEBIT: &[&str] = &[
    "debit",
    "withdrawal",
    "withdrawals",
    "paidout",
    "moneyout",
    "outflow",
    "dr",
    "debitamount",
    "expense",
    "spent",
];
const CREDIT: &[&str] = &[
    "credit",
    "deposit",
    "deposits",
    "paidin",
    "moneyin",
    "inflow",
    "cr",
    "creditamount",
    "income",
    "received",
];
const TYPE: &[&str] = &[
    "type",
    "transactiontype",
    "kind",
    "direction",
    "drcr",
    "creditdebit",
    "txntype",
    "entrytype",
];
const CATEGORY: &[&str] = &[
    "category",
    "categories",
    "cat",
    "expensecategory",
    "categoryname",
    "label",
    "tag",
    "tags",
    "group",
];
const CURRENCY: &[&str] = &["currency", "ccy", "cur", "curr", "currencycode"];
const DESCRIPTION: &[&str] = &[
    "description",
    "details",
    "narration",
    "memo",
    "note",
    "notes",
    "payee",
    "merchant",
    "merchantname",
    "name",
    "reference",
    "particulars",
    "transactiondetails",
    "text",
    "title",
    "remarks",
    "counterparty",
    "vendor",
    "beneficiary",
    "paidto",
];

fn normalise(header: &str) -> String {
    header
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// 70 to 100 for an exact match (earlier synonyms rank higher, so
/// "description" beats "name"), 60 if the header contains a synonym, else 0.
fn header_score(header: &str, synonyms: &[&str]) -> u32 {
    let name = normalise(header);
    if name.is_empty() || name.contains("balance") {
        return 0;
    }
    if let Some(position) = synonyms.iter().position(|s| *s == name) {
        100 - position.min(30) as u32
    } else if synonyms.iter().any(|s| s.len() >= 4 && name.contains(s)) {
        60
    } else {
        0
    }
}

fn ratio(cells: &[&str], test: impl Fn(&str) -> bool) -> f64 {
    if cells.is_empty() {
        return 0.0;
    }
    cells.iter().filter(|c| test(c)).count() as f64 / cells.len() as f64
}

/// Best column for a field: header score plus how well the cells fit.
/// Columns that do not fit the content at all (below `min_fit`) never win.
fn best(
    table: &Table,
    mapping: &Mapping,
    synonyms: &[&str],
    min_fit: f64,
    fit: impl Fn(&[&str]) -> f64,
) -> Option<usize> {
    (0..table.headers.len())
        .filter(|&i| !mapping.taken(i))
        .filter_map(|i| {
            let cells = table.column(i);
            let fit = fit(&cells);
            if fit < min_fit {
                return None;
            }
            let score = header_score(&table.headers[i], synonyms) as f64 + fit * 100.0;
            Some((i, score))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(&a.0)))
        .map(|(i, _)| i)
}

pub fn detect(table: &Table) -> Mapping {
    let mut mapping = Mapping::default();

    // Date: weak names (value date) count for less than plain "date".
    let date_fit = |cells: &[&str]| ratio(cells, looks_like_date);
    mapping.date = (0..table.headers.len())
        .filter_map(|i| {
            let cells = table.column(i);
            let strong = date_fit(&cells);
            let name = normalise(&table.headers[i]);
            let named = if DATE.contains(&name.as_str()) {
                100.0
            } else if DATE_WEAK.contains(&name.as_str()) {
                30.0
            } else if name.contains("date") && !name.contains("balance") {
                50.0
            } else {
                0.0
            };
            // A column named like a date may hold bare serial numbers.
            let serial = named >= 40.0 && !cells.is_empty() && ratio(&cells, is_serial) >= 0.5;
            if strong < 0.5 && !serial {
                return None;
            }
            Some((
                i,
                named + strong.max(if serial { 0.5 } else { 0.0 }) * 100.0,
            ))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(&a.0)))
        .map(|(i, _)| i);

    // Debit and credit columns are sparse (most rows use only one).
    let sparse_fit = |cells: &[&str]| {
        if cells.is_empty() {
            0.0
        } else {
            ratio(cells, looks_like_amount)
        }
    };
    let debit = best_named(table, &mapping, DEBIT, &sparse_fit);
    mapping.debit = debit;
    let credit = best_named(table, &mapping, CREDIT, &sparse_fit);
    mapping.credit = credit;

    if mapping.debit.is_none() && mapping.credit.is_none() {
        mapping.amount = best(table, &mapping, AMOUNT, 0.6, |cells| {
            let fit = ratio(cells, looks_like_amount);
            // Amounts usually have decimals; row numbers and ids do not.
            let decimals = ratio(cells, |c| c.contains(['.', ',']));
            if fit == 0.0 {
                0.0
            } else {
                fit + decimals * 0.2
            }
        });
    }

    mapping.currency = best_named(table, &mapping, CURRENCY, &|cells: &[&str]| {
        ratio(cells, |c| {
            c.len() == 3 && c.chars().all(|ch| ch.is_ascii_alphabetic())
        })
    });

    mapping.transaction_type = best_named(table, &mapping, TYPE, &|cells: &[&str]| {
        let mut distinct: Vec<&str> = cells.to_vec();
        distinct.sort_unstable();
        distinct.dedup();
        if !cells.is_empty() && distinct.len() <= 12 {
            1.0
        } else {
            0.0
        }
    });

    // Category: a named column whose cells are short labels, not amounts or dates.
    mapping.category = best_named(table, &mapping, CATEGORY, &|cells: &[&str]| {
        let mut distinct: Vec<&str> = cells.to_vec();
        distinct.sort_unstable();
        distinct.dedup();
        let labels = ratio(cells, |c| !looks_like_amount(c) && !looks_like_date(c));
        if !cells.is_empty() && distinct.len() <= 60 {
            labels
        } else {
            0.0
        }
    });

    // Description: a column named like one (however short its text), else the wordiest remaining one.
    mapping.description = best_named(table, &mapping, DESCRIPTION, &|cells: &[&str]| {
        if cells.is_empty() { 0.0 } else { 1.0 }
    })
    .or_else(|| {
        best(table, &mapping, DESCRIPTION, 0.5, |cells| {
            let words = ratio(cells, |c| {
                c.chars().filter(|ch| ch.is_alphabetic()).count() >= 2
            });
            let length = cells.iter().map(|c| c.chars().count()).sum::<usize>() as f64
                / cells.len().max(1) as f64;
            words * 0.6 + (length / 40.0).min(1.0) * 0.4
        })
    });
    mapping
}

/// A column chosen by its header (score above zero) that also fits.
fn best_named(
    table: &Table,
    mapping: &Mapping,
    synonyms: &[&str],
    fit: &dyn Fn(&[&str]) -> f64,
) -> Option<usize> {
    (0..table.headers.len())
        .filter(|&i| !mapping.taken(i) && header_score(&table.headers[i], synonyms) > 0)
        .filter(|&i| fit(&table.column(i)) >= 0.5)
        .max_by_key(|&i| (header_score(&table.headers[i], synonyms), usize::MAX - i))
}

fn is_serial(cell: &str) -> bool {
    cell.parse::<i64>()
        .is_ok_and(|n| (20_000..=80_000).contains(&n) || (19_000_101..=21_001_231).contains(&n))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importer::table::read_table;

    fn detect_from(csv: &str) -> Mapping {
        detect(&read_table(csv).unwrap())
    }

    #[test]
    fn finds_columns_by_header_name() {
        let m = detect_from("Booking Date,Narration,Amount,Ccy\n2026-09-01,Lidl,-12.50,EUR\n");
        assert_eq!(
            (m.date, m.description, m.amount, m.currency),
            (Some(0), Some(1), Some(2), Some(3))
        );
    }

    #[test]
    fn finds_debit_and_credit_columns() {
        let m = detect_from(
            "Date,Details,Money out,Money in\n2026-09-01,Lidl,12.50,\n2026-09-02,Pay,,900.00\n",
        );
        assert_eq!((m.debit, m.credit, m.amount), (Some(2), Some(3), None));
    }

    #[test]
    fn works_without_a_header_from_the_content() {
        let m = detect_from(
            "2026-09-01,Lidl groceries,-12.50\n2026-09-02,Taxi to the airport,-20.00\n",
        );
        assert_eq!(
            (m.date, m.description, m.amount),
            (Some(0), Some(1), Some(2))
        );
    }

    #[test]
    fn unfamiliar_headers_still_work_from_the_content() {
        let m = detect_from(
            "Zeitpunkt,Wofuer,Preis\n01.09.2026,Supermarkt Einkauf,12.50\n02.09.2026,Tankstelle Shell,45.00\n",
        );
        assert_eq!(
            (m.date, m.description, m.amount),
            (Some(0), Some(1), Some(2))
        );
    }

    #[test]
    fn finds_a_category_column_but_not_a_numeric_one() {
        let m = detect_from(
            "Date,Description,Amount,Category\n2026-09-01,Lidl,-12.50,Groceries\n2026-09-02,Shell,-40.00,Transport\n",
        );
        assert_eq!(m.category, Some(3));
        let none = detect_from(
            "Date,Description,Amount,Group\n2026-09-01,Lidl,-12.50,1\n2026-09-02,Shell,-40.00,2\n",
        );
        assert_eq!(none.category, None);
    }

    #[test]
    fn a_balance_column_is_never_the_amount() {
        let m = detect_from("Date,Description,Balance,Amount\n2026-09-01,Lidl,987.00,-12.50\n");
        assert_eq!(m.amount, Some(3));
    }

    #[test]
    fn prefers_the_booking_date_over_the_value_date() {
        let m = detect_from(
            "Value date,Booking date,Details,Amount\n2026-09-02,2026-09-01,Lidl,-5.00\n",
        );
        assert_eq!(m.date, Some(1));
    }

    #[test]
    fn a_date_column_of_excel_serials_is_found_by_its_name() {
        let m = detect_from("Date,Description,Amount\n46266,Lidl,12.50\n46267,Taxi,20.00\n");
        assert_eq!(m.date, Some(0));
        assert_eq!(m.amount, Some(2));
    }
}
