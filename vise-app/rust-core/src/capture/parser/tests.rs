//! The wordings below are written from how these apps' notifications are generally worded, NOT copied from real
//! captures. They are a starting point: replace or add a case with real text whenever a notification is
//! misread. Keeping one real example per app and per shape here is how the parser stays honest.

use super::*;

fn pay(app: PaymentApp, title: &str, body: &str) -> Parsed {
    match parse(app, title, body) {
        Outcome::Payment(p) => p,
        other => panic!("expected a payment from {title:?} / {body:?}, got {other:?}"),
    }
}

fn is(outcome: Outcome, title: &str, body: &str, app: PaymentApp) {
    assert_eq!(parse(app, title, body), outcome, "{title:?} / {body:?}");
}

fn rupee(p: &Parsed) -> (Direction, i64, Option<&str>) {
    (p.direction, p.amount_cents, p.currency.as_deref())
}

// ----- India: UPI apps -----

#[test]
fn a_phonepe_payment_to_a_shop() {
    let p = pay(
        PaymentApp::PhonePe,
        "Paid ₹250 to Starbucks",
        "Payment successful. UPI Ref No 412345678901",
    );
    assert_eq!(rupee(&p), (Direction::Expense, 25_000, Some("INR")));
    assert_eq!(p.merchant.as_deref(), Some("Starbucks"));
    assert_eq!(p.reference.as_deref(), Some("412345678901"));
}

#[test]
fn a_phonepe_or_gpay_payment_to_a_person() {
    let p = pay(
        PaymentApp::GooglePay,
        "You paid ₹1,250.50",
        "to Rahul Sharma using HDFC Bank 1234",
    );
    assert_eq!(rupee(&p), (Direction::Expense, 125_050, Some("INR")));
    assert_eq!(p.merchant.as_deref(), Some("Rahul Sharma"));
}

#[test]
fn money_received_names_who_sent_it() {
    let p = pay(
        PaymentApp::PhonePe,
        "Money received",
        "₹500 received from Priya Nair. UPI Ref 998877665544",
    );
    assert_eq!(rupee(&p), (Direction::Income, 50_000, Some("INR")));
    assert_eq!(p.merchant.as_deref(), Some("Priya Nair"));
    assert_eq!(p.reference.as_deref(), Some("998877665544"));
}

#[test]
fn someone_paying_you_is_income_not_an_expense() {
    for text in ["Amit paid you ₹300", "Amit sent you ₹300"] {
        let p = pay(PaymentApp::GooglePay, "Google Pay", text);
        assert_eq!(p.direction, Direction::Income, "{text}");
        assert_eq!(p.amount_cents, 30_000, "{text}");
    }
}

#[test]
fn rs_and_inr_spellings_and_a_virtual_payment_address() {
    for body in [
        "Paid Rs. 99 to Zomato",
        "Paid Rs 99.00 to Zomato",
        "Paid INR 99 to Zomato",
        "Paid 99 INR to Zomato",
    ] {
        let p = pay(PaymentApp::Paytm, "Paytm", body);
        assert_eq!(
            rupee(&p),
            (Direction::Expense, 9_900, Some("INR")),
            "{body}"
        );
        assert_eq!(p.merchant.as_deref(), Some("Zomato"), "{body}");
    }
    let vpa = pay(
        PaymentApp::PhonePe,
        "Sent ₹40",
        "to ramesh@okicici successfully",
    );
    assert_eq!(vpa.merchant.as_deref(), Some("ramesh@okicici"));
}

#[test]
fn indian_digit_grouping() {
    let p = pay(PaymentApp::PhonePe, "Paid ₹1,00,000 to Landlord", "");
    assert_eq!(p.amount_cents, 10_000_000);
}

// ----- Revolut and card apps -----

#[test]
fn revolut_card_payment_with_the_merchant_as_the_title() {
    let p = pay(
        PaymentApp::Revolut,
        "Starbucks",
        "You paid €4.50 • Card payment",
    );
    assert_eq!(rupee(&p), (Direction::Expense, 450, Some("EUR")));
    assert_eq!(p.merchant.as_deref(), Some("Starbucks"));
}

#[test]
fn revolut_spend_at_a_merchant_and_a_transfer_in() {
    let spend = pay(
        PaymentApp::Revolut,
        "Card payment",
        "You spent £12.30 at Pret A Manger",
    );
    assert_eq!(rupee(&spend), (Direction::Expense, 1_230, Some("GBP")));
    assert_eq!(spend.merchant.as_deref(), Some("Pret A Manger"));

    let received = pay(
        PaymentApp::Revolut,
        "Money received",
        "You received €100.00 from John Smith",
    );
    assert_eq!(rupee(&received), (Direction::Income, 10_000, Some("EUR")));
    assert_eq!(received.merchant.as_deref(), Some("John Smith"));
}

#[test]
fn a_european_amount_with_a_decimal_comma() {
    let p = pay(
        PaymentApp::Revolut,
        "REWE",
        "Du hast 47,83 € bezahlt. Paid 47,83 € at REWE",
    );
    assert_eq!(p.amount_cents, 4_783);
}

