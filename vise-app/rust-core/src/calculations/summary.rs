//! The headline numbers for one month: income, spending, what's left.

use serde::Serialize;

use super::budget_check::{BudgetStatus, CategoryStatus, compare_to_limit};
use super::totals::MonthTotals;
use crate::models::budget_month::BudgetMonth;
use crate::month::YearMonth;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MonthlySummary {
    pub month: String,
    pub currency: String,
    pub income_cents: i64,
    pub spent_cents: i64,
    /// `income - spent`. Negative means you spent more than you earned.
    pub net_cents: i64,
    pub spending_limit_cents: Option<i64>,
    /// `spending_limit - spent`, if a limit is set.
    pub remaining_cents: Option<i64>,
    pub savings_target_cents: Option<i64>,
    /// Whether `net_cents` reaches the savings target, if one is set.
    pub savings_target_met: Option<bool>,
    pub status: BudgetStatus,
    pub categories: Vec<CategoryStatus>,
}

pub fn build_summary(
    month: YearMonth,
    currency: &str,
    totals: &MonthTotals,
    budget: Option<&BudgetMonth>,
    categories: Vec<CategoryStatus>,
) -> MonthlySummary {
    let spending_limit = budget.and_then(|b| b.spending_limit_cents);
    let savings_target = budget.and_then(|b| b.savings_target_cents);
    let net = totals.income_cents - totals.spent_cents;
    let (remaining, status) = compare_to_limit(totals.spent_cents, spending_limit);

    MonthlySummary {
        month: month.to_string(),
        currency: currency.to_string(),
        income_cents: totals.income_cents,
        spent_cents: totals.spent_cents,
        net_cents: net,
        spending_limit_cents: spending_limit,
        remaining_cents: remaining,
        savings_target_cents: savings_target,
        savings_target_met: savings_target.map(|target| net >= target),
        status,
        categories,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget(limit: Option<i64>, savings: Option<i64>) -> BudgetMonth {
        BudgetMonth {
            id: Some(1),
            month: "2026-09".to_string(),
            currency: "EUR".to_string(),
            spending_limit_cents: limit,
            savings_target_cents: savings,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn totals(income: i64, spent: i64) -> MonthTotals {
        MonthTotals {
            income_cents: income,
            spent_cents: spent,
            ..Default::default()
        }
    }

    #[test]
    fn computes_net_remaining_and_savings() {
        let month = YearMonth::parse("2026-09").unwrap();
        let budget = budget(Some(200_000), Some(50_000));

        let summary = build_summary(
            month,
            "EUR",
            &totals(320_000, 180_000),
            Some(&budget),
            vec![],
        );

        assert_eq!(summary.net_cents, 140_000);
        assert_eq!(summary.remaining_cents, Some(20_000));
        assert_eq!(summary.status, BudgetStatus::WithinLimit);
        assert_eq!(summary.savings_target_met, Some(true));
    }

    #[test]
    fn flags_overspending() {
        let month = YearMonth::parse("2026-09").unwrap();
        let budget = budget(Some(100_000), Some(50_000));

        let summary = build_summary(
            month,
            "EUR",
            &totals(120_000, 110_000),
            Some(&budget),
            vec![],
        );

        assert_eq!(summary.remaining_cents, Some(-10_000));
        assert_eq!(summary.status, BudgetStatus::OverLimit);
        assert_eq!(summary.savings_target_met, Some(false));
    }

    #[test]
    fn works_without_a_budget() {
        let month = YearMonth::parse("2026-09").unwrap();

        let summary = build_summary(month, "EUR", &totals(0, 0), None, vec![]);

        assert_eq!(summary.status, BudgetStatus::NoLimit);
        assert_eq!(summary.remaining_cents, None);
        assert_eq!(summary.savings_target_met, None);
    }
}
