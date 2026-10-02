//! The single error type returned by the service layer.
//!
//! The UI needs to know *what kind* of failure happened to show the right
//! message: a validation error belongs next to a form field, while a
//! database error is a generic "something went wrong".

use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    /// User input was rejected. `field` names the form field to highlight.
    Validation { field: String, message: String },
    /// The requested record does not exist.
    NotFound(String),
    /// The request itself was malformed (unknown method, bad JSON).
    InvalidRequest(String),
    /// An unexpected database failure.
    Database(diesel::result::Error),
}

impl AppError {
    pub fn validation(field: &str, message: impl Into<String>) -> Self {
        Self::Validation {
            field: field.to_string(),
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation { field, message } => write!(f, "{field}: {message}"),
            Self::NotFound(message) | Self::InvalidRequest(message) => f.write_str(message),
            Self::Database(error) => write!(f, "Database error: {error}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<diesel::result::Error> for AppError {
    fn from(error: diesel::result::Error) -> Self {
        Self::Database(error)
    }
}

/// JSON shape of an error sent to the frontend:
/// `{ "kind": "validation", "field": "amount", "message": "..." }`
#[derive(Debug, Serialize, PartialEq)]
pub struct ErrorBody {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    pub message: String,
}

impl From<&AppError> for ErrorBody {
    fn from(error: &AppError) -> Self {
        let (kind, field, message) = match error {
            AppError::Validation { field, message } => {
                ("validation", Some(field.clone()), message.clone())
            }
            AppError::NotFound(message) => ("not_found", None, message.clone()),
            AppError::InvalidRequest(message) => ("invalid_request", None, message.clone()),
            // Raw database messages are not useful to end users.
            AppError::Database(_) => (
                "database",
                None,
                "Something went wrong saving your data. Please try again.".to_string(),
            ),
        };
        Self {
            kind,
            field,
            message,
        }
    }
}
