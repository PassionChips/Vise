use crate::db::schema::budget_months;
use diesel::OptionalExtension;
use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;

use crate::models::budget_month::{BudgetMonth, NewBudgetMonth, UpdateBudgetMonth};

pub fn insert(
    connection: &mut SqliteConnection,
    source: &NewBudgetMonth,
) -> QueryResult<BudgetMonth> {
    diesel::insert_into(budget_months::table)
        .values(source)
        .returning(BudgetMonth::as_returning())
        .get_result(connection)
}

pub fn get_all(connection: &mut SqliteConnection) -> QueryResult<Vec<BudgetMonth>> {
    budget_months::table
        .select(BudgetMonth::as_select())
        .order(budget_months::id.asc())
        .load(connection)
}

pub fn get_id(
    connection: &mut SqliteConnection,
    source_id: i32,
) -> QueryResult<Option<BudgetMonth>> {
    budget_months::table
        .filter(budget_months::id.eq(source_id))
        .select(BudgetMonth::as_select())
        .first(connection)
        .optional()
}

pub fn update(
    connection: &mut SqliteConnection,
    source_id: i32,
    changes: &UpdateBudgetMonth,
) -> QueryResult<Option<BudgetMonth>> {
    diesel::update(budget_months::table.filter(budget_months::id.eq(source_id)))
        .set((
            changes,
            budget_months::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(BudgetMonth::as_returning())
        .get_result(connection)
        .optional()
}

pub fn delete(connection: &mut SqliteConnection, source_id: i32) -> QueryResult<bool> {
    let affected_rows =
        diesel::delete(budget_months::table.filter(budget_months::id.eq(source_id)))
            .execute(connection)?;
    Ok(affected_rows > 0)
}

#[cfg(test)]
mod tests {
    use std::assert_eq;

    use super::*;
    use crate::db::connection::establish_connection_test;
    pub const SPENDING_LIMIT_CENTS: i64 = 1000;
    pub const SAVINGS_TARGET_CENTS: i64 = 200;
    pub fn sample_budget_month(
        month: String,
        currency: String,
        spending_limit_cents: Option<i64>,
        savings_target_cents: Option<i64>,
    ) -> NewBudgetMonth {
        NewBudgetMonth {
            month,
            currency,
            spending_limit_cents,
            savings_target_cents,
        }
    }

    #[test]
    pub fn budget_month_insert_test() {
        let mut connection = establish_connection_test().unwrap();
        let source = sample_budget_month(
            "2026-09".to_string(),
            "EUR".to_string(),
            Some(SPENDING_LIMIT_CENTS),
            Some(SAVINGS_TARGET_CENTS),
        );
        let result = insert(&mut connection, &source).unwrap();

        assert!(result.id.unwrap() > 0);
        assert_eq!(result.month, "2026-09");
        assert_eq!(result.currency, "EUR");
        assert_eq!(result.spending_limit_cents.unwrap(), SPENDING_LIMIT_CENTS);
        assert_eq!(result.savings_target_cents.unwrap(), SAVINGS_TARGET_CENTS);
    }

    #[test]
    pub fn budget_month_get_all_test() {
        let mut connection = establish_connection_test().unwrap();

        let source_a = sample_budget_month(
            "2026-01".to_string(),
            "USD".to_string(),
            Some(500),
            Some(100),
        );
        let source_b = sample_budget_month(
            "2026-02".to_string(),
            "USD".to_string(),
            Some(600),
            Some(150),
        );
        insert(&mut connection, &source_a).unwrap();
        insert(&mut connection, &source_b).unwrap();

        let results = get_all(&mut connection).unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].month, "2026-01");
        assert_eq!(results[1].month, "2026-02");
    }

    #[test]
    pub fn budget_month_get_id_found_test() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_budget_month(
            "2026-03".to_string(),
            "GBP".to_string(),
            Some(SPENDING_LIMIT_CENTS),
            Some(SAVINGS_TARGET_CENTS),
        );
        let inserted = insert(&mut connection, &source).unwrap();
        let inserted_id = inserted.id.unwrap();

        let result = get_id(&mut connection, inserted_id).unwrap();

        assert!(result.is_some());
        let record = result.unwrap();
        assert_eq!(record.id.unwrap(), inserted_id);
        assert_eq!(record.month, "2026-03");
        assert_eq!(record.currency, "GBP");
    }

    #[test]
    pub fn budget_month_get_id_not_found_test() {
        let mut connection = establish_connection_test().unwrap();

        let result = get_id(&mut connection, 99999).unwrap();

        assert!(result.is_none());
    }

    #[test]
    pub fn budget_month_update_test() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_budget_month(
            "2026-04".to_string(),
            "EUR".to_string(),
            Some(SPENDING_LIMIT_CENTS),
            Some(SAVINGS_TARGET_CENTS),
        );
        let inserted = insert(&mut connection, &source).unwrap();
        let inserted_id = inserted.id.unwrap();

        let changes = UpdateBudgetMonth {
            month: Some("2026-05".to_string()),
            currency: Some("USD".to_string()),
            spending_limit_cents: Some(Some(2000)),
            savings_target_cents: Some(None),
        };

        let result = update(&mut connection, inserted_id, &changes).unwrap();

        assert!(result.is_some());
        let updated = result.unwrap();
        assert_eq!(updated.month, "2026-05");
        assert_eq!(updated.currency, "USD");
        assert_eq!(updated.spending_limit_cents.unwrap(), 2000);
        assert!(updated.savings_target_cents.is_none());
    }

    #[test]
    pub fn budget_month_update_not_found_test() {
        let mut connection = establish_connection_test().unwrap();

        let changes = UpdateBudgetMonth {
            month: Some("2026-06".to_string()),
            ..Default::default()
        };

        let result = update(&mut connection, 99999, &changes).unwrap();

        assert!(result.is_none());
    }

    #[test]
    pub fn budget_month_delete_test() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_budget_month("2026-07".to_string(), "EUR".to_string(), None, None);
        let inserted = insert(&mut connection, &source).unwrap();
        let inserted_id = inserted.id.unwrap();

        let deleted = delete(&mut connection, inserted_id).unwrap();
        assert!(deleted);

        let result = get_id(&mut connection, inserted_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    pub fn budget_month_delete_not_found_test() {
        let mut connection = establish_connection_test().unwrap();

        let deleted = delete(&mut connection, 99999).unwrap();

        assert!(!deleted);
    }
}
