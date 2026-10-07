//! Reading amounts from spreadsheet cells: `1.234,56`, `1,234.56`, `(12.50)`,
//! `€ 12`, `12.50-`, and so on, into exact signed cents.

use crate::money::parse_limit_cents;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decimal {
    Dot,
    Comma,
}

impl Decimal {
    pub fn parse(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "dot" => Some(Self::Dot),
            "comma" => Some(Self::Comma),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dot => "dot",
            Self::Comma => "comma",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecimalGuess {
    pub decimal: Decimal,
    /// True when the data cannot tell `1,234` (one thousand) from `1,234` (one and a bit).
    pub ambiguous: bool,
}

fn is_minus(c: char) -> bool {
    matches!(c, '-' | '−' | '–')
}

fn is_group_space(c: char) -> bool {
    matches!(c, ' ' | '\u{a0}' | '\'' | '’')
}

/// A currency symbol or a three-letter code around the number is fine;
/// any other word means the cell is text, not an amount.
fn junk_ok(junk: &str) -> bool {
    let junk = junk.trim();
    junk.is_empty()
        || junk.chars().all(|c| !c.is_alphanumeric())
        || (junk.len() == 3 && junk.chars().all(|c| c.is_ascii_alphabetic()))
}

/// The digits and separators of an amount, plus whether it is negative.
fn extract(text: &str) -> Option<(String, bool)> {
    let text = text.trim();
    let minuses = text.chars().filter(|&c| is_minus(c)).count();
    if minuses > 1 {
        return None;
    }
    // A minus belongs before or after the number, not inside it (`10-20`).
    let (first_digit, last_digit) = (
        text.find(|c: char| c.is_ascii_digit())?,
        text.rfind(|c: char| c.is_ascii_digit())?,
    );
    if text[first_digit..=last_digit].chars().any(is_minus) {
        return None;
    }
    let negative = minuses == 1 || (text.contains('(') && text.contains(')'));
    let cleaned: String = text
        .chars()
        .filter(|&c| !is_minus(c) && !matches!(c, '+' | '(' | ')'))
        .collect();
    let first = cleaned.find(|c: char| c.is_ascii_digit() || c == '.' || c == ',')?;
    let last = cleaned.rfind(|c: char| c.is_ascii_digit())?;
    if last < first {
        return None;
    }
    let core = &cleaned[first..=last];
    let valid = core
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '.' | ',') || is_group_space(c));
    (valid && junk_ok(&cleaned[..first]) && junk_ok(&cleaned[last + 1..]))
        .then(|| (core.to_string(), negative))
}

/// Parses one cell. `Ok(None)` means the cell is empty.
pub fn parse_signed_cents(cell: &str, decimal: Decimal) -> Result<Option<i64>, String> {
    let text = cell.trim();
    if text.is_empty() || text.chars().all(|c| is_minus(c) || c == '—') {
        return Ok(None);
    }
    let (core, negative) =
        extract(text).ok_or_else(|| format!("'{text}' is not a valid amount"))?;
    let normalised: String = match decimal {
        Decimal::Dot => core
            .chars()
            .filter(|&c| c != ',' && !is_group_space(c))
            .collect(),
        Decimal::Comma => core
            .chars()
            .filter(|&c| c != '.' && !is_group_space(c))
            .map(|c| if c == ',' { '.' } else { c })
            .collect(),
    };
    let normalised = if normalised.starts_with('.') {
        format!("0{normalised}")
    } else {
        normalised
    };
    let cents = parse_limit_cents(&normalised)?;
    Ok(Some(if negative { -cents } else { cents }))
}

/// True if the cell holds an amount in either notation.
pub fn looks_like_amount(cell: &str) -> bool {
    [Decimal::Dot, Decimal::Comma]
        .iter()
        .any(|&d| matches!(parse_signed_cents(cell, d), Ok(Some(_))))
}

