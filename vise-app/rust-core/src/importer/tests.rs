use super::*;
use crate::db::connection::establish_connection_test;
use crate::repository::transaction_repository::get_all;

fn input(content: &str) -> ImportInput {
    ImportInput {
        content: content.to_string(),
        today: "2026-10-07".to_string(),
        default_currency: "EUR".to_string(),
        mapping: None,
        no_columns: None,
        date_order: None,
        decimal_separator: None,
        positive_is: None,
        skip_duplicates: None,
        categories: None,
    }
}

fn day(text: &str) -> i64 {
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp()
}

#[test]
fn a_messy_european_file_is_arranged_and_saved() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Konto 123;;;\nUmsatzliste;;;\n\
Buchungstag;Verwendungszweck;Betrag;Waehrung\n\
03.09.2026;REWE Markt;-47,83;EUR\n\
04.09.2026;Gehalt;3.200,00;EUR\n\
25.09.2026;Tankstelle;-60,10;EUR\n";

    let preview = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(preview.header_row, Some(3));
    assert_eq!(preview.decimal_separator, "comma");
    assert_eq!(preview.date_order, "dmy");
    assert!(!preview.date_order_ambiguous);
    assert_eq!(preview.stats.ready, 3);

    let summary = commit(&mut conn, &input(csv)).unwrap();
    assert_eq!(summary.inserted, 3);
    let stored = get_all(&mut conn).unwrap();
    let salary = stored.iter().find(|t| t.description == "Gehalt").unwrap();
    assert_eq!(
        (salary.amount_cents, salary.transaction_type.as_str()),
        (320_000, "income")
    );
    assert_eq!(salary.occurred_at, day("2026-09-04"));
    let shop = stored
        .iter()
        .find(|t| t.description == "REWE Markt")
        .unwrap();
    assert_eq!(
        (shop.amount_cents, shop.transaction_type.as_str()),
        (4_783, "expense")
    );
}

#[test]
fn missing_dates_come_from_above_then_below_then_the_import_day() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n\
,First row,-1.00\n\
2026-09-01,Dated,-2.00\n\
,Same day as above,-3.00\n\
,Also above,-4.00\n\
2026-09-05,Later,-5.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    let dates: Vec<(&str, &str)> = p
        .sample
        .iter()
        .map(|r| (r.date.as_str(), r.date_source))
        .collect();
    assert_eq!(
        dates,
        [
            ("2026-09-01", "below"),
            ("2026-09-01", "file"),
            ("2026-09-01", "above"),
            ("2026-09-01", "above"),
            ("2026-09-05", "file"),
        ]
    );
    assert_eq!(
        (
            p.stats.dated,
            p.stats.filled_from_above,
            p.stats.filled_from_below
        ),
        (2, 2, 1)
    );

    let no_dates = "Description,Amount\nCoffee,-3.20\nBus,-2.00\n";
    let p = preview(&mut conn, &input(no_dates)).unwrap();
    assert!(
        p.sample
            .iter()
            .all(|r| r.date == "2026-10-07" && r.date_source == "import_day")
    );
    assert_eq!(p.stats.filled_with_import_date, 2);
    assert!(p.warnings.iter().any(|w| w.contains("No date column")));
}

#[test]
fn filled_rows_keep_the_file_order_within_the_day() {
    let mut conn = establish_connection_test().unwrap();
    commit(&mut conn, &input("Description,Amount\nA,-1\nB,-1\nC,-1\n")).unwrap();
    let mut stored = get_all(&mut conn).unwrap();
    stored.sort_by_key(|t| t.occurred_at);
    let names: Vec<&str> = stored.iter().map(|t| t.description.as_str()).collect();
    assert_eq!(names, ["A", "B", "C"]);
    assert!(
        stored
            .iter()
            .all(|t| t.occurred_at.div_euclid(86_400) == day("2026-10-07") / 86_400)
    );
}

#[test]
fn debit_and_credit_columns_decide_the_type() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Details,Money out,Money in\n2026-09-01,Lidl,12.50,\n2026-09-02,Pay,,900.00\n2026-09-03,Oops,1.00,2.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(p.stats.ready, 2);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].row, 4);
    let types: Vec<(&str, i64)> = p
        .sample
        .iter()
        .map(|r| (r.transaction_type, r.amount_cents))
        .collect();
    assert_eq!(types, [("expense", 1250), ("income", 90_000)]);
}

