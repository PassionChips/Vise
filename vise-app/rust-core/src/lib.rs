//! VISE core: budgeting logic and storage for the VISE app.
//!
//! Layers, from the outside in:
//! - `api`          JSON in, JSON out: the single entry point for the app's frontend
//! - `service`      use cases: validate input, load data, run calculations
//! - `calculations` pure budget maths (no database)
//! - `repository`   one module of CRUD queries per table
//! - `models`       Rust structs mirroring the database rows
//! - `db`           connection setup, migrations and the generated schema
//! - `parser`       CSV import (fixed columns, used by the developer binary)
//! - `importer`     import of any CSV: detects columns, dates and amounts, previews, then saves
//! - `receipt`      reads a photographed receipt (OCR text) into a proposed expense
//! - `ffi`          native entry points used by the Expo module (Android JNI, C ABI)
//!
//! Shared helpers: `error` (AppError), `money` (amount parsing),
//! `month` (YYYY-MM handling).

pub mod api;
pub mod calculations;
pub mod db;
pub mod error;
pub mod ffi;
pub mod importer;
pub mod models;
pub mod money;
pub mod month;
pub mod parser;
pub mod receipt;
pub mod repository;
pub mod service;
