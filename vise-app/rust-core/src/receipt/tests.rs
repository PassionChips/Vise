use super::*;
use crate::db::connection::establish_connection_test;
use crate::service::{self, NewCategoryInput, NewTransactionInput};

/// Receipt text as an OCR would return it. A tab splits a row into a label block on the
/// left and a price block on the right, a few pixels out of line, like a real photo.
fn lines(text: &str) -> Vec<OcrLine> {
    let mut out = Vec::new();
    for (i, row) in text.lines().enumerate() {
        let top = i as f64 * 24.0;
        for (j, part) in row.split('\t').enumerate() {
            let wobble = if j == 0 { 0.0 } else { 3.0 };
            out.push(OcrLine {
                text: part.to_string(),
                left: j as f64 * 300.0,
                top: top + wobble,
                right: j as f64 * 300.0 + 200.0,
                bottom: top + 20.0 + wobble,
            });
        }
    }
    out
}

fn scan_with(text: &str, currency: &str) -> ReceiptScan {
    let mut conn = establish_connection_test().unwrap();
    scan_in(&mut conn, text, currency)
}

fn scan_in(conn: &mut SqliteConnection, text: &str, currency: &str) -> ReceiptScan {
    let input = ReceiptInput {
        lines: lines(text),
        today: "2026-10-07".to_string(),
        default_currency: currency.to_string(),
    };
    parse(conn, &input).unwrap()
}

fn scan(text: &str) -> ReceiptScan {
    scan_with(text, "EUR")
}

const TESCO: &str = "TESCO EXPRESS
123 High Street
Tel 0123 456789
12/09/2026 14:03
Milk 2L\t1.20
Bread\t0.95
SUBTOTAL\t2.15
VAT 20%\t0.43
TOTAL\t£2.58
CASH\t5.00
CHANGE\t2.42";

const REWE: &str = "REWE MARKT GmbH
Musterstr. 5
03.09.2026 18:22
Brot\t2,49 A
Milch\t1,19 A
Fleisch 2 x 12,50\t25,00 B
Zwischensumme\t28,68
SUMME EUR\t47,83
davon MwSt 19%\t7,64
Bar\t50,00
Rückgeld\t2,17";

#[test]
fn an_english_receipt_gives_total_date_merchant_and_currency() {
    let s = scan_with(TESCO, "EUR");
    assert_eq!(s.merchant.as_deref(), Some("Tesco Express"));
    assert_eq!(s.date.as_deref(), Some("2026-09-12"));
    let top = &s.totals[0];
    assert_eq!((top.amount_cents, top.confidence), (258, "total"));
    assert_eq!((s.currency.as_str(), s.currency_found), ("GBP", true));
}

#[test]
fn the_total_is_not_the_subtotal_tax_cash_or_change() {
    let amounts: Vec<i64> = scan(TESCO).totals.iter().map(|t| t.amount_cents).collect();
    assert_eq!(amounts[0], 258);
    assert!(!amounts[..1].contains(&215) && !amounts[..1].contains(&43));
    // Cash tendered and change are never candidates; the subtotal and VAT rows are excluded too.
    for excluded in [500, 242, 215, 43] {
        assert!(
            !amounts.contains(&excluded),
            "{excluded} should not be offered"
        );
    }
}

#[test]
fn a_german_receipt_uses_comma_decimals_and_tax_letters() {
    let s = scan(REWE);
    assert_eq!(s.merchant.as_deref(), Some("REWE MARKT GmbH"));
    assert_eq!(s.date.as_deref(), Some("2026-09-03"));
    assert_eq!(
        (s.totals[0].amount_cents, s.totals[0].confidence),
        (4783, "total")
    );
    assert!(s.currency_found && s.currency == "EUR");
    let amounts: Vec<i64> = s.totals.iter().map(|t| t.amount_cents).collect();
    assert!(!amounts.contains(&5000) && !amounts.contains(&217));
}

