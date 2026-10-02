//! Pure budget maths.
//!
//! Nothing in this module touches the database. Every function receives
//! already-loaded data and returns plain structs, which keeps the rules easy
//! to unit-test. The `service` module does the loading.

pub mod analytics;
pub mod budget_check;
pub mod predictions;
pub mod summary;
pub mod totals;

#[cfg(test)]
pub(crate) mod test_support {
    use crate::models::transaction::Transaction;

    /// A completed EUR transaction with sensible defaults for tests.
    pub fn transaction(
        transaction_type: &str,
        amount_cents: i64,
        category: Option<i32>,
    ) -> Transaction {
        Transaction {
            id: None,
            source_type: "manual".to_string(),
            transaction_type: transaction_type.to_string(),
            amount_cents,
            currency: "EUR".to_string(),
            description: "test".to_string(),
            occurred_at: 1_700_000_000,
            income_source_id: None,
            expense_category_id: category,
            external_id: None,
            revolut_account_id: None,
            merchant_name: None,
            raw_description: None,
            revolut_category: None,
            status: "completed".to_string(),
            completed_at: None,
            exclude_from_totals: false,
            created_at: 0,
            updated_at: 0,
        }
    }
}
