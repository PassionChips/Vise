use crate::db::schema::income_sources;
use diesel::OptionalExtension;
use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;

use crate::models::income_source::{IncomeSource, NewIncomeSource, UpdateIncomeSource};

pub fn insert(
    connection: &mut SqliteConnection,
    source: &NewIncomeSource,
) -> QueryResult<IncomeSource> {
    diesel::insert_into(income_sources::table)
        .values(source)
        .returning(IncomeSource::as_returning())
        .get_result(connection)
}

pub fn get_all(connection: &mut SqliteConnection) -> QueryResult<Vec<IncomeSource>> {
    income_sources::table
        .select(IncomeSource::as_select())
        .order(income_sources::id.asc())
        .load(connection)
}

pub fn get_by_id(connection: &mut SqliteConnection, id: i32) -> QueryResult<Option<IncomeSource>> {
    income_sources::table
        .filter(income_sources::id.eq(id))
        .select(IncomeSource::as_select())
        .first(connection)
        .optional()
}

pub fn update(
    connection: &mut SqliteConnection,
    source_id: i32,
    changes: &UpdateIncomeSource,
) -> QueryResult<Option<IncomeSource>> {
    diesel::update(income_sources::table.filter(income_sources::id.eq(source_id)))
        .set((
            changes,
            income_sources::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(IncomeSource::as_returning())
        .get_result(connection)
        .optional()
}

pub fn delete(connection: &mut SqliteConnection, source_id: i32) -> QueryResult<bool> {
    let affected_rows =
        diesel::delete(income_sources::table.filter(income_sources::id.eq(source_id)))
            .execute(connection)?;

    Ok(affected_rows > 0)
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::db::connection::establish_connection_test;
    use std::assert_eq;

    fn sample_income_source(name: String) -> NewIncomeSource {
        NewIncomeSource {
            name,
            is_active: true,
        }
    }

    #[test]
    fn insert_create_income_source_test() {
        let mut connection = establish_connection_test().unwrap();

        let source = sample_income_source("Salary".to_string());

        let created = insert(&mut connection, &source).unwrap();

        assert!(created.id.unwrap() > 0);
        assert_eq!(created.name, "Salary");
        assert!(created.is_active);
        assert!(created.created_at > 0);
        assert!(created.updated_at > 0);
    }

    #[test]
    fn get_all_income_source_test() {
        let mut connection = establish_connection_test().unwrap();

        insert(&mut connection, &sample_income_source("Salary".to_string())).unwrap();

        insert(
            &mut connection,
            &sample_income_source("Freelance".to_string()),
        )
        .unwrap();

        let sources = get_all(&mut connection).unwrap();

        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0].name, "Salary");
        assert_eq!(sources[1].name, "Freelance");
    }

    #[test]
    fn get_by_id_returns_matching_income_source() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_income_source("Salary".to_string())).unwrap();

        let found = get_by_id(&mut connection, created.id.unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(found.id, created.id);
        assert_eq!(found.name, "Salary");
    }

    #[test]
    fn get_by_id_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let found = get_by_id(&mut connection, 999).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn update_changes_income_source() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_income_source("Salary".to_string())).unwrap();

        let changes = UpdateIncomeSource {
            name: Some("Monthly Salary".to_string()),
            is_active: Some(false),
        };

        let updated = update(&mut connection, created.id.unwrap(), &changes)
            .unwrap()
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "Monthly Salary");
        assert!(!updated.is_active);
    }

    #[test]
    fn update_returns_none_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let changes = UpdateIncomeSource {
            name: Some("Missing".to_string()),
            is_active: None,
        };

        let result = update(&mut connection, 999, &changes).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn delete_removes_income_source() {
        let mut connection = establish_connection_test().unwrap();

        let created = insert(&mut connection, &sample_income_source("Salary".to_string())).unwrap();

        let deleted = delete(&mut connection, created.id.unwrap()).unwrap();
        assert!(deleted);

        let found = get_by_id(&mut connection, created.id.unwrap()).unwrap();
        assert_eq!(found, None);
    }

    #[test]
    fn delete_returns_false_for_missing_id() {
        let mut connection = establish_connection_test().unwrap();

        let deleted = delete(&mut connection, 999).unwrap();

        assert!(!deleted);
    }
}
