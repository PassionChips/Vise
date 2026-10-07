//! Reading dates from spreadsheet cells in whatever format the file uses.

use chrono::{Days, NaiveDate};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateOrder {
    Dmy,
    Mdy,
    Ymd,
}

impl DateOrder {
    pub fn parse(text: &str) -> Option<Self> {
        match text.trim().to_ascii_lowercase().as_str() {
            "dmy" => Some(Self::Dmy),
            "mdy" => Some(Self::Mdy),
            "ymd" => Some(Self::Ymd),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dmy => "dmy",
            Self::Mdy => "mdy",
            Self::Ymd => "ymd",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OrderGuess {
    pub order: DateOrder,
    /// True when the data cannot tell day-first from month-first.
    pub ambiguous: bool,
}

const TEXT_FORMATS: [&str; 10] = [
    "%d %b %Y",
    "%d %B %Y",
    "%d-%b-%Y",
    "%d-%b-%y",
    "%d %b %y",
    "%d/%b/%Y",
    "%b %d, %Y",
    "%b %d %Y",
    "%B %d, %Y",
    "%B %d %Y",
];

/// Splits `01/09/2026`, `1.9.26` or `2026-09-01T10:00:00` into three number
/// strings. Any time of day is ignored.
fn split_numeric(cell: &str) -> Option<[&str; 3]> {
    let token = cell.split_whitespace().next()?.split('T').next()?;
    let mut parts = token.split(['/', '.', '-']);
    let (a, b, c) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() {
        return None;
    }
    let number = |s: &str| !s.is_empty() && s.len() <= 4 && s.bytes().all(|b| b.is_ascii_digit());
    (number(a) && number(b) && number(c)).then_some([a, b, c])
}

fn year_from(text: &str) -> Option<i32> {
    let year: i32 = text.parse().ok()?;
    match text.len() {
        4 => Some(year),
        1 | 2 => Some(if year <= 69 { 2000 + year } else { 1900 + year }),
        _ => None,
    }
}

fn build(year: &str, month: &str, day: &str) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(year_from(year)?, month.parse().ok()?, day.parse().ok()?)
}

fn parse_textual(cell: &str) -> Option<NaiveDate> {
    // "Sept" is not a name chrono knows; only whole words are changed ("September" stays).
    let text = cell
        .split(' ')
        .map(|word| {
            if word.eq_ignore_ascii_case("sept") {
                "Sep"
            } else {
                word
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    TEXT_FORMATS.iter().find_map(|format| {
        let (date, rest) = NaiveDate::parse_and_remainder(&text, format).ok()?;
        let rest = rest.trim_start();
        (rest.is_empty() || rest.starts_with(|c: char| c.is_ascii_digit() || c == 'T'))
            .then_some(date)
    })
}

/// Dates stored as a bare number: `20260901`, an Excel serial such as
/// `46266`, or a Unix timestamp in seconds or milliseconds.
fn parse_number(text: &str) -> Option<NaiveDate> {
    let n: i64 = text.parse().ok()?;
    match text.len() {
        13 => chrono::DateTime::from_timestamp(n / 1000, 0).map(|d| d.date_naive()),
        10 if n >= 946_684_800 => chrono::DateTime::from_timestamp(n, 0).map(|d| d.date_naive()),
        8 => NaiveDate::parse_from_str(text, "%Y%m%d").ok(),
        4..=6 if (20_000..=80_000).contains(&n) => {
            NaiveDate::from_ymd_opt(1899, 12, 30)?.checked_add_days(Days::new(n as u64))
        }
        _ => None,
    }
}

/// Reads one cell. `allow_numeric` lets bare numbers count as dates; only
/// switch it on for a column already known to hold dates, because amounts
/// look the same.
pub fn parse_date(cell: &str, order: DateOrder, allow_numeric: bool) -> Option<NaiveDate> {
    let text = cell.trim();
    if text.is_empty() {
        return None;
    }
    if text.bytes().all(|b| b.is_ascii_digit()) {
        return if allow_numeric {
            parse_number(text)
        } else {
            None
        };
    }
    if let Some(date) = parse_textual(text) {
        return Some(date);
    }
    let [a, b, c] = split_numeric(text)?;
    if a.len() == 4 {
        return build(a, b, c);
    }
    match order {
        DateOrder::Dmy => build(c, b, a),
        DateOrder::Mdy => build(c, a, b),
        DateOrder::Ymd => build(a, b, c),
    }
}

/// True if the cell is a date in any of the supported layouts.
pub fn looks_like_date(cell: &str) -> bool {
    [DateOrder::Dmy, DateOrder::Mdy, DateOrder::Ymd]
        .iter()
        .any(|&order| parse_date(cell, order, false).is_some())
}

/// Works out day-first or month-first from a whole column: `25/12/2026` can
/// only be day-first, `12/25/2026` only month-first.
pub fn guess_order(cells: &[&str]) -> OrderGuess {
    let (mut day_first, mut month_first, mut year_first, mut numeric) = (0, 0, 0, 0);
    for cell in cells {
        let Some([a, b, _]) = split_numeric(cell) else {
            continue;
        };
        numeric += 1;
        if a.len() == 4 {
            year_first += 1;
            continue;
        }
        let (a, b): (u32, u32) = (a.parse().unwrap_or(0), b.parse().unwrap_or(0));
        if a > 12 {
            day_first += 1;
        }
        if b > 12 {
            month_first += 1;
        }
    }
    let (order, ambiguous) = match (day_first > 0, month_first > 0) {
        (true, false) => (DateOrder::Dmy, false),
        (false, true) => (DateOrder::Mdy, false),
        (true, true) => (DateOrder::Dmy, true),
        (false, false) if numeric > 0 && year_first == numeric => (DateOrder::Ymd, false),
        (false, false) if numeric > 0 => (DateOrder::Dmy, true),
        (false, false) => (DateOrder::Dmy, false),
    };
    OrderGuess { order, ambiguous }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> Option<NaiveDate> {
        NaiveDate::from_ymd_opt(y, m, day)
    }

    #[test]
    fn reads_the_common_layouts() {
        let dmy = DateOrder::Dmy;
        assert_eq!(parse_date("2026-09-01", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("2026/09/01", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("01/09/2026", dmy, false), d(2026, 9, 1));
        assert_eq!(
            parse_date("01/09/2026", DateOrder::Mdy, false),
            d(2026, 1, 9)
        );
        assert_eq!(parse_date("1.9.26", dmy, false), d(2026, 9, 1));
        assert_eq!(
            parse_date("2026-09-01T10:30:00Z", dmy, false),
            d(2026, 9, 1)
        );
        assert_eq!(parse_date("01/09/2026 14:03", dmy, false), d(2026, 9, 1));
    }

    #[test]
    fn reads_month_names() {
        let dmy = DateOrder::Dmy;
        assert_eq!(parse_date("1 Sep 2026", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("1 Sept 2026", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("01-sep-2026", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("September 1, 2026", dmy, false), d(2026, 9, 1));
        assert_eq!(parse_date("Sep 1, 2026 10:00", dmy, false), d(2026, 9, 1));
    }

    #[test]
    fn bare_numbers_are_dates_only_when_allowed() {
        let dmy = DateOrder::Dmy;
        assert_eq!(parse_date("46266", dmy, false), None);
        assert_eq!(parse_date("46266", dmy, true), d(2026, 9, 1));
        assert_eq!(parse_date("20260901", dmy, true), d(2026, 9, 1));
        assert_eq!(parse_date("1788220800", dmy, true), d(2026, 9, 1));
        assert_eq!(parse_date("1788220800000", dmy, true), d(2026, 9, 1));
    }

    #[test]
    fn rejects_things_that_are_not_dates() {
        let dmy = DateOrder::Dmy;
        for text in [
            "",
            "abc",
            "30/02/2026",
            "13/13/2026",
            "12.50",
            "-12.50",
            "1/2",
        ] {
            assert_eq!(parse_date(text, dmy, false), None, "{text}");
        }
    }

    #[test]
    fn day_first_or_month_first_comes_from_the_whole_column() {
        assert_eq!(
            guess_order(&["03/04/2026", "25/04/2026"]).order,
            DateOrder::Dmy
        );
        assert!(!guess_order(&["03/04/2026", "25/04/2026"]).ambiguous);
        assert_eq!(
            guess_order(&["03/04/2026", "04/25/2026"]).order,
            DateOrder::Mdy
        );
        assert_eq!(guess_order(&["2026-04-03"]).order, DateOrder::Ymd);
        let unclear = guess_order(&["03/04/2026", "05/06/2026"]);
        assert!(unclear.ambiguous);
        assert_eq!(unclear.order, DateOrder::Dmy);
    }
}
