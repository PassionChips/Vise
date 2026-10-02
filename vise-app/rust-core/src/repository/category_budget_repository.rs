use crate::db::schema::category_budgets;
use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;

use crate::models::category_budget::{CategoryBudget, NewCategoryBudget};

/// Inserts the limit, or replaces the existing limit for the same
/// (month, category) pair. The UNIQUE constraint makes this safe.
pub fn upsert(
    connection: &mut SqliteConnection,
    source: &NewCategoryBudget,
) -> QueryResult<CategoryBudget> {
    diesel::insert_into(category_budgets::table)
        .values(source)
        .on_conflict((
            category_budgets::budget_month_id,
            category_budgets::expense_category_id,
        ))
        .do_update()
        .set((
            category_budgets::limit_cents.eq(source.limit_cents),
            category_budgets::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(CategoryBudget::as_returning())
        .get_result(connection)
}

pub fn get_for_budget_month(
    connection: &mut SqliteConnection,
    budget_month_id: i32,
) -> QueryResult<Vec<CategoryBudget>> {
    category_budgets::table
        .filter(category_budgets::budget_month_id.eq(budget_month_id))
        .select(CategoryBudget::as_select())
        .order(category_budgets::id.asc())
        .load(connection)
}

/// Removes the limit for one category in one month. Returns false if there was none.
pub fn delete_for_category(
    connection: &mut SqliteConnection,
    budget_month_id: i32,
    expense_category_id: i32,
) -> QueryResult<bool> {
    let affected_rows = diesel::delete(
        category_budgets::table
            .filter(category_budgets::budget_month_id.eq(budget_month_id))
            .filter(category_budgets::expense_category_id.eq(expense_category_id)),
    )
    .execute(connection)?;
    Ok(affected_rows > 0)
}

pub fn delete(connection: &mut SqliteConnection, source_id: i32) -> QueryResult<bool> {
    let affected_rows =
        diesel::delete(category_budgets::table.filter(category_budgets::id.eq(source_id)))
            .execute(connection)?;
    Ok(affected_rows > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;
    use crate::models::budget_month::NewBudgetMonth;
    use crate::models::expense_category::NewExpenseCategory;
    use crate::repository::{budget_month_repository, expense_category_repository};

    /// Creates one budget month and one category, returning their ids.
    fn setup(connection: &mut SqliteConnection) -> (i32, i32) {
        let month = budget_month_repository::insert(
            connection,
            &NewBudgetMonth {
                month: "2026-09".to_string(),
                currency: "EUR".to_string(),
                spending_limit_cents: None,
                savings_target_cents: None,
            },
        )
        .unwrap();
        let category = expense_category_repository::insert(
            connection,
            &NewExpenseCategory {
                name: "Groceries".to_string(),
                icon: None,
                color: None,
                is_default: false,
                is_active: true,
            },
        )
        .unwrap();
        (month.id.unwrap(), category.id.unwrap())
    }

    #[test]
    fn upsert_inserts_then_replaces_limit() {
        let mut connection = establish_connection_test().unwrap();
        let (month_id, category_id) = setup(&mut connection);

        let first = upsert(
            &mut connection,
            &NewCategoryBudget {
                budget_month_id: month_id,
                expense_category_id: category_id,
                limit_cents: 30_000,
            },
        )
        .unwrap();
        let second = upsert(
            &mut connection,
            &NewCategoryBudget {
                budget_month_id: month_id,
                expense_category_id: category_id,
                limit_cents: 45_000,
            },
        )
        .unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(second.limit_cents, 45_000);
        assert_eq!(
            get_for_budget_month(&mut connection, month_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn negative_limit_is_rejected_by_database() {
        let mut connection = establish_connection_test().unwrap();
        let (month_id, category_id) = setup(&mut connection);

        let result = upsert(
            &mut connection,
            &NewCategoryBudget {
                budget_month_id: month_id,
                expense_category_id: category_id,
                limit_cents: -1,
            },
        );

        assert!(result.is_err());
    }

    #[test]
    fn deleting_category_cascades_to_its_limits() {
        let mut connection = establish_connection_test().unwrap();
        let (month_id, category_id) = setup(&mut connection);
        upsert(
            &mut connection,
            &NewCategoryBudget {
                budget_month_id: month_id,
                expense_category_id: category_id,
                limit_cents: 100,
            },
        )
        .unwrap();

        expense_category_repository::delete(&mut connection, category_id).unwrap();

        assert!(
            get_for_budget_month(&mut connection, month_id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn delete_returns_false_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();
        assert!(!delete(&mut connection, 99_999).unwrap());
    }
}
