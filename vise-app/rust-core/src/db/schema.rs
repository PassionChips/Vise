// @generated automatically by Diesel CLI.

diesel::table! {
    auto_category_rules (id) {
        id -> Nullable<Integer>,
        expense_category_id -> Integer,
        match_field -> Text,
        match_type -> Text,
        pattern -> Text,
        priority -> Integer,
        is_active -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    budget_months (id) {
        id -> Nullable<Integer>,
        month -> Text,
        currency -> Text,
        spending_limit_cents -> Nullable<BigInt>,
        savings_target_cents -> Nullable<BigInt>,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    expense_categories (id) {
        id -> Nullable<Integer>,
        name -> Text,
        icon -> Nullable<Text>,
        color -> Nullable<Text>,
        is_default -> Bool,
        is_active -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    income_sources (id) {
        id -> Nullable<Integer>,
        name -> Text,
        is_active -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    revolut_accounts (id) {
        id -> Nullable<Integer>,
        external_id -> Text,
        name -> Text,
        account_type -> Nullable<Text>,
        currency -> Text,
        is_active -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    sync_state (id) {
        id -> Nullable<Integer>,
        revolut_account_id -> Integer,
        sync_cursor -> Nullable<Text>,
        last_sync_started_at -> Nullable<BigInt>,
        last_sync_completed_at -> Nullable<BigInt>,
        sync_status -> Text,
        last_error -> Nullable<Text>,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::table! {
    transactions (id) {
        id -> Nullable<Integer>,
        source_type -> Text,
        transaction_type -> Text,
        amount_cents -> BigInt,
        currency -> Text,
        description -> Text,
        occurred_at -> BigInt,
        income_source_id -> Nullable<Integer>,
        expense_category_id -> Nullable<Integer>,
        external_id -> Nullable<Text>,
        revolut_account_id -> Nullable<Integer>,
        merchant_name -> Nullable<Text>,
        raw_description -> Nullable<Text>,
        revolut_category -> Nullable<Text>,
        status -> Text,
        completed_at -> Nullable<BigInt>,
        exclude_from_totals -> Bool,
        created_at -> BigInt,
        updated_at -> BigInt,
    }
}

diesel::joinable!(auto_category_rules -> expense_categories (expense_category_id));
diesel::joinable!(sync_state -> revolut_accounts (revolut_account_id));
diesel::joinable!(transactions -> expense_categories (expense_category_id));
diesel::joinable!(transactions -> income_sources (income_source_id));
diesel::joinable!(transactions -> revolut_accounts (revolut_account_id));

diesel::allow_tables_to_appear_in_same_query!(
    auto_category_rules,
    budget_months,
    expense_categories,
    income_sources,
    revolut_accounts,
    sync_state,
    transactions,
);
