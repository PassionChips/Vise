//! The sample files in `samples/import/` must keep importing the way their names promise,
//! so they stay usable for manual testing.

use rust_core::db::connection::establish_connection_test;
use rust_core::importer::{ImportInput, ImportPreview, preview};

fn preview_of(file: &str) -> ImportPreview {
    let path = format!("{}/../samples/import/{file}", env!("CARGO_MANIFEST_DIR"));
    let content = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    let mut connection = establish_connection_test().unwrap();
    let input = ImportInput {
        content,
        today: "2026-10-07".to_string(),
        default_currency: "EUR".to_string(),
        mapping: None,
        no_columns: None,
        date_order: None,
        decimal_separator: None,
        positive_is: None,
        skip_duplicates: None,
        categories: None,
    };
    preview(&mut connection, &input).unwrap()
}

#[test]
fn simple_file_imports_cleanly_and_groups_merchants() {
    let p = preview_of("01-simple.csv");
    assert_eq!((p.stats.ready, p.stats.errors), (28, 0));
    // Lidl x4 under two spellings, Shell x3, Starbucks x3 and so on are far fewer groups than rows.
    assert!(p.groups.len() < 20, "{} groups", p.groups.len());
    assert!(
        p.groups
            .iter()
            .any(|g| g.key == "m:lidl berlin" && g.rows == 4)
    );
}

#[test]
fn german_bank_file_is_read_with_commas_and_title_lines() {
    let p = preview_of("02-german-bank-semicolon.csv");
    assert_eq!(p.decimal_separator, "comma");
    assert_eq!((p.stats.ready, p.stats.skipped, p.stats.errors), (11, 1, 0));
    assert!(p.header_row.is_some_and(|row| row > 1));
}

#[test]
fn debit_credit_file_uses_the_category_column() {
    let p = preview_of("03-debit-credit-with-category.csv");
    assert!(
        p.mapping.debit.is_some() && p.mapping.credit.is_some() && p.mapping.category.is_some()
    );
    assert_eq!((p.stats.ready, p.stats.errors), (12, 0));
    assert!(p.groups.iter().any(|g| g.key == "cat:fun" && g.rows == 2));
}

#[test]
fn missing_dates_are_filled_and_the_total_row_is_skipped() {
    let p = preview_of("04-missing-dates.csv");
    assert_eq!(p.stats.skipped, 1);
    assert_eq!(p.stats.dated, 3);
    assert_eq!(p.stats.filled_from_below, 1);
    assert_eq!(p.stats.filled_from_above, 4);
}

#[test]
fn us_dates_are_flagged_as_ambiguous() {
    let p = preview_of("05-us-dates-ambiguous.csv");
    assert!(p.date_order_ambiguous);
    assert_eq!(p.stats.ready, 5);
}

#[test]
fn error_file_reports_exactly_the_bad_rows() {
    let p = preview_of("06-with-errors.csv");
    assert_eq!((p.stats.ready, p.stats.errors), (2, 3));
    let rows: Vec<usize> = p.errors.iter().map(|e| e.row).collect();
    assert_eq!(rows, [3, 4, 5]);
}
