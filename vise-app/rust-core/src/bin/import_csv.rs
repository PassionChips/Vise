use rust_core::db::connection::establish_connection;
use rust_core::parser::import_csv::import_from_reader;
use std::fs::File;
use std::path::Path;
use std::println;

pub fn main() {
    let csv_path = Path::new("data/transactions.csv");
    let db_path = Path::new("vise.db");

    let mut conn = establish_connection(db_path).expect("unable to connect to database");
    let file = File::open(csv_path).expect("no such file or unexpected error");
    let result = import_from_reader(file, &mut conn).expect("unable to extract data from csv");

    println!("Inserted: {} transactions", result.transaction_record.len());

    if result.error.is_empty() {
        println!("No errors.");
    } else {
        println!("Errors ({}):", result.error.len());
        for (row, msg) in result.error {
            println!("row {} : {}", row, msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::assert_eq;

    use super::*;
    use rust_core::{
        db::connection::establish_connection_test, repository::transaction_repository::get_all,
    };
    const SAMPLE_CSV: &str = "\
date,description,amount,currency,transaction_type,source_type,status,\
merchant_name,raw_description,revolut_category,external_id,exclude_from_totals,completed_at
2024-01-02,Salary,3200.00,EUR,income,manual,completed,,,,,false,
2024-01-04,Lidl,47.83,EUR,expense,manual,completed,Lidl,LIDL STORE,groceries,,false,
2024-01-20,Transfer,200.00,EUR,transfer,manual,completed,,SAVINGS,,RVLT-001,true,2024-01-20
";
    #[test]
    fn parses_and_inserts_all_reports() {
        let mut conn = establish_connection_test().expect("unable to connect to datatbase");
        let result =
            import_from_reader(SAMPLE_CSV.as_bytes(), &mut conn).expect("cannot push data");

        assert_eq!(result.transaction_record.len(), 3);
        assert!(result.error.is_empty());

        let all = get_all(&mut conn).expect("unable to get the data");
        assert_eq!(all.len(), 3);
    }
}
