use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::result::QueryResult;
use diesel::sql_types::BigInt;
use diesel::sqlite::SqliteConnection;

use crate::db::schema::app_settings;
use crate::models::app_settings::{AppSettings, UpdateAppSettings};

/// The settings row. The migration creates it, so it always exists.
pub fn get(connection: &mut SqliteConnection) -> QueryResult<AppSettings> {
    app_settings::table
        .filter(app_settings::id.eq(1))
        .select(AppSettings::as_select())
        .first(connection)
}

pub fn update(
    connection: &mut SqliteConnection,
    changes: &UpdateAppSettings,
) -> QueryResult<AppSettings> {
    diesel::update(app_settings::table.filter(app_settings::id.eq(1)))
        .set((
            changes,
            app_settings::updated_at.eq(sql::<BigInt>("unixepoch()")),
        ))
        .returning(AppSettings::as_returning())
        .get_result(connection)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;

    #[test]
    fn migration_creates_default_row() {
        let mut connection = establish_connection_test().unwrap();
        let settings = get(&mut connection).unwrap();
        assert_eq!(settings.currency, "EUR");
        assert_eq!(settings.warning_threshold_percent, 80);
        assert_eq!(settings.onboarding_completed_at, None);
    }

    #[test]
    fn update_changes_and_clears_values() {
        let mut connection = establish_connection_test().unwrap();
        let changes = UpdateAppSettings {
            currency: Some("USD".to_string()),
            monthly_income_cents: Some(Some(250_000)),
            ..Default::default()
        };
        let updated = update(&mut connection, &changes).unwrap();
        assert_eq!(updated.currency, "USD");
        assert_eq!(updated.monthly_income_cents, Some(250_000));

        let cleared = update(
            &mut connection,
            &UpdateAppSettings {
                monthly_income_cents: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(cleared.monthly_income_cents, None);
        assert_eq!(cleared.currency, "USD");
    }

    #[test]
    fn second_settings_row_is_rejected() {
        use diesel::connection::SimpleConnection;
        let mut connection = establish_connection_test().unwrap();
        assert!(
            connection
                .batch_execute("INSERT INTO app_settings (id) VALUES (2)")
                .is_err()
        );
    }
}
