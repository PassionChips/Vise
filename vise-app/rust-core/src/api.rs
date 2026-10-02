//! The JSON boundary between the app's frontend and Rust.
//!
//! The native bridge only has to forward two strings, a method name and a
//! JSON payload, to [`dispatch`] and hand the JSON reply back to
//! JavaScript. Keeping the bridge this thin means adding a feature only
//! touches Rust and the TypeScript service, never the Kotlin/Swift glue.
//!
//! Every reply has the same envelope:
//! - success: `{"ok": true, "data": ...}`
//! - failure: `{"ok": false, "error": {"kind": "...", "field": "...", "message": "..."}}`
//!
//! Method names and payloads are mirrored in `vise-app/src/services/viseCore.ts`.

use diesel::sqlite::SqliteConnection;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::error::{AppError, ErrorBody};
use crate::service;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdPayload {
    id: i32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MonthPayload {
    month: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MonthCurrencyPayload {
    month: String,
    currency: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrendPayload {
    month: String,
    currency: String,
    months: u32,
}

/// Runs one API call and returns the JSON reply. Never panics on bad
/// input; every failure becomes an `"ok": false` reply.
pub fn dispatch(connection: &mut SqliteConnection, method: &str, payload: &str) -> String {
    let reply = match handle(connection, method, payload) {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(error) => json!({ "ok": false, "error": ErrorBody::from(&error) }),
    };
    reply.to_string()
}

fn handle(
    connection: &mut SqliteConnection,
    method: &str,
    payload: &str,
) -> Result<Value, AppError> {
    match method {
        "addTransaction" => to_json(service::add_transaction(connection, &parse(payload)?)),
        "deleteTransaction" => {
            let IdPayload { id } = parse(payload)?;
            service::delete_transaction(connection, id)?;
            Ok(Value::Null)
        }
        "listTransactions" => {
            let MonthPayload { month } = parse(payload)?;
            to_json(service::list_transactions(connection, &month))
        }
        "listCategories" => to_json(service::list_categories(connection)),
        "addCategory" => to_json(service::add_category(connection, &parse(payload)?)),
        "listIncomeSources" => to_json(service::list_income_sources(connection)),
        "addIncomeSource" => to_json(service::add_income_source(connection, &parse(payload)?)),
        "setMonthBudget" => to_json(service::set_month_budget(connection, &parse(payload)?)),
        "setCategoryBudget" => to_json(service::set_category_budget(connection, &parse(payload)?)),
        "getMonthlySummary" => {
            let p: MonthCurrencyPayload = parse(payload)?;
            to_json(service::get_monthly_summary(
                connection,
                &p.month,
                &p.currency,
            ))
        }
        "getCategoryBreakdown" => {
            let p: MonthCurrencyPayload = parse(payload)?;
            to_json(service::get_category_breakdown(
                connection,
                &p.month,
                &p.currency,
            ))
        }
        "getSpendingTrend" => {
            let p: TrendPayload = parse(payload)?;
            to_json(service::get_spending_trend(
                connection,
                &p.month,
                &p.currency,
                p.months,
            ))
        }
        "predictSpending" => {
            let p: MonthCurrencyPayload = parse(payload)?;
            to_json(service::predict_spending(connection, &p.month, &p.currency))
        }
        unknown => Err(AppError::InvalidRequest(format!(
            "Unknown method '{unknown}'"
        ))),
    }
}

/// Parses the payload. An empty string counts as `{}` so list calls can
/// be made without a payload.
fn parse<T: DeserializeOwned>(payload: &str) -> Result<T, AppError> {
    let payload = if payload.trim().is_empty() {
        "{}"
    } else {
        payload
    };
    serde_json::from_str(payload)
        .map_err(|error| AppError::InvalidRequest(format!("Invalid payload: {error}")))
}

fn to_json<T: serde::Serialize>(result: Result<T, AppError>) -> Result<Value, AppError> {
    let data = result?;
    serde_json::to_value(data)
        .map_err(|error| AppError::InvalidRequest(format!("Could not encode reply: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;

    fn call(connection: &mut SqliteConnection, method: &str, payload: &str) -> Value {
        serde_json::from_str(&dispatch(connection, method, payload)).unwrap()
    }

    #[test]
    fn successful_call_wraps_data() {
        let mut connection = establish_connection_test().unwrap();

        let reply = call(
            &mut connection,
            "addCategory",
            r##"{"name":"Groceries","color":"#22aa55"}"##,
        );

        assert_eq!(reply["ok"], true);
        assert_eq!(reply["data"]["name"], "Groceries");
        assert_eq!(reply["data"]["color"], "#22AA55");
        assert_eq!(
            call(&mut connection, "listCategories", "")["data"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn validation_error_names_the_field() {
        let mut connection = establish_connection_test().unwrap();

        let reply = call(
            &mut connection,
            "addTransaction",
            r#"{"transaction_type":"expense","amount":"-3","currency":"EUR","description":"x","date":"2026-09-01"}"#,
        );

        assert_eq!(reply["ok"], false);
        assert_eq!(reply["error"]["kind"], "validation");
        assert_eq!(reply["error"]["field"], "amount");
    }

    #[test]
    fn malformed_requests_are_reported_not_panicked() {
        let mut connection = establish_connection_test().unwrap();

        let unknown = call(&mut connection, "dropTables", "{}");
        let bad_json = call(&mut connection, "getMonthlySummary", "{not json");
        let typo = call(
            &mut connection,
            "getMonthlySummary",
            r#"{"month":"2026-09","curency":"EUR"}"#,
        );

        for reply in [unknown, bad_json, typo] {
            assert_eq!(reply["ok"], false);
            assert_eq!(reply["error"]["kind"], "invalid_request");
        }
    }

    #[test]
    fn summary_round_trip() {
        let mut connection = establish_connection_test().unwrap();
        call(
            &mut connection,
            "addTransaction",
            r#"{"transaction_type":"expense","amount":"12.50","currency":"EUR","description":"Lunch","date":"2026-09-02"}"#,
        );

        let reply = call(
            &mut connection,
            "getMonthlySummary",
            r#"{"month":"2026-09","currency":"EUR"}"#,
        );

        assert_eq!(reply["data"]["spent_cents"], 1250);
        assert_eq!(reply["data"]["status"], "no_limit");
    }

    #[test]
    fn not_found_has_its_own_kind() {
        let mut connection = establish_connection_test().unwrap();
        let reply = call(&mut connection, "deleteTransaction", r#"{"id":7}"#);
        assert_eq!(reply["error"]["kind"], "not_found");
    }
}