#[test]
fn labels_and_prices_in_separate_blocks_still_pair_up() {
    // Labels first, then every price, the way some OCR engines order blocks.
    let mut all = lines("SHOP\nTOTAL\nCARD");
    for (i, price) in ["", "45.30", "45.30"].iter().enumerate().skip(1) {
        let top = (i as f64) * 24.0 + 4.0;
        all.push(OcrLine {
            text: price.to_string(),
            left: 400.0,
            top,
            right: 480.0,
            bottom: top + 20.0,
        });
    }
    let mut conn = establish_connection_test().unwrap();
    let input = ReceiptInput {
        lines: all,
        today: "2026-10-07".into(),
        default_currency: "EUR".into(),
    };
    let s = parse(&mut conn, &input).unwrap();
    assert_eq!(s.totals[0].amount_cents, 4530);
    assert!(s.totals[0].line.starts_with("TOTAL"));
}

#[test]
fn a_card_payment_line_is_a_likely_total_when_no_total_is_printed() {
    let s = scan("Starbucks\nLatte\t4.50\nMuffin\t3.20\nVISA ****1234\t7.70");
    assert_eq!(
        (s.totals[0].amount_cents, s.totals[0].confidence),
        (770, "likely")
    );
}

#[test]
fn without_any_label_the_largest_amount_is_offered_with_a_warning() {
    let s = scan("Corner Shop\nSnack\t1.50\nDrink\t2.20\n3.70");
    assert_eq!(s.totals[0].amount_cents, 370);
    assert_eq!(s.totals[0].confidence, "possible");
    assert!(s.warnings.iter().any(|w| w.contains("guess")));
}

#[test]
fn total_tax_is_not_the_total_but_total_including_vat_is() {
    assert_eq!(
        scan("Shop\nTotal VAT\t4.50\nTOTAL\t54.00").totals[0].amount_cents,
        5400
    );
    assert_eq!(
        scan("Shop\nNet\t45.00\nTotal (incl. VAT)\t54.00").totals[0].amount_cents,
        5400
    );
}

#[test]
fn quantity_lines_use_the_last_price_and_ignore_dates_and_percentages() {
    let s = scan("Cafe\n01.09.2026\n2 x 1.50\t3.00\nMwSt 19,00%\t0.48\nTotal\t3.00");
    let amounts: Vec<i64> = s.totals.iter().map(|t| t.amount_cents).collect();
    assert_eq!(amounts, [300]);
    assert_eq!(s.date.as_deref(), Some("2026-09-01"));
}

#[test]
fn dates_in_text_and_other_orders_are_read() {
    assert_eq!(
        scan("Shop\n12 Sep 2026\nTotal\t1.00").date.as_deref(),
        Some("2026-09-12")
    );
    assert_eq!(
        scan("Shop\n2026-09-12 10:30\nTotal\t1.00").date.as_deref(),
        Some("2026-09-12")
    );
    let us = scan("Shop\n09/25/2026\nTotal\t1.00");
    assert_eq!(us.date.as_deref(), Some("2026-09-25"));
    assert!(us.warnings.is_empty());
}

#[test]
fn an_unclear_day_month_order_is_flagged() {
    let s = scan("Shop\n03/04/2026\nTotal\t1.00");
    assert_eq!(s.date.as_deref(), Some("2026-04-03"));
    assert!(s.warnings.iter().any(|w| w.contains("day-first")));
}

#[test]
fn implausible_dates_are_not_used() {
    for text in [
        "Shop\n01/01/1999\nTotal\t1.00",
        "Shop\n01/01/2031\nTotal\t1.00",
        "Shop\nCard 1234 5678\nTotal\t1.00",
    ] {
        assert_eq!(scan(text).date, None, "{text}");
    }
}

#[test]
fn a_bare_dollar_sign_means_the_users_own_dollar_currency() {
    assert_eq!(scan_with("Shop\nTotal\t$12.00", "CAD").currency, "CAD");
    assert_eq!(scan_with("Shop\nTotal\t$12.00", "EUR").currency, "USD");
    let none = scan_with("Shop\nTotal\t12.00", "GBP");
    assert_eq!(
        (none.currency.as_str(), none.currency_found),
        ("GBP", false)
    );
    assert_eq!(scan_with("Shop\nTotal CHF\t12.00", "EUR").currency, "CHF");
}

