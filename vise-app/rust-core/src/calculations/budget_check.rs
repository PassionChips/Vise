//! Comparing what was spent in each category against its limit.

use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

use crate::models::expense_category::ExpenseCategory;

/// Label used for spending that has no category.
pub const UNCATEGORISED: &str = "Uncategorised";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BudgetStatus {
    /// No limit has been set, so there is nothing to compare against.
    NoLimit,
    /// Spent is at or below the limit.
    WithinLimit,
    /// Spent is above the limit.
    OverLimit,
}

/// One row of the per-category budget list.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CategoryStatus {
    /// `None` for the "Uncategorised" row.
    pub category_id: Option<i32>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub spent_cents: i64,
    pub limit_cents: Option<i64>,
    /// `limit - spent`; negative when over the limit.
    pub remaining_cents: Option<i64>,
    pub status: BudgetStatus,
}

/// Compares `spent_cents` with an optional limit.
pub fn compare_to_limit(spent_cents: i64, limit_cents: Option<i64>) -> (Option<i64>, BudgetStatus) {
    match limit_cents {
        None => (None, BudgetStatus::NoLimit),
        Some(limit) if spent_cents > limit => (Some(limit - spent_cents), BudgetStatus::OverLimit),
        Some(limit) => (Some(limit - spent_cents), BudgetStatus::WithinLimit),
    }
}

/// Builds one status row per relevant category.
///
/// A category is listed when it is active, or when it has spending or a
/// limit this month (so archived categories with history still show up).
/// Spending without a category is listed last as "Uncategorised".
pub fn check_categories(
    categories: &[ExpenseCategory],
    spent_by_category: &BTreeMap<Option<i32>, i64>,
    limits_by_category: &HashMap<i32, i64>,
) -> Vec<CategoryStatus> {
    let mut rows: Vec<CategoryStatus> = categories
        .iter()
        .filter_map(|category| {
            let id = category.id?;
            let spent = spent_by_category.get(&Some(id)).copied().unwrap_or(0);
            let limit = limits_by_category.get(&id).copied();
            if !category.is_active && spent == 0 && limit.is_none() {
                return None;
            }
            let (remaining, status) = compare_to_limit(spent, limit);
            Some(CategoryStatus {
                category_id: Some(id),
                name: category.name.clone(),
                icon: category.icon.clone(),
                color: category.color.clone(),
                spent_cents: spent,
                limit_cents: limit,
                remaining_cents: remaining,
                status,
            })
        })
        .collect();

    if let Some(&spent) = spent_by_category.get(&None).filter(|&&spent| spent != 0) {
        rows.push(CategoryStatus {
            category_id: None,
            name: UNCATEGORISED.to_string(),
            icon: None,
            color: None,
            spent_cents: spent,
            limit_cents: None,
            remaining_cents: None,
            status: BudgetStatus::NoLimit,
        });
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn category(id: i32, name: &str, is_active: bool) -> ExpenseCategory {
        ExpenseCategory {
            id: Some(id),
            name: name.to_string(),
            icon: None,
            color: None,
            is_default: false,
            is_active,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn compare_to_limit_handles_each_case() {
        assert_eq!(compare_to_limit(500, None), (None, BudgetStatus::NoLimit));
        assert_eq!(
            compare_to_limit(500, Some(1_000)),
            (Some(500), BudgetStatus::WithinLimit)
        );
        assert_eq!(
            compare_to_limit(1_000, Some(1_000)),
            (Some(0), BudgetStatus::WithinLimit)
        );
        assert_eq!(
            compare_to_limit(1_200, Some(1_000)),
            (Some(-200), BudgetStatus::OverLimit)
        );
    }

    #[test]
    fn flags_over_budget_categories() {
        let categories = vec![
            category(1, "Groceries", true),
            category(2, "Transport", true),
        ];
        let spent = BTreeMap::from([(Some(1), 45_000), (Some(2), 3_000)]);
        let limits = HashMap::from([(1, 40_000), (2, 10_000)]);

        let rows = check_categories(&categories, &spent, &limits);

        assert_eq!(rows[0].status, BudgetStatus::OverLimit);
        assert_eq!(rows[0].remaining_cents, Some(-5_000));
        assert_eq!(rows[1].status, BudgetStatus::WithinLimit);
        assert_eq!(rows[1].remaining_cents, Some(7_000));
    }

    #[test]
    fn hides_inactive_categories_without_activity_and_adds_uncategorised() {
        let categories = vec![
            category(1, "Active", true),
            category(2, "Archived, unused", false),
            category(3, "Archived, used", false),
        ];
        let spent = BTreeMap::from([(Some(3), 100), (None, 250)]);

        let rows = check_categories(&categories, &spent, &HashMap::new());

        let names: Vec<&str> = rows.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, vec!["Active", "Archived, used", UNCATEGORISED]);
        assert_eq!(rows[0].spent_cents, 0);
        assert_eq!(rows[2].spent_cents, 250);
    }
}