#[test]
fn a_type_column_and_all_positive_amounts() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount,Type\n2026-09-01,Lidl,12.50,Debit\n2026-09-02,Pay,900.00,Credit\n2026-09-03,To savings,50.00,Transfer\n2026-09-04,Shop,5.00,Refund\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    let types: Vec<&str> = p.sample.iter().map(|r| r.transaction_type).collect();
    assert_eq!(types, ["expense", "income", "transfer", "refund"]);

    let plain = "Date,Description,Amount\n2026-09-01,Lidl,12.50\n2026-09-02,Taxi,20.00\n";
    let p = preview(&mut conn, &input(plain)).unwrap();
    assert_eq!(p.positive_is, "expense");
    assert!(
        p.warnings
            .iter()
            .any(|w| w.contains("Every amount is positive"))
    );
    let mut choice = input(plain);
    choice.positive_is = Some("income".into());
    assert_eq!(
        preview(&mut conn, &choice).unwrap().sample[0].transaction_type,
        "income"
    );
}

#[test]
fn totals_and_notes_are_skipped_not_imported() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n2026-09-01,Lidl,-12.50\n,Total,-12.50\n,Closing balance,987.00\n,,\n2026-09-02,Taxi,-20.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(p.stats.ready, 2);
    assert_eq!(p.stats.skipped, 2);
}

#[test]
fn an_unreadable_date_is_an_error_and_is_not_guessed() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n2026-09-01,Lidl,-12.50\n32/13/2026,Bad,-1.00\n2026-09-03,Taxi,-20.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(p.stats.ready, 2);
    assert_eq!(p.stats.errors, 1);
    assert_eq!(p.errors[0].row, 3);
    assert!(p.errors[0].message.contains("32/13/2026"));
}

#[test]
fn bad_amounts_and_zero_are_row_errors() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n2026-09-01,A,abc\n2026-09-02,B,0.00\n2026-09-03,C,-5.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!((p.stats.ready, p.stats.errors), (1, 2));
}

#[test]
fn ambiguous_dates_are_flagged_and_can_be_overridden() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n03/04/2026,A,-1.00\n05/06/2026,B,-2.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert!(p.date_order_ambiguous);
    assert_eq!(p.sample[0].date, "2026-04-03");

    let mut month_first = input(csv);
    month_first.date_order = Some("mdy".into());
    let p = preview(&mut conn, &month_first).unwrap();
    assert!(!p.date_order_ambiguous);
    assert_eq!(p.sample[0].date, "2026-03-04");
}

#[test]
fn importing_the_same_file_twice_adds_nothing() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n2026-09-01,Lidl,-12.50\n2026-09-02,Taxi,-20.00\n";
    assert_eq!(commit(&mut conn, &input(csv)).unwrap().inserted, 2);
    let again = commit(&mut conn, &input(csv)).unwrap();
    assert_eq!((again.inserted, again.duplicates), (0, 2));
    assert_eq!(get_all(&mut conn).unwrap().len(), 2);

    let mut keep = input(csv);
    keep.skip_duplicates = Some(false);
    assert_eq!(commit(&mut conn, &keep).unwrap().inserted, 2);
}

#[test]
fn two_real_identical_purchases_in_one_file_are_both_kept() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n2026-09-01,Coffee,-3.20\n2026-09-01,Coffee,-3.20\n";
    assert_eq!(commit(&mut conn, &input(csv)).unwrap().inserted, 2);
    // One stored coffee cancels only one of two in a later file.
    let mut conn = establish_connection_test().unwrap();
    commit(
        &mut conn,
        &input("Date,Description,Amount\n2026-09-01,Coffee,-3.20\n"),
    )
    .unwrap();
    assert_eq!(commit(&mut conn, &input(csv)).unwrap().inserted, 1);
}

#[test]
fn a_file_without_a_header_row_works() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "2026-09-01,Lidl groceries,-12.50\n2026-09-02,Taxi to the airport,-20.00\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(p.header_row, None);
    assert_eq!(p.stats.ready, 2);
    assert_eq!(p.sample[0].description, "Lidl groceries");
}

