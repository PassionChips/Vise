//! Converting user-typed amounts into integer cents.
//!
//! Amounts are parsed as text, digit by digit, instead of through `f64`.
//! `f64::parse` accepts inputs no person means as money (`"NaN"`, `"inf"`,
//! `"1e3"`) and would silently round `"12.345"`; here those are rejected
//! with a clear message, and the result is always exact integer cents.

/// Parses a transaction amount such as `"12"`, `"12.5"`, `"12.50"` or
/// `"12,50"` into cents (`1250`). Zero is rejected: a transaction always
/// moves money.
pub fn parse_amount_cents(input: &str) -> Result<i64, String> {
    match parse_cents(input)? {
        0 => Err("Amount must be greater than zero".to_string()),
        cents => Ok(cents),
    }
}

/// Parses a budget limit or target. Unlike transaction amounts, zero is
/// allowed ("don't spend anything on this").
pub fn parse_limit_cents(input: &str) -> Result<i64, String> {
    parse_cents(input)
}

/// Shared parser for non-negative amounts.
///
/// A single comma is accepted as the decimal separator because many
/// European keyboards produce one. Thousands separators (`"1,234.00"`),
/// signs, more than two decimals and empty input are rejected.
fn parse_cents(input: &str) -> Result<i64, String> {
    let text = input.trim();
    if text.is_empty() {
        return Err("Enter an amount".to_string());
    }

    let normalised = if text.contains('.') {
        text.to_string()
    } else {
        text.replacen(',', ".", 1)
    };

    let (whole, fraction) = match normalised.split_once('.') {
        Some((whole, fraction)) => (whole, fraction),
        None => (normalised.as_str(), ""),
    };

    let all_digits = |s: &str| s.chars().all(|c| c.is_ascii_digit());
    if whole.is_empty() || !all_digits(whole) || !all_digits(fraction) {
        return Err(format!("'{text}' is not a valid amount"));
    }
    if fraction.len() > 2 {
        return Err("Use at most two decimal places".to_string());
    }

    // "5" -> 50 cents, "05" -> 5 cents, "" -> 0 cents
    let fraction_cents = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<i64>().unwrap_or(0) * 10,
        _ => fraction.parse::<i64>().unwrap_or(0),
    };

    whole
        .parse::<i64>()
        .ok()
        .and_then(|units| units.checked_mul(100))
        .and_then(|units_cents| units_cents.checked_add(fraction_cents))
        .ok_or_else(|| "Amount is too large".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_whole_and_decimal_amounts() {
        assert_eq!(parse_amount_cents("12"), Ok(1200));
        assert_eq!(parse_amount_cents("12.5"), Ok(1250));
        assert_eq!(parse_amount_cents("12.05"), Ok(1205));
        assert_eq!(parse_amount_cents(" 0.01 "), Ok(1));
    }

    #[test]
    fn accepts_comma_as_decimal_separator() {
        assert_eq!(parse_amount_cents("12,50"), Ok(1250));
    }

    #[test]
    fn rejects_inputs_that_f64_would_accept() {
        for bad in ["NaN", "inf", "1e3", "12.345"] {
            assert!(parse_amount_cents(bad).is_err(), "expected '{bad}' to fail");
        }
    }

    #[test]
    fn rejects_invalid_amounts() {
        for bad in [
            "",
            "  ",
            "abc",
            "-5",
            "+5",
            "1,234.00",
            "1.2.3",
            ".50",
            "12.345",
            "0",
            "0.00",
            "99999999999999999999",
        ] {
            assert!(parse_amount_cents(bad).is_err(), "expected '{bad}' to fail");
        }
    }

    #[test]
    fn limits_may_be_zero_but_not_negative() {
        assert_eq!(parse_limit_cents("0"), Ok(0));
        assert_eq!(parse_limit_cents("250"), Ok(25_000));
        assert!(parse_limit_cents("-1").is_err());
    }
}
