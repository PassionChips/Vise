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
use crate::importer;
use crate::receipt;
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
struct TodayPayload {
    today: String,
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
        "updateTransaction" => to_json(service::update_transaction(connection, &parse(payload)?)),
        "getSettings" => to_json(service::settings::get_settings(connection)),
        "updateSettings" => to_json(service::settings::update_settings(
            connection,
            &parse(payload)?,
        )),
        "completeOnboarding" => to_json(service::settings::complete_onboarding(
            connection,
            &parse(payload)?,
        )),
        "getDataOverview" => to_json(service::data::get_data_overview(connection)),
        "exportDataCsv" => {
            let TodayPayload { today } = parse(payload)?;
            to_json(service::data::export_csv(connection, &today))
        }
        "deleteAllData" => to_json(service::data::delete_all_data(connection, &parse(payload)?)),
        "deleteCategoryBudget" => {
            service::delete_category_budget(connection, &parse(payload)?)?;
            Ok(Value::Null)
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
        "parseReceipt" => to_json(receipt::parse(connection, &parse(payload)?)),
        "previewImport" => to_json(importer::preview(connection, &parse(payload)?)),
        "commitImport" => to_json(importer::commit(connection, &parse(payload)?)),
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
    fn import_methods_preview_then_save_through_json() {
        let mut connection = establish_connection_test().unwrap();
        let payload = serde_json::json!({
            "content": "Date,Description,Amount\n2026-09-01,Lunch,-12.50\n",
            "today": "2026-10-07",
            "default_currency": "EUR"
        })
        .to_string();

        let preview = call(&mut connection, "previewImport", &payload);
        assert_eq!(preview["ok"], true);
        assert_eq!(preview["data"]["stats"]["ready"], 1);
        assert_eq!(
            call(
                &mut connection,
                "listTransactions",
                r#"{"month":"2026-09"}"#
            )["data"]
                .as_array()
                .unwrap()
                .len(),
            0
        );

        let saved = call(&mut connection, "commitImport", &payload);
        assert_eq!(saved["data"]["inserted"], 1);
        assert_eq!(
            call(
                &mut connection,
                "listTransactions",
                r#"{"month":"2026-09"}"#
            )["data"][0]["description"],
            "Lunch"
        );

        let typo = call(
            &mut connection,
            "commitImport",
            r#"{"content":"x","today":"2026-10-07","default_currency":"EUR","colunm":1}"#,
        );
        assert_eq!(typo["error"]["kind"], "invalid_request");
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
    fn appearance_avatar_export_and_delete_round_trip() {
        let mut connection = establish_connection_test().unwrap();

        let theme = call(&mut connection, "updateSettings", r#"{"theme":"dark"}"#);
        assert_eq!(theme["data"]["theme"], "dark");
        assert_eq!(
            call(&mut connection, "getSettings", "")["data"]["theme"],
            "dark"
        );

        let avatar = call(&mut connection, "updateSettings", r#"{"avatar":"rocket"}"#);
        assert_eq!(avatar["data"]["avatar"], "rocket");
        let unknown = call(&mut connection, "updateSettings", r#"{"avatar":"dragon"}"#);
        assert_eq!(unknown["error"]["field"], "avatar");

        call(
            &mut connection,
            "addTransaction",
            r#"{"transaction_type":"expense","amount":"12.50","currency":"EUR","description":"Lunch","date":"2026-09-02"}"#,
        );
        let export = call(
            &mut connection,
            "exportDataCsv",
            r#"{"today":"2026-10-04"}"#,
        );
        assert_eq!(export["data"]["transaction_count"], 1);
        assert!(export["data"]["csv"].as_str().unwrap().contains("Lunch"));

        let refused = call(&mut connection, "deleteAllData", r#"{"confirm":"yes"}"#);
        assert_eq!(refused["error"]["field"], "confirm");
        assert_eq!(
            call(&mut connection, "getDataOverview", "")["data"]["transactions"],
            1
        );

        let deleted = call(&mut connection, "deleteAllData", r#"{"confirm":"DELETE"}"#);
        assert_eq!(deleted["data"]["transactions"], 1);
        let overview = call(&mut connection, "getDataOverview", "");
        assert_eq!(overview["data"]["transactions"], 0);
        assert_eq!(
            call(&mut connection, "getSettings", "")["data"]["avatar"],
            Value::Null
        );
    }

    #[test]
    fn onboarding_round_trip_through_the_api() {
        let mut connection = establish_connection_test().unwrap();
        assert_eq!(
            call(&mut connection, "getSettings", "")["data"]["onboarding_completed"],
            false
        );

        let reply = call(
            &mut connection,
            "completeOnboarding",
            r#"{"currency":"EUR","today":"2026-09-18","monthly_income":"4250",
                "budget_category":{"name":"Groceries"},"monthly_limit":"500"}"#,
        );

        assert_eq!(reply["ok"], true);
        assert_eq!(reply["data"]["onboarding_completed"], true);
        assert_eq!(reply["data"]["monthly_income_cents"], 425_000);
        let reread = call(&mut connection, "getSettings", "");
        assert_eq!(reread["data"]["income_source_name"], "Salary");

        let summary = call(
            &mut connection,
            "getMonthlySummary",
            r#"{"month":"2026-09","currency":"EUR"}"#,
        );
        assert_eq!(summary["data"]["left_cents"], 425_000);
    }

    #[test]
    fn update_and_delete_transaction_and_budget() {
        let mut connection = establish_connection_test().unwrap();
        let added = call(
            &mut connection,
            "addTransaction",
            r#"{"transaction_type":"expense","amount":"10","currency":"EUR","description":"Lunch","date":"2026-09-02"}"#,
        );
        let id = added["data"]["id"].as_i64().unwrap();

        let updated = call(
            &mut connection,
            "updateTransaction",
            &format!(
                r#"{{"id":{id},"transaction_type":"expense","amount":"12.50","currency":"EUR","description":"Dinner","date":"2026-09-03"}}"#
            ),
        );
        assert_eq!(updated["data"]["amount_cents"], 1250);
        assert_eq!(updated["data"]["description"], "Dinner");

        let missing = call(
            &mut connection,
            "updateTransaction",
            r#"{"id":99,"transaction_type":"expense","amount":"1","currency":"EUR","description":"x","date":"2026-09-03"}"#,
        );
        assert_eq!(missing["error"]["kind"], "not_found");

        let category = call(&mut connection, "addCategory", r#"{"name":"Food"}"#);
        let category_id = category["data"]["id"].as_i64().unwrap();
        call(
            &mut connection,
            "setCategoryBudget",
            &format!(
                r#"{{"month":"2026-09","currency":"EUR","expense_category_id":{category_id},"limit":"100"}}"#
            ),
        );
        let key = format!(
            r#"{{"month":"2026-09","currency":"EUR","expense_category_id":{category_id}}}"#
        );
        assert_eq!(
            call(&mut connection, "deleteCategoryBudget", &key)["ok"],
            true
        );
        assert_eq!(
            call(&mut connection, "deleteCategoryBudget", &key)["error"]["kind"],
            "not_found"
        );
    }

    #[test]
    fn not_found_has_its_own_kind() {
        let mut connection = establish_connection_test().unwrap();
        let reply = call(&mut connection, "deleteTransaction", r#"{"id":7}"#);
        assert_eq!(reply["error"]["kind"], "not_found");
    }
}
