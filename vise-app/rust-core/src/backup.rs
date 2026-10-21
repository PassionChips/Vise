//! Whole-database backups.
//!
//! A backup is one file the user keeps wherever they choose (a folder on the phone, Google Drive,
//! ...). After deleting the app or changing phone they restore it from the Welcome page.
//!
//! # Format (`.vise`)
//!
//! ```text
//! "VISEBAK1" | flags (1) | created_at (8, big-endian unix seconds) | body
//! plain body:     SHA-256 of the payload (32) | payload
//! encrypted body: Argon2id memory KiB, passes, lanes (3 x u32) | salt (16) | nonce (12) | ciphertext + tag
//! ```
//!
//! The payload is a consistent copy of the SQLite database (`VACUUM INTO`). With a passphrase it is
//! encrypted with AES-256-GCM, and the header is authenticated too, so a changed date or KDF setting
//! is detected. A file that is damaged, belongs to another app, or was made by a newer VISE is
//! rejected before anything on the phone is touched.
//!
//! A restore stages the backup next to the live database, checks and upgrades the staged copy, and
//! only then swaps it in. If any step fails the current database stays as it was.

use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::Text;
use diesel::sqlite::SqliteConnection;
use diesel::{QueryableByName, sql_query};
use diesel_migrations::MigrationHarness;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db::connection::{MIGRATIONS, configure_connection, establish_connection};
use crate::db::schema::{app_settings, transactions};
use crate::error::AppError;
use crate::service::data::get_data_overview;

const MAGIC: &[u8; 8] = b"VISEBAK1";
const FLAG_ENCRYPTED: u8 = 1;
const HEADER_LEN: usize = 8 + 1 + 8;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KDF_PARAMS_LEN: usize = 12;
const TAG_LEN: usize = 16;

/// Argon2id settings for new backups: 19 MiB, 2 passes, 1 lane (OWASP's minimum recommendation).
const KDF_MEMORY_KIB: u32 = 19 * 1024;
const KDF_PASSES: u32 = 2;
const KDF_LANES: u32 = 1;
/// Limits on what a file may ask for, so a hostile file cannot make the phone work for minutes.
const MAX_KDF_MEMORY_KIB: u32 = 256 * 1024;
const MAX_KDF_PASSES: u32 = 10;
const MAX_KDF_LANES: u32 = 8;

pub const MIN_PASSPHRASE_CHARS: usize = 8;
const MAX_BACKUP_BYTES: u64 = 200 * 1024 * 1024;

/// Tables a VISE database must have.
const REQUIRED_TABLES: [&str; 6] = [
    "transactions",
    "expense_categories",
    "income_sources",
    "app_settings",
    "budget_months",
    "__diesel_schema_migrations",
];