#[test]
fn the_user_can_override_the_detected_columns() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "A,B,C\n2026-09-01,Lidl,-12.50\n";
    let mut chosen = input(csv);
    chosen.mapping = Some(MappingInput {
        description: Some(1),
        amount: Some(2),
        date: Some(0),
        ..Default::default()
    });
    let p = preview(&mut conn, &chosen).unwrap();
    assert_eq!(p.sample[0].description, "Lidl");

    chosen.mapping = Some(MappingInput {
        amount: Some(9),
        ..Default::default()
    });
    assert!(preview(&mut conn, &chosen).is_err());
}

#[test]
fn currency_comes_from_the_column_or_the_default() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount,Currency\n2026-09-01,A,-1.00,usd\n2026-09-02,B,-2.00,\n2026-09-03,C,-3.00,XX\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    let currencies: Vec<&str> = p.sample.iter().map(|r| r.currency.as_str()).collect();
    assert_eq!(currencies, ["USD", "EUR"]);
    assert_eq!(p.stats.errors, 1);
}

#[test]
fn nothing_is_written_when_a_file_has_no_amount_column() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description\n2026-09-01,Lidl\n";
    assert!(!preview(&mut conn, &input(csv)).unwrap().warnings.is_empty());
    assert!(commit(&mut conn, &input(csv)).is_err());
    assert!(get_all(&mut conn).unwrap().is_empty());
}

#[test]
fn empty_and_oversized_files_are_rejected() {
    let mut conn = establish_connection_test().unwrap();
    assert!(preview(&mut conn, &input("")).is_err());
    assert!(preview(&mut conn, &input("Date,Amount\n")).is_err());
    assert!(preview(&mut conn, &input(&"x".repeat(MAX_CONTENT_BYTES + 1))).is_err());
}

#[test]
fn preview_never_writes() {
    let mut conn = establish_connection_test().unwrap();
    preview(
        &mut conn,
        &input("Date,Description,Amount\n2026-09-01,Lidl,-12.50\n"),
    )
    .unwrap();
    assert!(get_all(&mut conn).unwrap().is_empty());
}

// ----- Categorizing -----

use crate::repository::expense_category_repository;
use crate::service::{self, NewCategoryInput, NewTransactionInput};

fn category(conn: &mut SqliteConnection, name: &str) -> i32 {
    service::add_category(
        conn,
        &NewCategoryInput {
            name: name.into(),
            icon: None,
            color: None,
        },
    )
    .unwrap()
    .id
    .unwrap()
}

fn stored_expense(conn: &mut SqliteConnection, description: &str, category_id: i32) {
    service::add_transaction(
        conn,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "5".into(),
            currency: "EUR".into(),
            description: description.into(),
            date: "2026-08-01".into(),
            expense_category_id: Some(category_id),
            income_source_id: None,
        },
    )
    .unwrap();
}

fn with_choices(csv: &str, choices: Vec<CategoryChoice>) -> ImportInput {
    let mut input = input(csv);
    input.categories = Some(choices);
    input
}

fn choice(group: &str, category_id: Option<i32>, new_category: Option<&str>) -> CategoryChoice {
    CategoryChoice {
        group: group.into(),
        category_id,
        new_category: new_category.map(String::from),
    }
}

const SHOPPING: &str = "Date,Description,Amount\n\
2026-09-01,LIDL STORE 1234 BERLIN,-10.00\n\
2026-09-02,Lidl Berlin 77,-20.00\n\
2026-09-03,Shell 4410,-40.00\n\
2026-09-04,Salary,900.00\n";

#[test]
fn rows_of_one_merchant_form_one_group_and_income_has_none() {
    let mut conn = establish_connection_test().unwrap();
    let p = preview(&mut conn, &input(SHOPPING)).unwrap();
    let groups: Vec<(&str, usize, i64)> = p
        .groups
        .iter()
        .map(|g| (g.key.as_str(), g.rows, g.total_cents))
        .collect();
    // Biggest spending first; the salary is not grouped.
    assert_eq!(groups, [("m:shell", 1, 4_000), ("m:lidl berlin", 2, 3_000)]);
    assert!(p.groups.iter().all(|g| g.suggestion.is_none()));
}