#[test]
fn the_merchant_skips_noise_and_non_names() {
    let s = scan("RECEIPT\nTel 030 1234567\n*** *** ***\nBäckerei Schmidt\nTotal\t2.00");
    assert_eq!(s.merchant.as_deref(), Some("Bäckerei Schmidt"));
    assert_eq!(scan("12345\n67890").merchant, None);
}

#[test]
fn the_category_comes_from_how_the_user_filed_that_merchant_before() {
    let mut conn = establish_connection_test().unwrap();
    let groceries = service::add_category(
        &mut conn,
        &NewCategoryInput {
            name: "Groceries".into(),
            icon: None,
            color: None,
        },
    )
    .unwrap()
    .id
    .unwrap();
    service::add_transaction(
        &mut conn,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "20".into(),
            currency: "EUR".into(),
            description: "REWE MARKT 4411".into(),
            date: "2026-09-01".into(),
            expense_category_id: Some(groceries),
            income_source_id: None,
        },
    )
    .unwrap();

    let s = scan_in(&mut conn, "REWE MARKT\nSumme\t9.99", "EUR");
    let suggestion = s.suggestion.unwrap();
    assert_eq!(
        (
            suggestion.category_id,
            suggestion.name.as_str(),
            suggestion.source
        ),
        (Some(groceries), "Groceries", "history")
    );
    assert!(
        scan_in(&mut conn, "Unknown Shop\nSumme\t9.99", "EUR")
            .suggestion
            .is_none()
    );
}

#[test]
fn an_empty_or_unreadable_photo_says_so_instead_of_guessing() {
    let empty = scan("");
    assert!(empty.totals.is_empty() && empty.merchant.is_none() && empty.date.is_none());
    assert!(empty.warnings.iter().any(|w| w.contains("No text")));
    let junk = scan("asdf\nqwer zxcv");
    assert!(junk.totals.is_empty());
    assert!(
        junk.warnings
            .iter()
            .any(|w| w.contains("Could not find a total"))
    );
}

#[test]
fn two_labelled_totals_that_disagree_are_flagged() {
    let s = scan("Shop\nTotal\t10.00\nTotal\t12.00");
    assert!(s.warnings.iter().any(|w| w.contains("Several amounts")));
    assert_eq!(s.totals.len(), 2);
}

#[test]
fn rows_are_joined_by_position_not_by_order() {
    let rows = rows_from_lines(&[
        OcrLine {
            text: "9.99".into(),
            left: 300.0,
            top: 2.0,
            right: 360.0,
            bottom: 22.0,
        },
        OcrLine {
            text: "Second".into(),
            left: 0.0,
            top: 40.0,
            right: 100.0,
            bottom: 60.0,
        },
        OcrLine {
            text: "First".into(),
            left: 0.0,
            top: 0.0,
            right: 100.0,
            bottom: 20.0,
        },
        OcrLine {
            text: "  ".into(),
            left: 0.0,
            top: 80.0,
            right: 10.0,
            bottom: 90.0,
        },
    ]);
    assert_eq!(rows, ["First  9.99", "Second"]);
}

#[test]
fn bad_input_is_a_validation_error() {
    let mut conn = establish_connection_test().unwrap();
    let bad_today = ReceiptInput {
        lines: vec![],
        today: "yesterday".into(),
        default_currency: "EUR".into(),
    };
    assert!(parse(&mut conn, &bad_today).is_err());
    let bad_currency = ReceiptInput {
        lines: vec![],
        today: "2026-10-07".into(),
        default_currency: "euros".into(),
    };
    assert!(parse(&mut conn, &bad_currency).is_err());
}

#[test]
fn german_cash_is_excluded_but_a_word_containing_bar_is_not() {
    let amounts = |text: &str| {
        scan(text)
            .totals
            .iter()
            .map(|t| t.amount_cents)
            .collect::<Vec<_>>()
    };
    assert!(!amounts("Shop\nSumme\t8,00\nBar\t10,00").contains(&1000));
    assert!(amounts("Cafe\nBarista special\t3.50\nVISA\t3.50").contains(&350));
}