// ----- Input and output -----

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    /// Where to write the backup file (a path in the app's cache; the app then moves it to the
    /// folder or cloud the user chose).
    pub path: String,
    /// Protects the file. Blank or missing means no passphrase.
    #[serde(default)]
    pub passphrase: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenInput {
    /// The backup file.
    pub path: String,
    #[serde(default)]
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BackupSummary {
    pub transactions: i64,
    pub categories: i64,
    pub income_sources: i64,
    /// Monthly budgets plus per-category limits.
    pub budgets: i64,
    /// YYYY-MM-DD of the oldest and newest transaction, if there are any.
    pub first_transaction_date: Option<String>,
    pub last_transaction_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub path: String,
    pub bytes: u64,
    pub encrypted: bool,
    /// ISO 8601, UTC.
    pub created_at: String,
    pub summary: BackupSummary,
}

#[derive(Debug, Serialize)]
pub struct BackupInspection {
    pub encrypted: bool,
    /// True if the file is protected and no (or no usable) passphrase was given; nothing else is known yet.
    pub needs_passphrase: bool,
    pub created_at: String,
    pub summary: Option<BackupSummary>,
}

// ----- Errors -----

fn file_error(message: &str) -> AppError {
    AppError::validation("file", message)
}

fn io_error(action: &str, error: std::io::Error) -> AppError {
    AppError::InvalidRequest(format!("Could not {action}: {error}"))
}

fn iso(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp, 0)
        .map(|d| d.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default()
}

fn day(timestamp: i64) -> Option<String> {
    DateTime::<Utc>::from_timestamp(timestamp, 0).map(|d| d.format("%Y-%m-%d").to_string())
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

// ----- The file format -----

fn clean_passphrase(passphrase: Option<&str>) -> Result<Option<&str>, AppError> {
    match passphrase.filter(|p| !p.is_empty()) {
        Some(p) if p.chars().count() < MIN_PASSPHRASE_CHARS => Err(AppError::validation(
            "passphrase",
            format!("Use at least {MIN_PASSPHRASE_CHARS} characters"),
        )),
        other => Ok(other),
    }
}

fn derive_key(
    passphrase: &str,
    salt: &[u8],
    memory: u32,
    passes: u32,
    lanes: u32,
) -> Result<[u8; 32], AppError> {
    let params = Params::new(memory, passes, lanes, Some(32))
        .map_err(|e| AppError::InvalidRequest(format!("Invalid backup settings: {e}")))?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::InvalidRequest(format!("Could not protect the backup: {e}")))?;
    Ok(key)
}

fn random(buffer: &mut [u8]) -> Result<(), AppError> {
    getrandom::fill(buffer)
        .map_err(|e| AppError::InvalidRequest(format!("No secure random numbers available: {e}")))
}

fn cipher_for(key: &[u8; 32]) -> Result<Aes256Gcm, AppError> {
    Aes256Gcm::new_from_slice(key).map_err(|_| AppError::InvalidRequest("Invalid key".to_string()))
}

/// Wraps the database copy in the file format.
fn seal(payload: &[u8], passphrase: Option<&str>, created_at: i64) -> Result<Vec<u8>, AppError> {
    let mut out = Vec::with_capacity(payload.len() + 128);
    out.extend_from_slice(MAGIC);
    out.push(if passphrase.is_some() {
        FLAG_ENCRYPTED
    } else {
        0
    });
    out.extend_from_slice(&created_at.to_be_bytes());

    let Some(passphrase) = passphrase else {
        out.extend_from_slice(&Sha256::digest(payload));
        out.extend_from_slice(payload);
        return Ok(out);
    };

    let (mut salt, mut nonce_bytes) = ([0u8; SALT_LEN], [0u8; NONCE_LEN]);
    random(&mut salt)?;
    random(&mut nonce_bytes)?;
    for value in [KDF_MEMORY_KIB, KDF_PASSES, KDF_LANES] {
        out.extend_from_slice(&value.to_be_bytes());
    }
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);

    let key = derive_key(passphrase, &salt, KDF_MEMORY_KIB, KDF_PASSES, KDF_LANES)?;
    let nonce = Nonce::try_from(&nonce_bytes[..])
        .map_err(|_| AppError::InvalidRequest("Invalid nonce".to_string()))?;
    let ciphertext = cipher_for(&key)?
        .encrypt(
            &nonce,
            Payload {
                msg: payload,
                aad: &out,
            },
        )
        .map_err(|_| AppError::InvalidRequest("Could not protect the backup".to_string()))?;
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

enum Opened {
    NeedsPassphrase {
        created_at: i64,
    },
    Ready {
        created_at: i64,
        encrypted: bool,
        payload: Vec<u8>,
    },
}

fn damaged() -> AppError {
    file_error("This backup file is damaged or incomplete")
}

fn u32_at(bytes: &[u8], at: usize) -> u32 {
    u32::from_be_bytes(bytes[at..at + 4].try_into().expect("four bytes"))
}

/// Reads the file format, checking its integrity. Does not look inside the database.
fn unseal(bytes: &[u8], passphrase: Option<&str>) -> Result<Opened, AppError> {
    if bytes.len() < HEADER_LEN || &bytes[..8] != MAGIC {
        return Err(file_error("This is not a VISE backup file"));
    }
    let flags = bytes[8];
    if flags & !FLAG_ENCRYPTED != 0 {
        return Err(file_error(
            "This backup was made by a newer version of VISE. Update the app and try again",
        ));
    }
    let created_at = i64::from_be_bytes(bytes[9..17].try_into().expect("eight bytes"));
    let body = &bytes[HEADER_LEN..];

    if flags & FLAG_ENCRYPTED == 0 {
        if body.len() < 32 {
            return Err(damaged());
        }
        let (checksum, payload) = body.split_at(32);
        if Sha256::digest(payload).as_slice() != checksum {
            return Err(damaged());
        }
        return Ok(Opened::Ready {
            created_at,
            encrypted: false,
            payload: payload.to_vec(),
        });
    }

    let fixed = KDF_PARAMS_LEN + SALT_LEN + NONCE_LEN;
    if body.len() < fixed + TAG_LEN {
        return Err(damaged());
    }
    let Some(passphrase) = passphrase.filter(|p| !p.is_empty()) else {
        return Ok(Opened::NeedsPassphrase { created_at });
    };
    let (memory, passes, lanes) = (u32_at(body, 0), u32_at(body, 4), u32_at(body, 8));
    if memory > MAX_KDF_MEMORY_KIB || passes > MAX_KDF_PASSES || lanes > MAX_KDF_LANES {
        return Err(damaged());
    }
    let salt = &body[KDF_PARAMS_LEN..KDF_PARAMS_LEN + SALT_LEN];
    let nonce_bytes = &body[KDF_PARAMS_LEN + SALT_LEN..fixed];
    let header = &bytes[..HEADER_LEN + fixed];

    let key = derive_key(passphrase, salt, memory, passes, lanes)?;
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| damaged())?;
    let payload = cipher_for(&key)?
        .decrypt(
            &nonce,
            Payload {
                msg: &body[fixed..],
                aad: header,
            },
        )
        .map_err(|_| {
            AppError::validation("passphrase", "Wrong passphrase, or the file is damaged")
        })?;
    Ok(Opened::Ready {
        created_at,
        encrypted: true,
        payload,
    })
}

