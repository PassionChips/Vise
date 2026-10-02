//! Integration tests against a real SQLite file (not `:memory:`): data
//! must survive closing and reopening the database, which is what happens
//! when the app is closed and restarted, and the settings migration must
//! not disturb data that already exists.

use diesel::RunQueryDsl;
use diesel::connection::SimpleConnection;
use diesel::sql_types::BigInt;
use diesel::{Connection, QueryableByName, sqlite::SqliteConnection};
use diesel_migrations::MigrationHarness;
use rust_core::api::dispatch;
use rust_core::db::connection::{MIGRATIONS, configure_connection, establish_connection};
use serde_json::{Value, json};

fn call(connection: &mut SqliteConnection, method: &str, payload: Value) -> Value {
    serde_json::from_str(&dispatch(connection, method, &payload.to_string())).unwrap()
}

#[derive(QueryableByName)]
struct Count {
    #[diesel(sql_type = BigInt)]
    n: i64,
}

#[test]
fn onboarding_and_entries_survive_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vise.db");

    {
        let mut connection = establish_connection(&path).unwrap();
        assert_eq!(
            call(&mut connection, "getSettings", json!({}))["data"]["onboarding_completed"],
            false
        );
        let reply = call(
            &mut connection,
            "completeOnboarding",
            json!({
                "currency": "GBP",
                "today": "2026-09-18",
                "display_name": "Aoife",
                "monthly_income": "3000",
                "income_source_name": "Salary",
                "budget_category": { "name": "Groceries", "icon": "shopping-cart" },
                "monthly_limit": "400",
                "first_transaction": {
                    "transaction_type": "expense", "amount": "12.50",
                    "description": "Milk", "date": "2026-09-18",
                    "category": { "name": "Groceries" }
                }
            }),
        );
        assert_eq!(reply["ok"], true, "{reply}");
        call(
            &mut connection,
            "addTransaction",
            json!({ "transaction_type": "income", "amount": "3000", "currency": "GBP",
                    "description": "Pay", "date": "2026-09-01", "income_source_id": 1 }),
        );
    } // connection dropped = app closed

    let mut connection = establish_connection(&path).unwrap();
    let settings = call(&mut connection, "getSettings", json!({}))["data"].clone();
    assert_eq!(settings["onboarding_completed"], true);
    assert_eq!(settings["currency"], "GBP");
    assert_eq!(settings["display_name"], "Aoife");
    assert_eq!(settings["monthly_income_cents"], 300_000);
    assert_eq!(settings["income_source_name"], "Salary");

    let summary = call(
        &mut connection,
        "getMonthlySummary",
        json!({ "month": "2026-09", "currency": "GBP" }),
    )["data"]
        .clone();
    assert_eq!(summary["income_cents"], 300_000);
    assert_eq!(summary["spent_cents"], 1_250);
    assert_eq!(summary["category_limits_total_cents"], 40_000);
    assert_eq!(summary["categories"][0]["name"], "Groceries");

    let transactions = call(
        &mut connection,
        "listTransactions",
        json!({ "month": "2026-09" }),
    );
    assert_eq!(transactions["data"].as_array().unwrap().len(), 2);
}

#[test]
fn reopening_does_not_reset_settings_or_rerun_onboarding() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vise.db");
    let onboarding = json!({ "currency": "EUR", "today": "2026-09-18", "monthly_income": "100" });

    let mut first = establish_connection(&path).unwrap();
    call(&mut first, "completeOnboarding", onboarding.clone());
    drop(first);

    for _ in 0..3 {
        let mut again = establish_connection(&path).unwrap();
        let settings = call(&mut again, "getSettings", json!({}))["data"].clone();
        assert_eq!(settings["monthly_income_cents"], 10_000);
        // Retrying with different answers must not overwrite what was saved.
        call(
            &mut again,
            "completeOnboarding",
            json!({ "currency": "USD", "today": "2026-09-18", "monthly_income": "999" }),
        );
        let after = call(&mut again, "getSettings", json!({}))["data"].clone();
        assert_eq!(after["monthly_income_cents"], 10_000);
        assert_eq!(after["currency"], "EUR");
    }
}

#[test]
fn settings_migration_keeps_existing_user_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vise.db");

    // A database as it was before the settings migration existed.
    let mut connection = SqliteConnection::establish(path.to_str().unwrap()).unwrap();
    configure_connection(&mut connection).unwrap();
    let total = migration_count();
    for _ in 0..total - 1 {
        connection.run_next_migration(MIGRATIONS).unwrap();
    }
    connection
        .batch_execute(
            "INSERT INTO income_sources (name) VALUES ('Old job');
             INSERT INTO expense_categories (name) VALUES ('Old category');
             INSERT INTO transactions (source_type, transaction_type, amount_cents, description, occurred_at, income_source_id)
               VALUES ('manual', 'income', 5000, 'Old pay', 1788000000, 1);",
        )
        .unwrap();
    drop(connection);

    let mut upgraded = establish_connection(&path).unwrap();
    let count = |connection: &mut SqliteConnection, table: &str| -> i64 {
        diesel::sql_query(format!("SELECT COUNT(*) AS n FROM {table}"))
            .get_result::<Count>(connection)
            .unwrap()
            .n
    };
    assert_eq!(count(&mut upgraded, "income_sources"), 1);
    assert_eq!(count(&mut upgraded, "expense_categories"), 1);
    assert_eq!(count(&mut upgraded, "transactions"), 1);
    assert_eq!(count(&mut upgraded, "app_settings"), 1);
    let settings = call(&mut upgraded, "getSettings", json!({}))["data"].clone();
    assert_eq!(settings["onboarding_completed"], false);
}

/// Number of embedded migrations.
fn migration_count() -> usize {
    use diesel::migration::MigrationSource;
    MigrationSource::<diesel::sqlite::Sqlite>::migrations(&MIGRATIONS)
        .unwrap()
        .len()
}
