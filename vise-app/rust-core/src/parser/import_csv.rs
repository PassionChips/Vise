use chrono::NaiveDate;
use csv::ReaderBuilder;
use diesel::sqlite::SqliteConnection;
use serde::Deserialize;
use std::format;
use std::io::Read;

use crate::models::transaction::{NewTransaction, Transaction};
use crate::repository::transaction_repository;

#[derive(Debug,Deserialize)]
struct CsvRow{
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


fn create_row_to_new_transaction(row:&CsvRow)->Result<NewTransaction,String>{
    let occurred_at = NaiveDate::parse_from_str(&row.date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date '{}': {}", row.date, e))?
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| format!("Could not build midnight time for date '{}'", row.date))?
        .and_utc()
        .timestamp();

    let amount_f: f64 = row
        .amount
        .parse()
        .map_err(|_| format!("Invalid amount '{}'", row.amount))?;
    if amount_f <=0.0{
        return Err(format!("Invalid exclude_from_totals value '{}'",row.amount))
    }
    let amount_cents = (amount_f * 100.0).round() as i64;

    let exclude_from_totals = match row.exclude_from_totals.trim() {
        "true" => true,
        "false" => false,
        other => return Err(format!("Invalid exclude_from_totals value '{}'", other)),
    };

    let opt_str = |s:&str|->Option<String>{
        let trimmed = s.trim();
        if trimmed.is_empty(){None} else {
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
        currency: row.currency.trim().to_string(),
        description: row.description.trim().to_string(),
        occurred_at,
        income_source_id: None,       // set later via the category-linking step
        expense_category_id: None,    // set later via the category-linking step
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

pub struct ImportResult{
    pub transaction_record:Vec<Transaction>,
    pub error:Vec<(usize,String)>
}

pub fn import_from_reader<R:Read>(
    reader:R,
    conn:&mut SqliteConnection
)->Result<ImportResult,csv::Error>{

    let mut result = ReaderBuilder::new()
        .has_headers(true)
        .trim(csv::Trim::All)
        .from_reader(reader);

    let mut import_result = ImportResult{
        transaction_record: Vec::new(),
        error : Vec::new()
    };

    for (index , record) in result.deserialize::<CsvRow>().enumerate(){

        let row_number = index+2;

        let row = match record{
            Ok(t) => t,
            Err(e)=> {
                import_result.error.push((row_number,format!("CSV PARSER ERROR {}",e)));
                continue;
            }
        };

        let record = match create_row_to_new_transaction(&row){
            Ok(t)=>t,
            Err(e)=>{
                import_result.error.push((row_number,format!("DB insert error: {}", e)));
                continue;
            }
        };

        match transaction_repository::insert(conn, &record) {
            Ok(t) => import_result.transaction_record.push(t),
            Err(e) => {
                import_result.error.push((row_number,format!("transaction error:{}",e)));
                continue;
            }
        }
    }

    Ok(import_result)

}