// ----- Checking a database -----

#[derive(QueryableByName)]
struct IntegrityRow {
    #[diesel(sql_type = Text)]
    integrity_check: String,
}

#[derive(QueryableByName)]
struct NameRow {
    #[diesel(sql_type = Text)]
    name: String,
}

/// Rejects a database that is damaged, is not VISE's, or comes from a newer VISE.
fn check_is_vise_database(connection: &mut SqliteConnection) -> Result<(), AppError> {
    let not_vise = || file_error("This is not a VISE backup file");
    let integrity: Vec<IntegrityRow> = sql_query("PRAGMA integrity_check")
        .load(connection)
        .map_err(|_| damaged())?;
    if integrity.len() != 1 || integrity[0].integrity_check != "ok" {
        return Err(damaged());
    }
    let tables: Vec<NameRow> = sql_query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .load(connection)
        .map_err(|_| not_vise())?;
    if !REQUIRED_TABLES
        .iter()
        .all(|t| tables.iter().any(|row| row.name == *t))
    {
        return Err(not_vise());
    }

    let known: Vec<String> =
        diesel::migration::MigrationSource::<diesel::sqlite::Sqlite>::migrations(&MIGRATIONS)
            .map_err(|e| AppError::InvalidRequest(format!("Could not list migrations: {e}")))?
            .iter()
            .map(|m| m.name().version().to_string())
            .collect();
    let applied = connection.applied_migrations().map_err(|_| not_vise())?;
    if applied
        .iter()
        .any(|version| !known.contains(&version.to_string()))
    {
        return Err(file_error(
            "This backup was made by a newer version of VISE. Update the app and try again",
        ));
    }
    Ok(())
}

