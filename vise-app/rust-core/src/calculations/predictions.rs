//! Next-month spending prediction.
//!
//! With at least `MIN_MONTHS_FOR_TREND` months of history, a straight line
//! is fitted through the monthly totals (least-squares linear regression)
//! and extended one month forward. With less history a trend would be
//! mostly noise, so the plain average is used instead.

use serde::Serialize;

pub const MIN_MONTHS_FOR_TREND: usize = 3;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PredictionMethod {
    /// No history at all; the prediction is 0.
    NoData,
    /// Fewer than `MIN_MONTHS_FOR_TREND` months; the average is used.
    Average,
    LinearRegression,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Prediction {
    /// The month being predicted ("YYYY-MM").
    pub month: String,
    pub predicted_spent_cents: i64,
    pub method: PredictionMethod,
    pub months_used: usize,
}

/// Predicts the value that follows `history` (oldest first, in cents).
/// Never returns a negative amount.
pub fn predict_next(history: &[i64]) -> (i64, PredictionMethod) {
    let n = history.len();
    if n == 0 {
        return (0, PredictionMethod::NoData);
    }

    let n_f = n as f64;
    let sum_y: f64 = history.iter().map(|&y| y as f64).sum();

    if n < MIN_MONTHS_FOR_TREND {
        return (
            (sum_y / n_f).round().max(0.0) as i64,
            PredictionMethod::Average,
        );
    }

    // x is the month index: 0, 1, 2, ...
    // slope     = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
    // intercept = (Σy − slope·Σx) / n
    let sum_x: f64 = (0..n).map(|x| x as f64).sum();
    let sum_xx: f64 = (0..n).map(|x| (x * x) as f64).sum();
    let sum_xy: f64 = history
        .iter()
        .enumerate()
        .map(|(x, &y)| x as f64 * y as f64)
        .sum();

    // Never zero for n >= 2, because the x values are distinct.
    let slope = (n_f * sum_xy - sum_x * sum_y) / (n_f * sum_xx - sum_x * sum_x);
    let intercept = (sum_y - slope * sum_x) / n_f;
    let next = intercept + slope * n_f;

    (
        next.round().max(0.0) as i64,
        PredictionMethod::LinearRegression,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_history_predicts_zero() {
        assert_eq!(predict_next(&[]), (0, PredictionMethod::NoData));
    }

    #[test]
    fn short_history_uses_average() {
        assert_eq!(predict_next(&[100]), (100, PredictionMethod::Average));
        assert_eq!(predict_next(&[100, 201]), (151, PredictionMethod::Average));
    }

    #[test]
    fn linear_growth_is_extended() {
        assert_eq!(
            predict_next(&[100, 200, 300]),
            (400, PredictionMethod::LinearRegression)
        );
    }

    #[test]
    fn flat_history_predicts_same_value() {
        assert_eq!(
            predict_next(&[500, 500, 500, 500]),
            (500, PredictionMethod::LinearRegression)
        );
    }

    #[test]
    fn steep_decline_is_clamped_at_zero() {
        assert_eq!(
            predict_next(&[300, 100, 0]),
            (0, PredictionMethod::LinearRegression)
        );
    }
}
