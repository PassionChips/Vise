use super::*;
use crate::db::connection::establish_connection_test;
use crate::service::settings::UpdateSettingsInput;
use crate::service::{NewCategoryInput, add_category, add_transaction, list_transactions};

const PHONEPE: &str = "com.phonepe.app";
const GPAY: &str = "com.google.android.apps.nbu.paisa.user";

fn input(package: &str, title: &str, text: &str, posted_at: i64, date: &str) -> CaptureInput {
    CaptureInput {
        package: package.into(),
        title: title.into(),
        text: text.into(),
        posted_at,
        local_date: date.into(),
    }
}

fn starbucks(posted_at: i64) -> CaptureInput {
    input(
        PHONEPE,
        "Paid ₹250 to Starbucks",
        "Payment successful. UPI Ref No 412345678901",
        posted_at,
        "2026-10-08",
    )
}

fn category(conn: &mut SqliteConnection, name: &str) -> i32 {
    add_category(
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

fn id_of(result: CaptureResult) -> i32 {
    assert_eq!(result.status, "captured");
    result.id.unwrap()
}

#[test]
fn a_payment_notification_waits_in_the_inbox_with_what_was_read() {
    let mut conn = establish_connection_test().unwrap();
    let id = id_of(capture(&mut conn, &starbucks(1_791_000_000)).unwrap());

    let inbox = list(&mut conn).unwrap();
    assert_eq!(inbox.len(), 1);
    let p = &inbox[0];
    assert_eq!(p.id, id);
    assert_eq!(
        (p.app.as_str(), p.app_name.as_str()),
        ("phonepe", "PhonePe")
    );
    assert_eq!(
        (
            p.direction.as_deref(),
            p.amount_cents,
            p.currency.as_deref()
        ),
        (Some("expense"), Some(25_000), Some("INR"))
    );
    assert_eq!(
        (p.merchant.as_deref(), p.occurred_on.as_str()),
        (Some("Starbucks"), "2026-10-08")
    );
    assert!(p.understood && !p.possible_duplicate);
    assert!(p.excerpt.contains("Starbucks"));
    // Nothing is a transaction until the user says so.
    assert!(list_transactions(&mut conn, "2026-10").unwrap().is_empty());
}

#[test]
fn the_category_the_user_usually_picks_for_that_shop_is_suggested() {
    let mut conn = establish_connection_test().unwrap();
    let coffee = category(&mut conn, "Coffee");
    add_transaction(
        &mut conn,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "3".into(),
            currency: "INR".into(),
            description: "Starbucks".into(),
            date: "2026-09-01".into(),
            expense_category_id: Some(coffee),
            income_source_id: None,
        },
    )
    .unwrap();
    capture(&mut conn, &starbucks(1_791_000_000)).unwrap();
    let p = &list(&mut conn).unwrap()[0];
    assert_eq!(
        (
            p.suggested_category_id,
            p.suggested_category_name.as_deref()
        ),
        (Some(coffee), Some("Coffee"))
    );
}

#[test]
fn the_same_notification_posted_twice_is_captured_once() {
    let mut conn = establish_connection_test().unwrap();
    id_of(capture(&mut conn, &starbucks(1_791_000_000)).unwrap());
    // Posted again a minute later, and as an update of the same payment with the same reference much later.
    assert_eq!(
        capture(&mut conn, &starbucks(1_791_000_060))
            .unwrap()
            .status,
        "duplicate"
    );
    let again = input(
        PHONEPE,
        "Payment of ₹250 done",
        "Paid to Starbucks. UPI Ref No 412345678901",
        1_791_090_000,
        "2026-10-09",
    );
    assert_eq!(capture(&mut conn, &again).unwrap().status, "duplicate");
    assert_eq!(list(&mut conn).unwrap().len(), 1);
}

#[test]
fn two_real_payments_of_the_same_amount_hours_apart_are_both_kept() {
    let mut conn = establish_connection_test().unwrap();
    let a = input(
        GPAY,
        "You paid ₹40",
        "to Chai Point",
        1_791_000_000,
        "2026-10-08",
    );
    let b = input(
        GPAY,
        "You paid ₹40",
        "to Chai Point",
        1_791_000_000 + 7_200,
        "2026-10-08",
    );
    id_of(capture(&mut conn, &a).unwrap());
    id_of(capture(&mut conn, &b).unwrap());
    assert_eq!(list(&mut conn).unwrap().len(), 2);
}

#[test]
fn other_apps_and_non_payments_are_dropped_and_stored_nowhere() {
    let mut conn = establish_connection_test().unwrap();
    let bank = input(
        "com.hdfc.bank",
        "Debit alert",
        "Rs. 250 debited from A/c XX1234",
        1_791_000_000,
        "2026-10-08",
    );
    assert_eq!(capture(&mut conn, &bank).unwrap().status, "unsupported_app");
    let ad = input(
        PHONEPE,
        "Offer",
        "Get up to ₹100 cashback on your next payment",
        1_791_000_000,
        "2026-10-08",
    );
    assert_eq!(capture(&mut conn, &ad).unwrap().status, "ignored");
    let request = input(
        GPAY,
        "Rahul requested money",
        "Rahul requested ₹500 from you",
        1_791_000_000,
        "2026-10-08",
    );
    assert_eq!(capture(&mut conn, &request).unwrap().status, "ignored");
    assert!(list(&mut conn).unwrap().is_empty());
}

#[test]
fn an_amount_with_no_clear_direction_waits_for_the_user_to_finish_it() {
    let mut conn = establish_connection_test().unwrap();
    let id = id_of(
        capture(
            &mut conn,
            &input(
                PHONEPE,
                "PhonePe",
                "Transaction of ₹250 for order 8837",
                1_791_000_000,
                "2026-10-08",
            ),
        )
        .unwrap(),
    );
    let p = &list(&mut conn).unwrap()[0];
    assert!(!p.understood && p.direction.is_none() && p.amount_cents.is_none());
    let error = confirm(
        &mut conn,
        &ConfirmInput {
            id,
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap_err();
    assert!(error.to_string().contains("could not tell"), "{error}");
    assert_eq!(list(&mut conn).unwrap().len(), 1, "still waiting");
}

#[test]
fn confirming_creates_the_transaction_on_the_day_it_happened() {
    let mut conn = establish_connection_test().unwrap();
    let food = category(&mut conn, "Food");
    // Posted 100 seconds after midnight UTC on 9 October, but the phone (in a timezone behind UTC) still said the 8th.
    let ninth = NaiveDate::from_ymd_opt(2026, 10, 9)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();
    let id = id_of(
        capture(
            &mut conn,
            &input(
                PHONEPE,
                "Paid ₹250 to Starbucks",
                "",
                ninth + 100,
                "2026-10-08",
            ),
        )
        .unwrap(),
    );

    let t = confirm(
        &mut conn,
        &ConfirmInput {
            id,
            expense_category_id: Some(food),
            income_source_id: None,
        },
    )
    .unwrap();
    assert_eq!(
        (
            t.transaction_type.as_str(),
            t.amount_cents,
            t.currency.as_str()
        ),
        ("expense", 25_000, "INR")
    );
    assert_eq!(
        (t.description.as_str(), t.expense_category_id),
        ("Starbucks", Some(food))
    );

    let october = list_transactions(&mut conn, "2026-10").unwrap();
    assert_eq!(october.len(), 1);
    assert_eq!(
        october[0].occurred_at,
        ninth - 86_400,
        "stored under the 8th, the day the user paid"
    );
    assert!(list(&mut conn).unwrap().is_empty());
    // It cannot be confirmed twice.
    assert!(
        confirm(
            &mut conn,
            &ConfirmInput {
                id,
                expense_category_id: None,
                income_source_id: None
            }
        )
        .is_err()
    );
    assert_eq!(list_transactions(&mut conn, "2026-10").unwrap().len(), 1);
}

#[test]
fn the_suggested_category_is_used_unless_the_user_picks_another() {
    let mut conn = establish_connection_test().unwrap();
    let coffee = category(&mut conn, "Coffee");
    add_transaction(
        &mut conn,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "3".into(),
            currency: "INR".into(),
            description: "Starbucks".into(),
            date: "2026-09-01".into(),
            expense_category_id: Some(coffee),
            income_source_id: None,
        },
    )
    .unwrap();
    let id = id_of(capture(&mut conn, &starbucks(1_791_000_000)).unwrap());
    let t = confirm(
        &mut conn,
        &ConfirmInput {
            id,
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();
    assert_eq!(t.expense_category_id, Some(coffee));
}

#[test]
fn income_is_confirmed_as_income_and_a_missing_currency_uses_the_users_own() {
    let mut conn = establish_connection_test().unwrap();
    service::settings::update_settings(
        &mut conn,
        &UpdateSettingsInput {
            currency: Some("CAD".into()),
            display_name: None,
            monthly_income: None,
            income_source_id: None,
            warning_threshold_percent: None,
            theme: None,
            avatar: None,
            backup_folder: None,
        },
    )
    .unwrap();
    let id = id_of(
        capture(
            &mut conn,
            &input(
                "com.venmo",
                "Venmo",
                "Sam paid you $8.50",
                1_791_000_000,
                "2026-10-08",
            ),
        )
        .unwrap(),
    );
    let t = confirm(
        &mut conn,
        &ConfirmInput {
            id,
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();
    assert_eq!(
        (
            t.transaction_type.as_str(),
            t.amount_cents,
            t.currency.as_str()
        ),
        ("income", 850, "CAD")
    );
    assert_eq!(t.description, "Venmo received");
}

#[test]
fn a_payment_that_matches_one_already_entered_is_flagged_not_dropped() {
    let mut conn = establish_connection_test().unwrap();
    add_transaction(
        &mut conn,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "250".into(),
            currency: "INR".into(),
            description: "Coffee (typed by hand)".into(),
            date: "2026-10-08".into(),
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();
    capture(&mut conn, &starbucks(1_791_000_000)).unwrap();
    assert!(list(&mut conn).unwrap()[0].possible_duplicate);
}

#[test]
fn dismissing_erases_the_text_but_a_repost_is_not_captured_again() {
    let mut conn = establish_connection_test().unwrap();
    let id = id_of(capture(&mut conn, &starbucks(1_791_000_000)).unwrap());
    dismiss(&mut conn, &DismissInput { id }).unwrap();
    assert!(list(&mut conn).unwrap().is_empty());
    let stored: String = cp::table
        .filter(cp::id.eq(id))
        .select(cp::excerpt)
        .first(&mut conn)
        .unwrap();
    assert_eq!(stored, "", "the notification text is not kept");
    assert_eq!(
        capture(&mut conn, &starbucks(1_791_000_060))
            .unwrap()
            .status,
        "duplicate"
    );
    assert!(dismiss(&mut conn, &DismissInput { id }).is_err());
}

#[test]
fn confirming_also_erases_the_text() {
    let mut conn = establish_connection_test().unwrap();
    let id = id_of(capture(&mut conn, &starbucks(1_791_000_000)).unwrap());
    confirm(
        &mut conn,
        &ConfirmInput {
            id,
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();
    let stored: String = cp::table
        .filter(cp::id.eq(id))
        .select(cp::excerpt)
        .first(&mut conn)
        .unwrap();
    assert_eq!(stored, "");
}

#[test]
fn a_long_notification_is_cut_short_and_bad_input_is_rejected() {
    let mut conn = establish_connection_test().unwrap();
    let long = format!("Paid ₹250 to Starbucks {}", "x".repeat(2_000));
    let id = id_of(
        capture(
            &mut conn,
            &input(PHONEPE, "Paid", &long, 1_791_000_000, "2026-10-08"),
        )
        .unwrap(),
    );
    let stored: String = cp::table
        .filter(cp::id.eq(id))
        .select(cp::excerpt)
        .first(&mut conn)
        .unwrap();
    assert!(stored.chars().count() <= 300);
    assert!(
        capture(
            &mut conn,
            &input(PHONEPE, "Paid ₹250 to Starbucks", "", 1, "yesterday")
        )
        .is_err()
    );
}

#[test]
fn deleting_all_data_empties_the_inbox() {
    let mut conn = establish_connection_test().unwrap();
    capture(&mut conn, &starbucks(1_791_000_000)).unwrap();
    service::data::delete_all_data(
        &mut conn,
        &service::data::DeleteAllInput {
            confirm: "DELETE".into(),
        },
    )
    .unwrap();
    assert!(list(&mut conn).unwrap().is_empty());
    let total: i64 = cp::table.count().get_result(&mut conn).unwrap();
    assert_eq!(total, 0);
}

#[test]
fn the_api_round_trips_and_rejects_unknown_fields() {
    let mut conn = establish_connection_test().unwrap();
    let call = |conn: &mut SqliteConnection,
                method: &str,
                payload: serde_json::Value|
     -> serde_json::Value {
        serde_json::from_str(&crate::api::dispatch(conn, method, &payload.to_string())).unwrap()
    };
    let made = call(
        &mut conn,
        "captureNotification",
        serde_json::json!({
            "package": PHONEPE, "title": "Paid ₹250 to Starbucks", "text": "", "posted_at": 1_791_000_000, "local_date": "2026-10-08"
        }),
    );
    assert_eq!(made["data"]["status"], "captured");
    let inbox = call(&mut conn, "listCaptured", serde_json::json!({}));
    let id = inbox["data"][0]["id"].clone();
    let typo = call(
        &mut conn,
        "captureNotification",
        serde_json::json!({
            "package": PHONEPE, "posted_at": 1, "local_date": "2026-10-08", "bodyy": "x"
        }),
    );
    assert_eq!(typo["error"]["kind"], "invalid_request");
    let confirmed = call(
        &mut conn,
        "confirmCaptured",
        serde_json::json!({ "id": id }),
    );
    assert_eq!(confirmed["data"]["amount_cents"], 25_000);
    assert_eq!(
        call(
            &mut conn,
            "dismissCaptured",
            serde_json::json!({ "id": id })
        )["error"]["kind"],
        "not_found"
    );
}