fn summarize(connection: &mut SqliteConnection) -> Result<BackupSummary, AppError> {
    let overview = get_data_overview(connection)?;
    let oldest: Option<i64> = transactions::table
        .select(diesel::dsl::min(transactions::occurred_at))
        .first(connection)?;
    let newest: Option<i64> = transactions::table
        .select(diesel::dsl::max(transactions::occurred_at))
        .first(connection)?;
    Ok(BackupSummary {
        transactions: overview.transactions,
        categories: overview.categories,
        income_sources: overview.income_sources,
        budgets: overview.budgets,
        first_transaction_date: oldest.and_then(day),
        last_transaction_date: newest.and_then(day),
    })
}

/// Writes the database copy to `scratch`, checks it, brings it up to date and returns it open.
/// A backup from an older VISE is migrated here, on the copy, never on the live database.
fn open_verified(scratch: &Path, payload: &[u8]) -> Result<SqliteConnection, AppError> {
    let _ = fs::remove_file(scratch);
    fs::write(scratch, payload).map_err(|e| io_error("prepare the backup", e))?;
    let outcome = (|| {
        let url = scratch
            .to_str()
            .ok_or_else(|| file_error("Unsupported file location"))?;
        let mut connection = SqliteConnection::establish(url).map_err(|_| damaged())?;
        check_is_vise_database(&mut connection)?;
        configure_connection(&mut connection)?;
        connection
            .run_pending_migrations(MIGRATIONS)
            .map_err(|e| AppError::InvalidRequest(format!("Could not upgrade the backup: {e}")))?;
        Ok(connection)
    })();
    if outcome.is_err() {
        let _ = fs::remove_file(scratch);
    }
    outcome
}

// ----- Files -----

fn clean_path(path: &str) -> Result<PathBuf, AppError> {
    let path = path.trim();
    let path = path.strip_prefix("file://").unwrap_or(path);
    if path.is_empty() {
        return Err(AppError::validation("path", "No file was given"));
    }
    Ok(PathBuf::from(path))
}

fn read_backup(path: &Path) -> Result<Vec<u8>, AppError> {
    let size = fs::metadata(path)
        .map_err(|e| io_error("open the backup file", e))?
        .len();
    if size > MAX_BACKUP_BYTES {
        return Err(file_error("This file is too large to be a VISE backup"));
    }
    fs::read(path).map_err(|e| io_error("read the backup file", e))
}

/// Writes next to the destination and renames, so a crash never leaves half a backup under the final name.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let partial = with_suffix(path, ".partial");
    fs::write(&partial, bytes).map_err(|e| io_error("write the backup", e))?;
    fs::rename(&partial, path).map_err(|e| {
        let _ = fs::remove_file(&partial);
        io_error("save the backup", e)
    })
}

// ----- Public API -----

/// Writes a backup of the whole database to `input.path`.
pub fn create(
    connection: &mut SqliteConnection,
    input: &CreateInput,
) -> Result<BackupInfo, AppError> {
    let path = clean_path(&input.path)?;
    let passphrase = clean_passphrase(input.passphrase.as_deref())?;
    let summary = summarize(connection)?;

    let snapshot = with_suffix(&path, ".snapshot");
    let _ = fs::remove_file(&snapshot);
    sql_query("VACUUM INTO ?")
        .bind::<Text, _>(snapshot.to_string_lossy().into_owned())
        .execute(connection)?;
    let payload = fs::read(&snapshot);
    let _ = fs::remove_file(&snapshot);
    let payload = payload.map_err(|e| io_error("read the database copy", e))?;

    let created_at = Utc::now().timestamp();
    let bytes = seal(&payload, passphrase, created_at)?;
    write_atomically(&path, &bytes)?;
    Ok(BackupInfo {
        path: input.path.clone(),
        bytes: bytes.len() as u64,
        encrypted: passphrase.is_some(),
        created_at: iso(created_at),
        summary,
    })
}

