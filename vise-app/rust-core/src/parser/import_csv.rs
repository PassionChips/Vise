use chrono::NaiveDate;
use csv::ReaderBuilder;
use diesel::sqlite::SqliteConnection;
use serde::Deserialize;
use std::format;
use std::io::Read;

use crate::models::transaction::{NewTransaction, Transaction};
use crate::money::parse_amount_cents;
use crate::repository::transaction_repository;

#[derive(Debug, Deserialize)]
struct CsvRow {
    date: String,
    description: String,
    amount: String,
    currency: String,
    transaction_type: String,
    source_type: String,
    status: String,
    merchant_name: String,
    raw_description: String,
    revolut_category: String,
    external_id: String,
    exclude_from_totals: String,
    completed_at: String,
}

fn create_row_to_new_transaction(row: &CsvRow) -> Result<NewTransaction, String> {
    let occurred_at = NaiveDate::parse_from_str(&row.date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date '{}': {}", row.date, e))?
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| format!("Could not build midnight time for date '{}'", row.date))?
        .and_utc()
        .timestamp();

    // Parsed exactly, without going through f64 (see `money` module).
    let amount_cents = parse_amount_cents(&row.amount)
        .map_err(|e| format!("Invalid amount '{}': {}", row.amount, e))?;

    let exclude_from_totals = match row.exclude_from_totals.trim() {
        "true" => true,
        "false" => false,
        other => return Err(format!("Invalid exclude_from_totals value '{}'", other)),
    };

    let opt_str = |s: &str| -> Option<String> {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };

    let completed_at = if row.completed_at.trim().is_empty() {
        None
    } else {
        let ts = NaiveDate::parse_from_str(row.completed_at.trim(), "%Y-%m-%d")
            .map_err(|e| format!("Invalid completed_at '{}': {}", row.completed_at, e))?
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| "Could not build time for completed_at".to_string())?
            .and_utc()
            .timestamp();
        Some(ts)
    };

    Ok(NewTransaction {
        source_type: row.source_type.trim().to_string(),
        transaction_type: row.transaction_type.trim().to_string(),
        amount_cents,
        currency: row.currency.trim().to_ascii_uppercase(),
        description: row.description.trim().to_string(),
        occurred_at,
        income_source_id: None,    // set later via the category-linking step
        expense_category_id: None, // set later via the category-linking step
        external_id: opt_str(&row.external_id),
        revolut_account_id: None,
        merchant_name: opt_str(&row.merchant_name),
        raw_description: opt_str(&row.raw_description),
        revolut_category: opt_str(&row.revolut_category),
        status: row.status.trim().to_string(),
        completed_at,
        exclude_from_totals,
    })
}

pub struct ImportResult {
    pub transaction_record: Vec<Transaction>,
    pub error: Vec<(usize, String)>,
}

pub fn import_from_reader<R: Read>(
    reader: R,
    conn: &mut SqliteConnection,
) -> Result<ImportResult, csv::Error> {
    let mut result = ReaderBuilder::new()
        .has_headers(true)
        .trim(csv::Trim::All)
        .from_reader(reader);

    let mut import_result = ImportResult {
        transaction_record: Vec::new(),
        error: Vec::new(),
    };

    for (index, record) in result.deserialize::<CsvRow>().enumerate() {
        let row_number = index + 2;

        let row = match record {
            Ok(t) => t,
            Err(e) => {
                import_result
                    .error
                    .push((row_number, format!("CSV PARSER ERROR {}", e)));
                continue;
            }
        };

        let record = match create_row_to_new_transaction(&row) {
            Ok(t) => t,
            Err(e) => {
                import_result
                    .error
                    .push((row_number, format!("Invalid row: {}", e)));
                continue;
            }
        };

        match transaction_repository::insert(conn, &record) {
            Ok(t) => import_result.transaction_record.push(t),
            Err(e) => {
                import_result
                    .error
                    .push((row_number, format!("DB insert error: {}", e)));
                continue;
            }
        }
    }

    Ok(import_result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::establish_connection_test;

    const HEADER: &str = "date,description,amount,currency,transaction_type,source_type,status,\
merchant_name,raw_description,revolut_category,external_id,exclude_from_totals,completed_at\n";

    #[test]
    fn amounts_are_converted_to_exact_cents() {
        let mut conn = establish_connection_test().unwrap();
        let csv =
            format!("{HEADER}2024-01-04,Snack,0.29,eur,expense,manual,completed,,,,,false,\n");

        let result = import_from_reader(csv.as_bytes(), &mut conn).unwrap();

        assert!(result.error.is_empty(), "{:?}", result.error);
        assert_eq!(result.transaction_record[0].amount_cents, 29);
        assert_eq!(result.transaction_record[0].currency, "EUR");
    }

    #[test]
    fn bad_rows_are_reported_with_their_row_number_and_reason() {
        let mut conn = establish_connection_test().unwrap();
        let csv = format!(
            "{HEADER}\
2024-01-04,Ok,10.00,EUR,expense,manual,completed,,,,,false,
2024-01-05,Negative,-5,EUR,expense,manual,completed,,,,,false,
2024-13-01,Bad date,5,EUR,expense,manual,completed,,,,,false,
2024-01-06,Bad type,5,EUR,gift,manual,completed,,,,,false,
"
        );

        let result = import_from_reader(csv.as_bytes(), &mut conn).unwrap();

        assert_eq!(result.transaction_record.len(), 1);
        let rows: Vec<usize> = result.error.iter().map(|(row, _)| *row).collect();
        assert_eq!(rows, vec![3, 4, 5]);
        assert!(result.error[0].1.contains("Invalid amount"));
        assert!(result.error[1].1.contains("Invalid date"));
        // Rejected by the database CHECK constraint on transaction_type
        assert!(result.error[2].1.starts_with("DB insert error"));
    }
}