/// Works out the decimal separator from a whole column. `12,50` and
/// `1.234,56` are comma-decimal, `12.50` and `1,234.56` dot-decimal;
/// `1,234` alone could be either.
pub fn guess_decimal(cells: &[&str]) -> DecimalGuess {
    let (mut dot, mut comma, mut unclear) = (0usize, 0usize, 0usize);
    for cell in cells {
        let Some((core, _)) = extract(cell) else {
            continue;
        };
        let core: String = core.chars().filter(|&c| !is_group_space(c)).collect();
        let Some(last) = core.rfind(['.', ',']) else {
            continue;
        };
        let separator = core.as_bytes()[last] as char;
        let other = if separator == '.' { ',' } else { '.' };
        let after = core.len() - last - 1;
        let repeated = core.matches(separator).count() > 1;
        // `1.234,56`: the separator that comes last is the decimal one.
        // `1,234,567`: a repeated separator is a thousands separator.
        let decimal_here = if core.contains(other) {
            Some(separator)
        } else if repeated {
            Some(other)
        } else if after != 3 {
            Some(separator)
        } else {
            None
        };
        match decimal_here {
            Some('.') => dot += 1,
            Some(_) => comma += 1,
            None => unclear += 1,
        }
    }
    match (dot > 0, comma > 0) {
        (true, false) => DecimalGuess {
            decimal: Decimal::Dot,
            ambiguous: false,
        },
        (false, true) => DecimalGuess {
            decimal: Decimal::Comma,
            ambiguous: false,
        },
        (true, true) => DecimalGuess {
            decimal: if comma > dot {
                Decimal::Comma
            } else {
                Decimal::Dot
            },
            ambiguous: true,
        },
        (false, false) => DecimalGuess {
            decimal: Decimal::Dot,
            ambiguous: unclear > 0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dot(text: &str) -> Result<Option<i64>, String> {
        parse_signed_cents(text, Decimal::Dot)
    }
    fn comma(text: &str) -> Result<Option<i64>, String> {
        parse_signed_cents(text, Decimal::Comma)
    }

    #[test]
    fn reads_both_notations() {
        assert_eq!(dot("1,234.56"), Ok(Some(123_456)));
        assert_eq!(dot("12.5"), Ok(Some(1_250)));
        assert_eq!(comma("1.234,56"), Ok(Some(123_456)));
        assert_eq!(comma("12,50"), Ok(Some(1_250)));
        assert_eq!(comma("1 234,56"), Ok(Some(123_456)));
        assert_eq!(dot("1'234.56"), Ok(Some(123_456)));
    }

    #[test]
    fn reads_signs_symbols_and_codes() {
        assert_eq!(dot("-12.50"), Ok(Some(-1_250)));
        assert_eq!(dot("12.50-"), Ok(Some(-1_250)));
        assert_eq!(dot("(12.50)"), Ok(Some(-1_250)));
        assert_eq!(dot("−12.50"), Ok(Some(-1_250)));
        assert_eq!(dot("€12.50"), Ok(Some(1_250)));
        assert_eq!(dot("€ -12.50"), Ok(Some(-1_250)));
        assert_eq!(dot("12.50 EUR"), Ok(Some(1_250)));
        assert_eq!(dot("USD 12"), Ok(Some(1_200)));
        assert_eq!(dot(".50"), Ok(Some(50)));
    }

    #[test]
    fn empty_cells_are_not_errors_but_text_is() {
        assert_eq!(dot(""), Ok(None));
        assert_eq!(dot("  "), Ok(None));
        assert_eq!(dot("-"), Ok(None));
        for text in [
            "abc",
            "Lidl 12",
            "12 apples",
            "1e3",
            "10-20",
            "12.345",
            "NaN",
        ] {
            assert!(dot(text).is_err(), "{text}");
        }
    }

    #[test]
    fn zero_parses_so_the_caller_can_reject_it() {
        assert_eq!(dot("0.00"), Ok(Some(0)));
    }

    #[test]
    fn decimal_separator_comes_from_the_column() {
        assert_eq!(guess_decimal(&["12.50", "1,234.00"]).decimal, Decimal::Dot);
        assert_eq!(guess_decimal(&["12,50", "3,20"]).decimal, Decimal::Comma);
        assert_eq!(guess_decimal(&["1.234,56"]).decimal, Decimal::Comma);
        assert_eq!(guess_decimal(&["1,234,567"]).decimal, Decimal::Dot);
        assert!(!guess_decimal(&["12.50", "7"]).ambiguous);
    }

    #[test]
    fn a_lone_thousands_group_is_flagged_as_unclear() {
        let guess = guess_decimal(&["1,234", "2,500"]);
        assert!(guess.ambiguous);
        assert_eq!(guess.decimal, Decimal::Dot);
        assert_eq!(dot("1,234"), Ok(Some(123_400)));
        // Read with a decimal comma it would be 1.234, which has too many decimals.
        assert!(comma("1,234").is_err());
    }
}
