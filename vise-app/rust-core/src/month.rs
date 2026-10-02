//! Calendar months ("YYYY-MM") and their timestamp ranges.
//!
//! All timestamps in the database are Unix seconds. Months are evaluated in
//! UTC, matching how the CSV importer and `add_transaction` store dates
//! (midnight UTC of the given day).

use chrono::{DateTime, Datelike, NaiveDate};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct YearMonth {
    year: i32,
    month: u32, // 1..=12
}

impl YearMonth {
    pub fn new(year: i32, month: u32) -> Option<Self> {
        ((1..=12).contains(&month) && (1..=9999).contains(&year)).then_some(Self { year, month })
    }

    /// Parses the strict "YYYY-MM" format used in `budget_months.month`.
    pub fn parse(text: &str) -> Result<Self, String> {
        let invalid = || format!("'{text}' is not a month in YYYY-MM format");
        let (year, month) = text.split_once('-').ok_or_else(invalid)?;
        if year.len() != 4 || month.len() != 2 {
            return Err(invalid());
        }
        let year: i32 = year.parse().map_err(|_| invalid())?;
        let month: u32 = month.parse().map_err(|_| invalid())?;
        Self::new(year, month).ok_or_else(invalid)
    }

    /// The month containing a Unix timestamp (UTC).
    pub fn from_timestamp(timestamp: i64) -> Option<Self> {
        let date = DateTime::from_timestamp(timestamp, 0)?.date_naive();
        Self::new(date.year(), date.month())
    }

    pub fn next(self) -> Self {
        if self.month == 12 {
            Self {
                year: self.year + 1,
                month: 1,
            }
        } else {
            Self {
                month: self.month + 1,
                ..self
            }
        }
    }

    pub fn previous(self) -> Self {
        if self.month == 1 {
            Self {
                year: self.year - 1,
                month: 12,
            }
        } else {
            Self {
                month: self.month - 1,
                ..self
            }
        }
    }

    /// Unix timestamp of the first second of the month (inclusive).
    pub fn start_timestamp(self) -> i64 {
        NaiveDate::from_ymd_opt(self.year, self.month, 1)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| dt.and_utc().timestamp())
            .expect("YearMonth always holds a valid date")
    }

    /// Unix timestamp of the first second of the next month (exclusive).
    pub fn end_timestamp(self) -> i64 {
        self.next().start_timestamp()
    }
}

impl fmt::Display for YearMonth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}", self.year, self.month)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_formats_round_trip() {
        let month = YearMonth::parse("2026-09").unwrap();
        assert_eq!(month.to_string(), "2026-09");
    }

    #[test]
    fn rejects_malformed_months() {
        for bad in [
            "2026-13", "2026-00", "2026-9", "26-09", "2026/09", "", "abcd-ef",
        ] {
            assert!(YearMonth::parse(bad).is_err(), "expected '{bad}' to fail");
        }
    }

    #[test]
    fn next_and_previous_cross_year_boundaries() {
        let december = YearMonth::parse("2025-12").unwrap();
        assert_eq!(december.next().to_string(), "2026-01");
        assert_eq!(december.next().previous(), december);
    }

    #[test]
    fn timestamp_range_covers_whole_month() {
        let february = YearMonth::parse("2024-02").unwrap(); // leap year
        assert_eq!(february.start_timestamp(), 1_706_745_600); // 2024-02-01T00:00:00Z
        assert_eq!(february.end_timestamp(), 1_709_251_200); // 2024-03-01T00:00:00Z
        assert_eq!(
            YearMonth::from_timestamp(february.end_timestamp() - 1),
            Some(february)
        );
    }
}