/// Reads a backup file and says what is in it, without changing anything. A protected file
/// reports `needs_passphrase` until the right passphrase is given.
pub fn inspect(input: &OpenInput) -> Result<BackupInspection, AppError> {
    let path = clean_path(&input.path)?;
    match unseal(&read_backup(&path)?, input.passphrase.as_deref())? {
        Opened::NeedsPassphrase { created_at } => Ok(BackupInspection {
            encrypted: true,
            needs_passphrase: true,
            created_at: iso(created_at),
            summary: None,
        }),
        Opened::Ready {
            created_at,
            encrypted,
            payload,
        } => {
            let scratch = with_suffix(&path, ".inspect");
            let mut connection = open_verified(&scratch, &payload)?;
            let summary = summarize(&mut connection);
            drop(connection);
            let _ = fs::remove_file(&scratch);
            Ok(BackupInspection {
                encrypted,
                needs_passphrase: false,
                created_at: iso(created_at),
                summary: Some(summary?),
            })
        }
    }
}

/// Replaces the database at `live` (open in `slot`) with the backup. All or nothing: if anything
/// fails, the current database is still there, and still open.
pub fn restore(
    slot: &mut Option<SqliteConnection>,
    live: &Path,
    input: &OpenInput,
) -> Result<BackupInspection, AppError> {
    let path = clean_path(&input.path)?;
    let (created_at, encrypted, payload) =
        match unseal(&read_backup(&path)?, input.passphrase.as_deref())? {
            Opened::Ready {
                created_at,
                encrypted,
                payload,
            } => (created_at, encrypted, payload),
            Opened::NeedsPassphrase { .. } => {
                return Err(AppError::validation(
                    "passphrase",
                    "This backup is protected. Enter its passphrase",
                ));
            }
        };

    // Stage next to the live file so the final rename never crosses a filesystem.
    let staged = live.with_extension("restore.db");
    let mut connection = open_verified(&staged, &payload)?;
    let prepared = (|| {
        // A folder address only means something on the phone that chose it.
        diesel::update(app_settings::table.filter(app_settings::id.eq(1)))
            .set(app_settings::backup_folder.eq(None::<String>))
            .execute(&mut connection)?;
        summarize(&mut connection)
    })();
    drop(connection);
    let summary = match prepared {
        Ok(summary) => summary,
        Err(error) => {
            let _ = fs::remove_file(&staged);
            return Err(error);
        }
    };

    swap_in(slot, live, &staged)?;
    Ok(BackupInspection {
        encrypted,
        needs_passphrase: false,
        created_at: iso(created_at),
        summary: Some(summary),
    })
}

fn swap_in(
    slot: &mut Option<SqliteConnection>,
    live: &Path,
    staged: &Path,
) -> Result<(), AppError> {
    let reopen = |path: &Path| {
        establish_connection(path)
            .map_err(|e| AppError::InvalidRequest(format!("Could not open the database: {e}")))
    };
    let old = live.with_extension("old");
    let _ = fs::remove_file(&old);

    *slot = None; // closes the open database
    let had_live = live.exists();
    if had_live && let Err(error) = fs::rename(live, &old) {
        *slot = establish_connection(live).ok();
        let _ = fs::remove_file(staged);
        return Err(io_error("replace the database", error));
    }
    for suffix in ["-journal", "-wal", "-shm"] {
        let _ = fs::remove_file(with_suffix(live, suffix));
    }

    let swapped = fs::rename(staged, live)
        .map_err(|e| io_error("replace the database", e))
        .and_then(|()| reopen(live));
    match swapped {
        Ok(connection) => {
            *slot = Some(connection);
            let _ = fs::remove_file(&old);
            Ok(())
        }
        Err(error) => {
            // Put the old database back.
            let _ = fs::remove_file(live);
            if had_live {
                let _ = fs::rename(&old, live);
            }
            let _ = fs::remove_file(staged);
            *slot = establish_connection(live).ok();
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests;
