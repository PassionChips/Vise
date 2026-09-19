use crate::db::schema::expense_categories;
use diesel::OptionalExtension;
use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;

use crate::models::expense_category::{ExpenseCategory, NewExpenseCategory, UpdateExpenseCategory};

pub fn insert(
    connection: &mut SqliteConnection,
    source: &NewExpenseCategory,
) -> QueryResult<ExpenseCategory> {
    diesel::insert_into(expense_categories::table)
        .values(source)
        .returning(ExpenseCategory::as_returning())
        .get_result(connection)
}

pub fn update(
    connection: &mut SqliteConnection,
    changes: &UpdateExpenseCategory,
    source_id: i32,
) -> QueryResult<Option<ExpenseCategory>> {
    diesel::update(expense_categories::table.filter(expense_categories::id.eq(source_id)))
        .set((
            changes,
            expense_categories::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(ExpenseCategory::as_returning())
        .get_result(connection)
        .optional()
}

pub fn delete(connection: &mut SqliteConnection, source_id: i32) -> QueryResult<bool> {
    let affected_rows =
        diesel::delete(expense_categories::table.filter(expense_categories::id.eq(source_id)))
            .execute(connection)?;

    Ok(affected_rows > 0)
}

pub fn get_all(connection: &mut SqliteConnection) -> QueryResult<Vec<ExpenseCategory>> {
    expense_categories::table
        .select(ExpenseCategory::as_select())
        .order(expense_categories::id.asc())
        .load(connection)
}

pub fn get_by_id(
    connection: &mut SqliteConnection,
    source_id: i32,
) -> QueryResult<Option<ExpenseCategory>> {
    expense_categories::table
        .filter(expense_categories::id.eq(source_id))
        .first(connection)
        .optional()
}

#[cfg(test)]
mod tests {
    use std::assert_eq;

    use super::*;
    use crate::db::connection::establish_connection_test;

    fn sample_expense_category(name: String) -> NewExpenseCategory {
        NewExpenseCategory {
            name,
            icon: Some("🏠".to_string()),
            color: Some("#FF5733".to_string()),
            is_default: false,
            is_active: true,
        }
    }

    #[test]
    fn insert_creates_expense_category() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_expense_category("Groceries".to_string());
        let created = insert(&mut connection, &source).unwrap();

        assert!(created.id.unwrap() > 0);
        assert_eq!(created.name, "Groceries");
        assert_eq!(created.icon.as_deref(), Some("🏠"));
        assert_eq!(created.color.as_deref(), Some("#FF5733"));
        assert!(!created.is_default);
        assert!(created.is_active);
        assert!(created.created_at > 0);
        assert!(created.updated_at > 0);
    }

    #[test]
    fn get_all_returns_all_expense_categories() {
        let mut connection = establish_connection_test().unwrap();

        insert(
            &mut connection,
            &sample_expense_category("Groceries".to_string()),
        )
        .unwrap();
        insert(
            &mut connection,
            &sample_expense_category("Transport".to_string()),
        )
        .unwrap();

        let categories = get_all(&mut connection).unwrap();

        assert_eq!(categories.len(), 2);
        assert_eq!(categories[0].name, "Groceries");
        assert_eq!(categories[1].name, "Transport");
    }

    #[test]
    fn get_by_id_returns_matching_expense_category() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(
            &mut connection,
            &sample_expense_category("Groceries".to_string()),
        )
        .unwrap();

        let found = get_by_id(&mut connection, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(found.id, created.id);
        assert_eq!(found.name, "Groceries");
    }

    #[test]
    fn get_by_id_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let found = get_by_id(&mut connection, 99999).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn update_changes_expense_category_fields() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(
            &mut connection,
            &sample_expense_category("Groceries".to_string()),
        )
        .unwrap();

        let changes = UpdateExpenseCategory {
            name: Some("Food & Drink".to_string()),
            icon: Some(Some("🍔".to_string())),
            color: Some(Some("#00AA00".to_string())),
            is_default: Some(true),
            is_active: Some(false),
        };

        let updated = update(&mut connection, &changes, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "Food & Drink");
        assert_eq!(updated.icon.as_deref(), Some("🍔"));
        assert_eq!(updated.color.as_deref(), Some("#00AA00"));
        assert!(updated.is_default);
        assert!(!updated.is_active);
    }

    #[test]
    fn update_can_clear_optional_fields_to_null() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(
            &mut connection,
            &sample_expense_category("Groceries".to_string()),
        )
        .unwrap();

        let changes = UpdateExpenseCategory {
            icon: Some(None),
            color: Some(None),
            ..Default::default()
        };

        let updated = update(&mut connection, &changes, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert!(updated.icon.is_none());
        assert!(updated.color.is_none());
    }

    #[test]
    fn update_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let changes = UpdateExpenseCategory {
            name: Some("Ghost".to_string()),
            ..Default::default()
        };

        let result = update(&mut connection, &changes, 99999).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn delete_removes_expense_category() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(
            &mut connection,
            &sample_expense_category("Groceries".to_string()),
        )
        .unwrap();

        let deleted = delete(&mut connection, created.id.unwrap()).unwrap();
        assert!(deleted);

        let found = get_by_id(&mut connection, created.id.unwrap()).unwrap();
        assert_eq!(found, None);
    }

    #[test]
    fn delete_returns_false_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let deleted = delete(&mut connection, 99999).unwrap();

        assert!(!deleted);
    }
}
