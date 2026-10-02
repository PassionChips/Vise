//! Data for the report charts: category share and month-by-month trend.

use serde::Serialize;
use std::collections::BTreeMap;

use super::budget_check::CategoryStatus;
use crate::month::YearMonth;

/// One slice of the "where did the money go" chart.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CategoryBreakdown {
    pub category_id: Option<i32>,
    pub name: String,
    pub color: Option<String>,
    pub spent_cents: i64,
    /// Share of the month's spending, 0-100, rounded to one decimal.
    pub percentage: f64,
}

/// One bar of the monthly trend chart.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MonthSpending {
    pub month: String,
    pub spent_cents: i64,
}

/// Converts category statuses into chart slices, largest first.
/// Categories with no (or net-negative) spending are left out because
/// they cannot be drawn as a slice.
pub fn category_breakdown(categories: &[CategoryStatus]) -> Vec<CategoryBreakdown> {
    let positive: Vec<&CategoryStatus> = categories.iter().filter(|c| c.spent_cents > 0).collect();
    let total: i64 = positive.iter().map(|c| c.spent_cents).sum();

    let mut slices: Vec<CategoryBreakdown> = positive
        .into_iter()
        .map(|c| CategoryBreakdown {
            category_id: c.category_id,
            name: c.name.clone(),
            color: c.color.clone(),
            spent_cents: c.spent_cents,
            percentage: (c.spent_cents as f64 * 1000.0 / total as f64).round() / 10.0,
        })
        .collect();

    slices.sort_by(|a, b| {
        b.spent_cents
            .cmp(&a.spent_cents)
            .then_with(|| a.name.cmp(&b.name))
    });
    slices
}

/// Spending for every month from `first` to `last` inclusive, with months
/// that have no data filled in as zero so the chart has no gaps.
pub fn spending_trend(
    spending_by_month: &BTreeMap<YearMonth, i64>,
    first: YearMonth,
    last: YearMonth,
) -> Vec<MonthSpending> {
    let mut trend = Vec::new();
    let mut month = first;
    while month <= last {
        trend.push(MonthSpending {
            month: month.to_string(),
            spent_cents: spending_by_month.get(&month).copied().unwrap_or(0),
        });
        month = month.next();
    }
    trend
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calculations::budget_check::BudgetStatus;

    fn status(name: &str, spent: i64) -> CategoryStatus {
        CategoryStatus {
            category_id: None,
            name: name.to_string(),
            icon: None,
            color: None,
            spent_cents: spent,
            limit_cents: None,
            remaining_cents: None,
            status: BudgetStatus::NoLimit,
        }
    }

    #[test]
    fn percentages_are_sorted_and_sum_to_100() {
        let slices = category_breakdown(&[
            status("Food", 2_500),
            status("Rent", 7_500),
            status("Idle", 0),
        ]);

        assert_eq!(slices.len(), 2);
        assert_eq!(slices[0].name, "Rent");
        assert_eq!(slices[0].percentage, 75.0);
        assert_eq!(slices[1].percentage, 25.0);
    }

    #[test]
    fn rounds_percentages_to_one_decimal() {
        let slices = category_breakdown(&[status("A", 1), status("B", 2)]);
        assert_eq!(slices[0].percentage, 66.7);
        assert_eq!(slices[1].percentage, 33.3);
    }

    #[test]
    fn empty_month_gives_no_slices() {
        assert!(category_breakdown(&[]).is_empty());
    }

    #[test]
    fn trend_fills_missing_months_with_zero() {
        let july = YearMonth::parse("2026-07").unwrap();
        let september = YearMonth::parse("2026-09").unwrap();
        let data = BTreeMap::from([(july, 100), (september, 300)]);

        let trend = spending_trend(&data, july, september);

        let values: Vec<(&str, i64)> = trend
            .iter()
            .map(|m| (m.month.as_str(), m.spent_cents))
            .collect();
        assert_eq!(
            values,
            vec![("2026-07", 100), ("2026-08", 0), ("2026-09", 300)]
        );
    }
}