#[test]
fn suggests_the_category_the_user_used_for_that_merchant_before() {
    let mut conn = establish_connection_test().unwrap();
    let groceries = category(&mut conn, "Groceries");
    stored_expense(&mut conn, "LIDL STORE 99 BERLIN", groceries);
    stored_expense(&mut conn, "Lidl Berlin", groceries);

    let p = preview(&mut conn, &input(SHOPPING)).unwrap();
    let lidl = p.groups.iter().find(|g| g.key == "m:lidl berlin").unwrap();
    let suggestion = lidl.suggestion.as_ref().unwrap();
    assert_eq!(
        (
            suggestion.category_id,
            suggestion.name.as_str(),
            suggestion.source
        ),
        (Some(groceries), "Groceries", "history")
    );
    assert!(
        p.groups
            .iter()
            .find(|g| g.key == "m:shell")
            .unwrap()
            .suggestion
            .is_none()
    );
}

#[test]
fn the_most_used_category_wins_the_suggestion() {
    let mut conn = establish_connection_test().unwrap();
    let (food, fuel) = (category(&mut conn, "Food"), category(&mut conn, "Fuel"));
    stored_expense(&mut conn, "Shell 1", food);
    stored_expense(&mut conn, "Shell 2", fuel);
    stored_expense(&mut conn, "Shell 3", fuel);
    let p = preview(&mut conn, &input(SHOPPING)).unwrap();
    let shell = p.groups.iter().find(|g| g.key == "m:shell").unwrap();
    assert_eq!(shell.suggestion.as_ref().unwrap().category_id, Some(fuel));
}

#[test]
fn committing_applies_one_choice_to_every_row_in_the_group() {
    let mut conn = establish_connection_test().unwrap();
    let groceries = category(&mut conn, "Groceries");
    let summary = commit(
        &mut conn,
        &with_choices(
            SHOPPING,
            vec![choice("m:lidl berlin", Some(groceries), None)],
        ),
    )
    .unwrap();
    assert_eq!(
        (
            summary.inserted,
            summary.categorized,
            summary.categories_created
        ),
        (4, 2, 0)
    );

    let stored = get_all(&mut conn).unwrap();
    for t in &stored {
        let expected = t
            .description
            .to_lowercase()
            .contains("lidl")
            .then_some(groceries);
        assert_eq!(t.expense_category_id, expected, "{}", t.description);
    }
}

#[test]
fn a_choice_can_create_a_new_category_or_reuse_one_by_name() {
    let mut conn = establish_connection_test().unwrap();
    let groceries = category(&mut conn, "Groceries");
    let summary = commit(
        &mut conn,
        &with_choices(
            SHOPPING,
            vec![
                choice("m:lidl berlin", None, Some("groceries")),
                choice("m:shell", None, Some("Fuel")),
            ],
        ),
    )
    .unwrap();
    assert_eq!((summary.categorized, summary.categories_created), (3, 1));
    let names: Vec<String> = expense_category_repository::get_all(&mut conn)
        .unwrap()
        .into_iter()
        .map(|c| c.name)
        .collect();
    assert_eq!(names, ["Groceries", "Fuel"]);
    let lidl = get_all(&mut conn)
        .unwrap()
        .into_iter()
        .find(|t| t.description.starts_with("Lidl"))
        .unwrap();
    assert_eq!(lidl.expense_category_id, Some(groceries));
}

#[test]
fn groups_without_a_choice_are_saved_uncategorized() {
    let mut conn = establish_connection_test().unwrap();
    let summary = commit(&mut conn, &input(SHOPPING)).unwrap();
    assert_eq!((summary.inserted, summary.categorized), (4, 0));
    assert!(
        get_all(&mut conn)
            .unwrap()
            .iter()
            .all(|t| t.expense_category_id.is_none())
    );
}

