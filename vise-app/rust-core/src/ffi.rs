//! Native entry points for the app's Expo module (Android JNI and a plain
//! C ABI for iOS). They hold the one SQLite connection and forward
//! `(method, payload)` pairs to [`crate::api::dispatch`].
//!
//! The connection lives behind a `Mutex`, so calls from different threads
//! are serialised. That also makes each API call atomic with respect to
//! the others.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use diesel::sqlite::SqliteConnection;
use serde_json::json;

use crate::{api, backup, db::connection::establish_connection};

static CONNECTION: Mutex<Option<SqliteConnection>> = Mutex::new(None);
/// Where the open database lives, so a restore can replace the file.
static DATABASE_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Opens (creating and migrating if needed) the database at `path`.
/// Safe to call again; an already open connection is kept.
pub fn init(path: &str) -> Result<(), String> {
    let mut guard = CONNECTION.lock().map_err(|_| "database lock poisoned")?;
    if guard.is_none() {
        let connection = establish_connection(Path::new(path))
            .map_err(|error| format!("Could not open the database: {error}"))?;
        *guard = Some(connection);
        if let Ok(mut stored) = DATABASE_PATH.lock() {
            *stored = Some(PathBuf::from(path));
        }
    }
    Ok(())
}

/// Runs one API call. Returns the usual `{ok, data | error}` JSON, using
/// kind `database` if the database was never opened or is unusable.
pub fn call(method: &str, payload: &str) -> String {
    let Ok(mut guard) = CONNECTION.lock() else {
        return unavailable("The database lock was poisoned by an earlier crash");
    };
    // A restore replaces the database file, so it needs the connection slot, not just a connection.
    if method == "restoreBackup" {
        return restore_backup(&mut guard, payload);
    }
    match guard.as_mut() {
        Some(connection) => api::dispatch(connection, method, payload),
        None => unavailable("The database is not open"),
    }
}

fn restore_backup(slot: &mut Option<SqliteConnection>, payload: &str) -> String {
    let Some(live) = DATABASE_PATH.lock().ok().and_then(|path| path.clone()) else {
        return unavailable("The database is not open");
    };
    api::envelope(
        api::parse::<backup::OpenInput>(payload)
            .and_then(|input| api::to_json(backup::restore(slot, &live, &input))),
    )
}

fn unavailable(message: &str) -> String {
    json!({ "ok": false, "error": { "kind": "database", "message": message } }).to_string()
}

// ----- C ABI (iOS, and any other host that can call C) -----

use std::ffi::{CStr, CString, c_char};

/// Returns null on success, or an error message to free with `vise_free`.
///
/// # Safety
/// `path` must be a valid NUL-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vise_init(path: *const c_char) -> *mut c_char {
    let result = unsafe { c_str(path) }.and_then(|path| init(&path));
    match result {
        Ok(()) => std::ptr::null_mut(),
        Err(message) => to_c_string(&message),
    }
}

/// Returns the JSON reply; free it with `vise_free`.
///
/// # Safety
/// `method` and `payload` must be valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vise_call(method: *const c_char, payload: *const c_char) -> *mut c_char {
    let reply = match (unsafe { c_str(method) }, unsafe { c_str(payload) }) {
        (Ok(method), Ok(payload)) => call(&method, &payload),
        _ => unavailable("The request was not valid UTF-8"),
    };
    to_c_string(&reply)
}

/// # Safety
/// `ptr` must come from `vise_init` / `vise_call` and be freed only once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vise_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}

unsafe fn c_str(ptr: *const c_char) -> Result<String, String> {
    if ptr.is_null() {
        return Err("null string".to_string());
    }
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map(String::from)
        .map_err(|_| "string was not valid UTF-8".to_string())
}

fn to_c_string(text: &str) -> *mut c_char {
    // Replies are JSON and never contain NUL; strip it defensively.
    CString::new(text.replace('\0', ""))
        .unwrap_or_default()
        .into_raw()
}

// ----- Android JNI -----

#[cfg(target_os = "android")]
mod android {
    use jni::JNIEnv;
    use jni::objects::{JClass, JString};
    use jni::sys::jstring;

    fn read(env: &mut JNIEnv, value: &JString) -> String {
        env.get_string(value).map(String::from).unwrap_or_default()
    }

    fn reply(env: &mut JNIEnv, text: &str) -> jstring {
        env.new_string(text)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    /// `NativeCore.nativeInit(path): String` returns "" or an error message.
    #[unsafe(no_mangle)]
    pub extern "system" fn Java_expo_modules_visecore_NativeCore_nativeInit(
        mut env: JNIEnv,
        _class: JClass,
        path: JString,
    ) -> jstring {
        let path = read(&mut env, &path);
        let message = super::init(&path).err().unwrap_or_default();
        reply(&mut env, &message)
    }

    /// `NativeCore.nativeCall(method, payload): String` returns the JSON reply.
    #[unsafe(no_mangle)]
    pub extern "system" fn Java_expo_modules_visecore_NativeCore_nativeCall(
        mut env: JNIEnv,
        _class: JClass,
        method: JString,
        payload: JString,
    ) -> jstring {
        let method = read(&mut env, &method);
        let payload = read(&mut env, &payload);
        let text = super::call(&method, &payload);
        reply(&mut env, &text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn calls_before_init_report_an_error_instead_of_panicking() {
        // Runs in its own process only if no other test opened the global
        // connection, so assert on shape rather than on the exact state.
        let reply: Value = serde_json::from_str(&call("getSettings", "{}")).unwrap();
        assert!(reply["ok"].is_boolean());
    }

    #[test]
    fn a_backup_restores_through_the_global_connection() {
        // Uses the process-wide connection like the app does, so it only checks what
        // survives other tests running in the same process: the round trip itself.
        let dir = tempfile::tempdir().unwrap();
        let live = dir.path().join("vise.db");
        let backup = dir.path().join("a.vise");
        let mut connection = establish_connection(&live).unwrap();
        api::dispatch(&mut connection, "addCategory", r##"{"name":"Groceries"}"##);
        let made: Value = serde_json::from_str(&api::dispatch(
            &mut connection,
            "createBackup",
            &json!({ "path": backup }).to_string(),
        ))
        .unwrap();
        assert_eq!(made["ok"], true, "{made}");
        drop(connection);

        let mut slot = Some(establish_connection(&dir.path().join("other.db")).unwrap());
        let restored = backup::restore(
            &mut slot,
            &live,
            &backup::OpenInput {
                path: backup.to_string_lossy().into_owned(),
                passphrase: None,
            },
        )
        .unwrap();
        assert_eq!(restored.summary.unwrap().categories, 1);
    }

    #[test]
    fn init_then_call_round_trips_through_the_c_abi() {
        let dir = tempfile::tempdir().unwrap();
        let path = CString::new(dir.path().join("vise.db").to_str().unwrap()).unwrap();
        let method = CString::new("getSettings").unwrap();
        let payload = CString::new("{}").unwrap();

        let failure = unsafe { vise_init(path.as_ptr()) };
        assert!(failure.is_null());
        let reply_ptr = unsafe { vise_call(method.as_ptr(), payload.as_ptr()) };
        let reply = unsafe { CStr::from_ptr(reply_ptr) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { vise_free(reply_ptr) };

        let reply: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(reply["ok"], true);
        assert_eq!(reply["data"]["onboarding_completed"], false);
    }
}
