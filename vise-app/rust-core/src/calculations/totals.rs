//! Turning a list of transactions into income and spending totals.
//!
//! Rules (one place, so every screen agrees):
//! - Only transactions in the requested currency are counted. There is no
//!   currency conversion.
//! - `exclude_from_totals` transactions are skipped.
//! - `reverted` and `failed` transactions are skipped; `completed` and
//!   `pending` count, because pending money is already committed.
//! - `income` adds to income, `expense` adds to spending, `refund` reduces
//!   spending (in its category), and `transfer` is ignored because it moves
//!   money between your own accounts.

use std::collections::BTreeMap;

use crate::models::transaction::Transaction;
use crate::month::YearMonth;

/// Totals for one set of transactions, in cents.
#[derive(Debug, Default, PartialEq)]
pub struct MonthTotals {
    pub income_cents: i64,
    pub spent_cents: i64,
    /// Net spending per expense category. `None` = uncategorised.
    pub spent_by_category: BTreeMap<Option<i32>, i64>,
}

pub fn counts_toward_totals(transaction: &Transaction, currency: &str) -> bool {
    transaction.currency == currency
        && !transaction.exclude_from_totals
        && matches!(transaction.status.as_str(), "completed" | "pending")
}

/// How a transaction changes spending: positive for expenses, negative for
/// refunds, zero for anything else.
fn spending_effect(transaction: &Transaction) -> i64 {
    match transaction.transaction_type.as_str() {
        "expense" => transaction.amount_cents,
        "refund" => -transaction.amount_cents,
        _ => 0,
    }
}

pub fn month_totals(transactions: &[Transaction], currency: &str) -> MonthTotals {
    let mut totals = MonthTotals::default();

    for transaction in transactions
        .iter()
        .filter(|t| counts_toward_totals(t, currency))
    {
        if transaction.transaction_type == "income" {
            totals.income_cents += transaction.amount_cents;
            continue;
        }

        let effect = spending_effect(transaction);
        if effect != 0 {
            totals.spent_cents += effect;
            *totals
                .spent_by_category
                .entry(transaction.expense_category_id)
                .or_insert(0) += effect;
        }
    }

    totals
}

/// Net spending per calendar month (UTC), for trend charts and predictions.
pub fn spending_by_month(transactions: &[Transaction], currency: &str) -> BTreeMap<YearMonth, i64> {
    let mut by_month = BTreeMap::new();
    for transaction in transactions
        .iter()
        .filter(|t| counts_toward_totals(t, currency))
    {
        if let Some(month) = YearMonth::from_timestamp(transaction.occurred_at) {
            *by_month.entry(month).or_insert(0) += spending_effect(transaction);
        }
    }
    by_month
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calculations::test_support::transaction;

    #[test]
    fn sums_income_and_spending_by_category() {
        let transactions = vec![
            transaction("income", 300_000, None),
            transaction("expense", 4_000, Some(1)),
            transaction("expense", 1_000, Some(1)),
            transaction("expense", 2_500, Some(2)),
            transaction("expense", 500, None),
        ];

        let totals = month_totals(&transactions, "EUR");

        assert_eq!(totals.income_cents, 300_000);
        assert_eq!(totals.spent_cents, 8_000);
        assert_eq!(totals.spent_by_category[&Some(1)], 5_000);
        assert_eq!(totals.spent_by_category[&Some(2)], 2_500);
        assert_eq!(totals.spent_by_category[&None], 500);
    }

    #[test]
    fn refunds_reduce_spending_and_transfers_are_ignored() {
        let transactions = vec![
            transaction("expense", 5_000, Some(1)),
            transaction("refund", 2_000, Some(1)),
            transaction("transfer", 10_000, None),
        ];

        let totals = month_totals(&transactions, "EUR");

        assert_eq!(totals.spent_cents, 3_000);
        assert_eq!(totals.spent_by_category[&Some(1)], 3_000);
        assert!(!totals.spent_by_category.contains_key(&None));
    }

    #[test]
    fn skips_excluded_failed_reverted_and_other_currencies() {
        let mut excluded = transaction("expense", 1_000, None);
        excluded.exclude_from_totals = true;
        let mut failed = transaction("expense", 1_000, None);
        failed.status = "failed".to_string();
        let mut reverted = transaction("expense", 1_000, None);
        reverted.status = "reverted".to_string();
        let mut dollars = transaction("expense", 1_000, None);
        dollars.currency = "USD".to_string();
        let mut pending = transaction("expense", 700, None);
        pending.status = "pending".to_string();

        let totals = month_totals(&[excluded, failed, reverted, dollars, pending], "EUR");

        assert_eq!(totals.spent_cents, 700);
    }

    #[test]
    fn empty_input_gives_zero_totals() {
        assert_eq!(month_totals(&[], "EUR"), MonthTotals::default());
    }

    #[test]
    fn groups_spending_by_calendar_month() {
        let september = YearMonth::parse("2026-09").unwrap();
        let mut first = transaction("expense", 1_000, None);
        first.occurred_at = september.start_timestamp();
        let mut last = transaction("expense", 500, None);
        last.occurred_at = september.end_timestamp() - 1;
        let mut october = transaction("expense", 200, None);
        october.occurred_at = september.end_timestamp();

        let by_month = spending_by_month(&[first, last, october], "EUR");

        assert_eq!(by_month[&september], 1_500);
        assert_eq!(by_month[&september.next()], 200);
    }
}