#[test]
fn a_bad_choice_saves_nothing_not_even_the_rows_or_a_new_category() {
    let mut conn = establish_connection_test().unwrap();
    for bad in [
        vec![choice("m:nowhere", None, Some("Fuel"))],
        vec![choice("m:shell", Some(999), None)],
        vec![choice("m:shell", Some(1), Some("Fuel"))],
        vec![
            choice("m:shell", None, Some("Fuel")),
            choice("m:lidl berlin", Some(999), None),
        ],
    ] {
        assert!(commit(&mut conn, &with_choices(SHOPPING, bad)).is_err());
    }
    assert!(get_all(&mut conn).unwrap().is_empty());
    assert!(
        expense_category_repository::get_all(&mut conn)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_category_column_in_the_file_makes_groups_that_are_matched_or_new() {
    let mut conn = establish_connection_test().unwrap();
    let groceries = category(&mut conn, "Groceries");
    let csv = "Date,Description,Amount,Category\n\
2026-09-01,Lidl,-10.00,groceries\n\
2026-09-02,Edeka,-20.00,Groceries\n\
2026-09-03,Cinema,-15.00,Fun\n\
2026-09-04,Misc,-1.00,Uncategorized\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    assert_eq!(p.mapping.category, Some(3));

    let by_key = |key: &str| p.groups.iter().find(|g| g.key == key).unwrap();
    let known = by_key("cat:groceries");
    assert_eq!(
        (known.kind, known.rows, known.total_cents),
        ("file_category", 2, 3_000)
    );
    let s = known.suggestion.as_ref().unwrap();
    assert_eq!(
        (s.category_id, s.is_new, s.source),
        (Some(groceries), false, "file")
    );
    let fun = by_key("cat:fun").suggestion.as_ref().unwrap();
    assert_eq!(
        (fun.category_id, fun.is_new, fun.name.as_str()),
        (None, true, "Fun")
    );
    // "Uncategorized" counts as no category, so that row groups by merchant instead.
    assert!(p.groups.iter().any(|g| g.key == "m:misc"));

    let summary = commit(
        &mut conn,
        &with_choices(
            csv,
            vec![
                choice("cat:groceries", Some(groceries), None),
                choice("cat:fun", None, Some("Fun")),
            ],
        ),
    )
    .unwrap();
    assert_eq!((summary.categorized, summary.categories_created), (3, 1));
}

#[test]
fn duplicates_are_not_grouped_or_counted() {
    let mut conn = establish_connection_test().unwrap();
    commit(&mut conn, &input(SHOPPING)).unwrap();
    let p = preview(&mut conn, &input(SHOPPING)).unwrap();
    assert!(p.groups.is_empty());
    assert_eq!(p.stats.duplicates, 4);
}

#[test]
fn a_mapping_override_can_point_at_the_category_column() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "A,B,C,D\n2026-09-01,Lidl,-12.50,Food\n";
    let mut chosen = input(csv);
    chosen.mapping = Some(MappingInput {
        date: Some(0),
        description: Some(1),
        amount: Some(2),
        category: Some(3),
        ..Default::default()
    });
    let p = preview(&mut conn, &chosen).unwrap();
    assert_eq!(p.groups[0].key, "cat:food");
}

#[test]
fn only_real_totals_lines_are_skipped_not_purchases_that_share_a_word() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount\n\
2026-09-01,Opening coffee,-3.50\n\
2026-09-02,Total Wine,-20.00\n\
2026-09-03,Closing balance,987.00\n\
2026-09-04,Summe,-23.50\n";
    let p = preview(&mut conn, &input(csv)).unwrap();
    let kept: Vec<&str> = p.sample.iter().map(|r| r.description.as_str()).collect();
    assert_eq!(kept, ["Opening coffee", "Total Wine"]);
    assert_eq!(p.stats.skipped, 2);
}

#[test]
fn a_wrong_detection_can_be_switched_off() {
    let mut conn = establish_connection_test().unwrap();
    let csv = "Date,Description,Amount,Category\n2026-09-01,Lidl,-12.50,Groceries\n";
    assert_eq!(
        preview(&mut conn, &input(csv)).unwrap().mapping.category,
        Some(3)
    );

    let mut without = input(csv);
    without.no_columns = Some(vec!["category".into()]);
    let p = preview(&mut conn, &without).unwrap();
    assert_eq!(p.mapping.category, None);
    assert_eq!(p.groups[0].key, "m:lidl");

    without.no_columns = Some(vec!["colour".into()]);
    assert!(preview(&mut conn, &without).is_err());
}
