//! The frontend's TypeScript types mirror rust-core's JSON. This test pins
//! the field names in `contracts/api-shapes.json`; `src/__tests__/contract.test.ts`
//! checks the same file against `src/services/types.ts`. A change to a reply's
//! shape therefore fails CI until the Rust side, the TypeScript types and the
//! contract file all agree.

use rust_core::api::dispatch;
use rust_core::db::connection::establish_connection_test;
use serde_json::{Value, json};

fn contract() -> Value {
    serde_json::from_str(include_str!("../contracts/api-shapes.json")).unwrap()
}

fn keys(value: &Value) -> Vec<String> {
    let mut keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    keys
}

fn expected(name: &str) -> Vec<String> {
    contract()[name]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k.as_str().unwrap().to_string())
        .collect()
}

fn call(connection: &mut diesel::sqlite::SqliteConnection, method: &str, payload: Value) -> Value {
    let reply: Value =
        serde_json::from_str(&dispatch(connection, method, &payload.to_string())).unwrap();
    assert_eq!(reply["ok"], true, "{method} failed: {reply}");
    reply["data"].clone()
}

#[test]
fn reply_shapes_match_the_contract() {
    let mut connection = establish_connection_test().unwrap();
    call(
        &mut connection,
        "completeOnboarding",
        json!({
            "currency": "EUR", "today": "2026-09-18", "monthly_income": "100",
            "budget_category": { "name": "Groceries" }, "monthly_limit": "50",
            "first_transaction": { "transaction_type": "expense", "amount": "5",
                "description": "x", "date": "2026-09-18", "category": { "name": "Groceries" } }
        }),
    );

    let settings = call(&mut connection, "getSettings", json!({}));
    assert_eq!(keys(&settings), expected("Settings"));

    let summary = call(
        &mut connection,
        "getMonthlySummary",
        json!({ "month": "2026-09", "currency": "EUR" }),
    );
    assert_eq!(keys(&summary), expected("MonthlySummary"));
    assert_eq!(keys(&summary["categories"][0]), expected("CategoryStatus"));

    let transactions = call(
        &mut connection,
        "listTransactions",
        json!({ "month": "2026-09" }),
    );
    assert_eq!(keys(&transactions[0]), expected("Transaction"));

    let overview = call(&mut connection, "getDataOverview", json!({}));
    assert_eq!(keys(&overview), expected("DataOverview"));

    let export = call(
        &mut connection,
        "exportDataCsv",
        json!({ "today": "2026-10-04" }),
    );
    assert_eq!(keys(&export), expected("CsvExport"));

    let deleted = call(
        &mut connection,
        "deleteAllData",
        json!({ "confirm": "DELETE" }),
    );
    assert_eq!(keys(&deleted), expected("DeletedCounts"));
}