#[test]
fn paypal_sent_received_and_a_merchant_payment() {
    let sent = pay(
        PaymentApp::PayPal,
        "PayPal",
        "You sent $25.00 USD to Jane Doe",
    );
    assert_eq!(rupee(&sent), (Direction::Expense, 2_500, Some("USD")));
    assert_eq!(sent.merchant.as_deref(), Some("Jane Doe"));

    // No code after the amount, so the dollar stays unnamed and the user's own currency fills it in.
    let received = pay(
        PaymentApp::PayPal,
        "PayPal",
        "You received $50.00 from Acme Ltd",
    );
    assert_eq!(rupee(&received), (Direction::Income, 5_000, None));

    let merchant = pay(
        PaymentApp::PayPal,
        "Payment to Spotify",
        "You paid $9.99 to Spotify AB",
    );
    assert_eq!(
        (merchant.direction, merchant.amount_cents),
        (Direction::Expense, 999)
    );
    assert_eq!(merchant.merchant.as_deref(), Some("Spotify AB"));
}

#[test]
fn a_bare_dollar_sign_leaves_the_currency_to_the_user() {
    let p = pay(
        PaymentApp::CashApp,
        "Cash App",
        "You paid $12.00 to $coffeeshop",
    );
    assert_eq!((p.amount_cents, p.currency), (1_200, None));
    let venmo = pay(PaymentApp::Venmo, "Venmo", "Sam paid you $8.50");
    assert_eq!(
        (venmo.direction, venmo.amount_cents),
        (Direction::Income, 850)
    );
}

// ----- What must not become a transaction -----

#[test]
fn requests_reminders_offers_and_failures_are_ignored() {
    for body in [
        "Rahul requested ₹500 from you",
        "Reminder: pay ₹799 electricity bill, due on 12 Oct",
        "Get up to ₹100 cashback on your next payment",
        "Payment of ₹250 to Starbucks failed",
        "Your payment of ₹250 was declined",
        "Your OTP for the payment of ₹250 is 123456",
        "Pending: ₹250 to Starbucks",
        "Your balance is ₹4,500",
    ] {
        is(Outcome::Ignored, "Google Pay", body, PaymentApp::GooglePay);
    }
}

#[test]
fn no_amount_means_it_is_not_a_payment() {
    is(
        Outcome::Ignored,
        "PhonePe",
        "Complete your KYC to continue",
        PaymentApp::PhonePe,
    );
    is(
        Outcome::Ignored,
        "Revolut",
        "Your card has been delivered",
        PaymentApp::Revolut,
    );
}

#[test]
fn a_balance_in_the_same_message_is_not_the_amount() {
    let p = pay(
        PaymentApp::PhonePe,
        "Paid ₹250 to Starbucks",
        "Available balance ₹4,500",
    );
    assert_eq!(p.amount_cents, 25_000);
    let first = pay(
        PaymentApp::Revolut,
        "Revolut",
        "Balance €1,200.00. You paid €15.00 at Lidl",
    );
    assert_eq!(first.amount_cents, 1_500);
}

#[test]
fn an_amount_without_a_clear_direction_is_left_for_the_user() {
    is(
        Outcome::Unclear,
        "PhonePe",
        "Transaction of ₹250 for order 8837",
        PaymentApp::PhonePe,
    );
}

// ----- Details -----

#[test]
fn references_are_taken_only_when_they_look_like_references() {
    let with = pay(PaymentApp::PhonePe, "Paid ₹10 to Shop", "UTR: 412345678901");
    assert_eq!(with.reference.as_deref(), Some("412345678901"));
    let without = pay(PaymentApp::PhonePe, "Paid ₹10 to Shop", "Ref today");
    assert_eq!(without.reference, None);
    let short = pay(PaymentApp::PhonePe, "Paid ₹10 to Shop", "Ref 123");
    assert_eq!(short.reference, None);
}

#[test]
fn merchant_names_stop_where_the_sentence_continues() {
    for (body, expected) in [
        ("Paid ₹10 to Big Bazaar using UPI", "Big Bazaar"),
        ("Paid ₹10 to Big Bazaar on 08 Oct", "Big Bazaar"),
        ("Paid ₹10 to Big Bazaar. Thank you", "Big Bazaar"),
        ("Paid ₹10 to Netflix.com successfully", "Netflix.com"),
    ] {
        let p = pay(PaymentApp::PhonePe, "PhonePe", body);
        assert_eq!(p.merchant.as_deref(), Some(expected), "{body}");
    }
}

#[test]
fn a_generic_title_is_never_used_as_the_merchant() {
    let p = pay(PaymentApp::Revolut, "Card payment", "You paid €4.50");
    assert_eq!(p.merchant, None);
}

#[test]
fn the_amount_must_be_positive_and_real() {
    is(
        Outcome::Ignored,
        "PhonePe",
        "Paid ₹0 to Shop",
        PaymentApp::PhonePe,
    );
    is(
        Outcome::Ignored,
        "PhonePe",
        "Paid to Shop",
        PaymentApp::PhonePe,
    );
}
