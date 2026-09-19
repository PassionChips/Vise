use diesel::prelude::*;
use crate::db::schema::transactions;
use diesel::dsl::sql;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;
use diesel::OptionalExtension;

use crate::models::transaction::{
    Transaction,
    NewTransaction,
    UpdateTransaction
};

pub fn insert(connection:&mut SqliteConnection,source:&NewTransaction)->QueryResult<Transaction>{
    diesel::insert_into(transactions::table)
        .values(source)
        .returning(Transaction::as_returning())
        .get_result(connection)
}

pub fn update(connection:&mut SqliteConnection, changes:&UpdateTransaction,source_id:i32)->QueryResult<Option<Transaction>>{
    diesel::update(transactions::table.filter(transactions::id.eq(source_id)))
        .set((
            changes,
            transactions::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(Transaction::as_returning())
        .get_result(connection)
        .optional()
}

pub fn delete(connection:&mut SqliteConnection, source_id:i32)->QueryResult<bool>{
    let affected_rows = diesel::delete(transactions::table.filter(transactions::id.eq(source_id))).execute(connection)?;
    Ok(affected_rows > 0)
}

pub fn get_all(connection:&mut SqliteConnection)->QueryResult<Vec<Transaction>>{
    transactions::table
        .select(Transaction::as_select())
        .order(transactions::id.asc())
        .load(connection)
}

pub fn get_by_id(connection:&mut SqliteConnection, source_id:i32)->QueryResult<Option<Transaction>>{
    transactions::table
        .filter(transactions::id.eq(source_id))
        .first(connection)
        .optional()
}

#[cfg(test)]
mod tests {
    use std::assert_eq;

    use super::*;
    use crate::db::connection::establish_connection_test;

    fn sample_transaction(description: String) -> NewTransaction {
        NewTransaction {
            source_type: "manual".to_string(),
            transaction_type: "expense".to_string(),
            amount_cents: 5000,
            currency: "USD".to_string(),
            description,
            occurred_at: 1_700_000_000,
            income_source_id: None,
            expense_category_id: None,
            external_id: None,
            revolut_account_id: None,
            merchant_name: None,
            raw_description: None,
            revolut_category: None,
            status: "completed".to_string(),
            completed_at: None,
            exclude_from_totals: false,
        }
    }

    #[test]
    fn insert_creates_transaction() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_transaction("Coffee".to_string());
        let created = insert(&mut connection, &source).unwrap();

        assert!(created.id.unwrap() > 0);
        assert_eq!(created.source_type, "manual");
        assert_eq!(created.transaction_type, "expense");
        assert_eq!(created.amount_cents, 5000);
        assert_eq!(created.currency, "USD");
        assert_eq!(created.description, "Coffee");
        assert_eq!(created.occurred_at, 1_700_000_000);
        assert_eq!(created.status, "completed");
        assert!(!created.exclude_from_totals);
        assert!(created.created_at > 0);
        assert!(created.updated_at > 0);
    }

    #[test]
    fn get_all_returns_all_transactions() {
        let mut connection = establish_connection_test().unwrap();

        insert(&mut connection, &sample_transaction("Coffee".to_string())).unwrap();
        insert(&mut connection, &sample_transaction("Lunch".to_string())).unwrap();

        let transactions = get_all(&mut connection).unwrap();

        assert_eq!(transactions.len(), 2);
        assert_eq!(transactions[0].description, "Coffee");
        assert_eq!(transactions[1].description, "Lunch");
    }

    #[test]
    fn get_by_id_returns_matching_transaction() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_transaction("Coffee".to_string())).unwrap();

        let found = get_by_id(&mut connection, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(found.id, created.id);
        assert_eq!(found.description, "Coffee");
    }

    #[test]
    fn get_by_id_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let found = get_by_id(&mut connection, 99999).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn update_changes_transaction_fields() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_transaction("Coffee".to_string())).unwrap();

        let changes = UpdateTransaction {
            description: Some("Morning Coffee".to_string()),
            amount_cents: Some(7500),
            currency: Some("EUR".to_string()),
            status: Some("pending".to_string()),
            exclude_from_totals: Some(true),
            ..Default::default()
        };

        let updated = update(&mut connection, &changes, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.description, "Morning Coffee");
        assert_eq!(updated.amount_cents, 7500);
        assert_eq!(updated.currency, "EUR");
        assert_eq!(updated.status, "pending");
        assert!(updated.exclude_from_totals);
    }

    #[test]
    fn update_can_set_nullable_fields() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_transaction("Coffee".to_string())).unwrap();

        let changes = UpdateTransaction {
            merchant_name: Some(Some("Starbucks".to_string())),
            completed_at: Some(Some(1_700_001_000)),
            ..Default::default()
        };

        let updated = update(&mut connection, &changes, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(updated.merchant_name.as_deref(), Some("Starbucks"));
        assert_eq!(updated.completed_at, Some(1_700_001_000));
    }

    #[test]
    fn update_can_clear_nullable_fields_to_null() {
        let mut connection = establish_connection_test().unwrap();

        let mut source = sample_transaction("Coffee".to_string());
        source.merchant_name = Some("Starbucks".to_string());
        source.completed_at = Some(1_700_001_000);
        let created = insert(&mut connection, &source).unwrap();

        let changes = UpdateTransaction {
            merchant_name: Some(None),
            completed_at: Some(None),
            ..Default::default()
        };

        let updated = update(&mut connection, &changes, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert!(updated.merchant_name.is_none());
        assert!(updated.completed_at.is_none());
    }

    #[test]
    fn update_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let changes = UpdateTransaction {
            description: Some("Ghost".to_string()),
            ..Default::default()
        };

        let result = update(&mut connection, &changes, 99999).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn delete_removes_transaction() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_transaction("Coffee".to_string())).unwrap();

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
