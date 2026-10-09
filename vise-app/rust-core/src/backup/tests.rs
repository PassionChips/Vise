use super::*;
use crate::db::connection::{establish_connection, establish_connection_test};
use crate::repository::transaction_repository::get_all;
use crate::service::settings::UpdateSettingsInput;
use crate::service::{self, NewCategoryInput, NewTransactionInput};

fn populate(conn: &mut SqliteConnection) {
    let category = service::add_category(
        conn,
        &NewCategoryInput {
            name: "Groceries".into(),
            icon: None,
            color: None,
        },
    )
    .unwrap()
    .id
    .unwrap();
    for (description, date) in [("Lidl Berlin", "2026-09-01"), ("Shell", "2026-09-20")] {
        service::add_transaction(
            conn,
            &NewTransactionInput {
                transaction_type: "expense".into(),
                amount: "12.50".into(),
                currency: "EUR".into(),
                description: description.into(),
                date: date.into(),
                expense_category_id: Some(category),
                income_source_id: None,
            },
        )
        .unwrap();
    }
}

fn settings_input() -> UpdateSettingsInput {
    UpdateSettingsInput {
        backup_folder: None,
        currency: None,
        display_name: None,
        monthly_income: None,
        income_source_id: None,
        warning_threshold_percent: None,
        theme: None,
        avatar: None,
    }
}

fn open_input(path: &Path, passphrase: Option<&str>) -> OpenInput {
    OpenInput {
        path: path.to_string_lossy().into_owned(),
        passphrase: passphrase.map(String::from),
    }
}

fn make_backup(
    conn: &mut SqliteConnection,
    dir: &Path,
    name: &str,
    passphrase: Option<&str>,
) -> PathBuf {
    let path = dir.join(name);
    create(
        conn,
        &CreateInput {
            path: path.to_string_lossy().into_owned(),
            passphrase: passphrase.map(String::from),
        },
    )
    .unwrap();
    path
}

/// A live database on disk, like the app's `vise.db`, with a connection to it.
fn live_database(dir: &Path) -> (PathBuf, Option<SqliteConnection>) {
    let live = dir.join("vise.db");
    let conn = establish_connection(&live).unwrap();
    (live, Some(conn))
}

fn descriptions(conn: &mut SqliteConnection) -> Vec<String> {
    let mut names: Vec<String> = get_all(conn)
        .unwrap()
        .into_iter()
        .map(|t| t.description)
        .collect();
    names.sort();
    names
}

fn file_names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn a_backup_restores_everything_into_a_fresh_install() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let backup = make_backup(&mut source, dir.path(), "a.vise", None);

    let fresh = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(fresh.path());
    let restored = restore(&mut slot, &live, &open_input(&backup, None)).unwrap();

    let summary = restored.summary.unwrap();
    assert_eq!((summary.transactions, summary.categories), (2, 1));
    assert_eq!(
        summary.first_transaction_date.as_deref(),
        Some("2026-09-01")
    );
    assert_eq!(summary.last_transaction_date.as_deref(), Some("2026-09-20"));
    assert_eq!(
        descriptions(slot.as_mut().unwrap()),
        ["Lidl Berlin", "Shell"]
    );
    assert_eq!(
        file_names(fresh.path()),
        ["vise.db"],
        "no staging or old files are left behind"
    );
}

#[test]
fn restoring_replaces_what_was_on_the_phone() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let backup = make_backup(&mut source, dir.path(), "a.vise", None);

    let phone = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(phone.path());
    service::add_transaction(
        slot.as_mut().unwrap(),
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "1".into(),
            currency: "EUR".into(),
            description: "Only on this phone".into(),
            date: "2026-10-01".into(),
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();

    restore(&mut slot, &live, &open_input(&backup, None)).unwrap();
    assert_eq!(
        descriptions(slot.as_mut().unwrap()),
        ["Lidl Berlin", "Shell"]
    );
}

#[test]
fn a_protected_backup_needs_its_passphrase_and_hides_the_data() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let backup = make_backup(&mut source, dir.path(), "a.vise", Some("correct horse"));

    let bytes = fs::read(&backup).unwrap();
    assert!(
        !bytes.windows(11).any(|w| w == b"Lidl Berlin"),
        "the file must not contain readable data"
    );
    assert!(!bytes.windows(15).any(|w| w == b"SQLite format 3"));

    let locked = inspect(&open_input(&backup, None)).unwrap();
    assert!(locked.encrypted && locked.needs_passphrase && locked.summary.is_none());

    let wrong = inspect(&open_input(&backup, Some("wrong guess"))).unwrap_err();
    assert!(
        matches!(&wrong, AppError::Validation { field, .. } if field == "passphrase"),
        "{wrong:?}"
    );

    let open = inspect(&open_input(&backup, Some("correct horse"))).unwrap();
    assert!(open.encrypted && !open.needs_passphrase);
    assert_eq!(open.summary.unwrap().transactions, 2);

    let phone = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(phone.path());
    let refused = restore(&mut slot, &live, &open_input(&backup, None)).unwrap_err();
    assert!(
        matches!(&refused, AppError::Validation { field, .. } if field == "passphrase"),
        "{refused:?}"
    );
    assert!(slot.is_some());
}

#[test]
fn a_protected_backup_restores_with_the_right_passphrase() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let backup = make_backup(&mut source, dir.path(), "a.vise", Some("correct horse"));

    let fresh = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(fresh.path());
    restore(
        &mut slot,
        &live,
        &open_input(&backup, Some("correct horse")),
    )
    .unwrap();
    assert_eq!(descriptions(slot.as_mut().unwrap()).len(), 2);
}

#[test]
fn passphrases_must_be_long_enough_and_blank_means_none() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    let path = dir.path().join("a.vise").to_string_lossy().into_owned();
    let short = create(
        &mut source,
        &CreateInput {
            path: path.clone(),
            passphrase: Some("short".into()),
        },
    );
    assert!(short.is_err());
    let blank = create(
        &mut source,
        &CreateInput {
            path,
            passphrase: Some(String::new()),
        },
    )
    .unwrap();
    assert!(!blank.encrypted);
}

#[test]
fn damaged_files_are_rejected_and_nothing_changes() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);

    let phone = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(phone.path());
    populate(slot.as_mut().unwrap());

    for passphrase in [None, Some("correct horse")] {
        let good = make_backup(&mut source, dir.path(), "good.vise", passphrase);
        let bytes = fs::read(&good).unwrap();
        let mut flipped = bytes.clone();
        let last = flipped.len() - 1;
        flipped[last] ^= 0xff;
        let truncated = bytes[..bytes.len() / 2].to_vec();
        for (name, content) in [
            ("flipped.vise", flipped),
            ("truncated.vise", truncated),
            ("empty.vise", vec![]),
            ("junk.vise", b"hello world, not a backup".to_vec()),
        ] {
            let path = dir.path().join(name);
            fs::write(&path, content).unwrap();
            assert!(
                restore(&mut slot, &live, &open_input(&path, passphrase)).is_err(),
                "{name} with {passphrase:?}"
            );
        }
    }
    assert!(slot.is_some(), "the database is still open");
    assert_eq!(
        descriptions(slot.as_mut().unwrap()),
        ["Lidl Berlin", "Shell"]
    );
    assert_eq!(file_names(phone.path()), ["vise.db"]);
}

#[test]
fn another_apps_database_is_not_accepted() {
    let dir = tempfile::tempdir().unwrap();
    let foreign = dir.path().join("foreign.db");
    let mut conn = SqliteConnection::establish(foreign.to_str().unwrap()).unwrap();
    sql_query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)")
        .execute(&mut conn)
        .unwrap();
    drop(conn);
    let path = dir.path().join("foreign.vise");
    fs::write(&path, seal(&fs::read(&foreign).unwrap(), None, 0).unwrap()).unwrap();

    let error = inspect(&open_input(&path, None)).unwrap_err();
    assert!(error.to_string().contains("not a VISE backup"), "{error}");
    // The scratch copy is cleaned up.
    assert_eq!(file_names(dir.path()), ["foreign.db", "foreign.vise"]);
}

#[test]
fn a_backup_from_a_newer_vise_is_refused_with_a_clear_message() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    sql_query("INSERT INTO __diesel_schema_migrations (version) VALUES ('29990101000000')")
        .execute(&mut source)
        .unwrap();
    let path = make_backup(&mut source, dir.path(), "future.vise", None);
    let error = inspect(&open_input(&path, None)).unwrap_err();
    assert!(error.to_string().contains("newer version"), "{error}");

    let mut future_format = fs::read(&path).unwrap();
    future_format[8] = 0x80;
    let path = dir.path().join("future-format.vise");
    fs::write(&path, future_format).unwrap();
    assert!(
        inspect(&open_input(&path, None))
            .unwrap_err()
            .to_string()
            .contains("newer version")
    );
}

#[test]
fn a_backup_from_an_older_vise_is_upgraded_on_restore() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    // Make the source look like an older VISE: undo the newest migration (the backup columns).
    source.revert_last_migration(MIGRATIONS).unwrap();
    let path = make_backup(&mut source, dir.path(), "old.vise", None);

    let info = inspect(&open_input(&path, None)).unwrap();
    assert_eq!(info.summary.unwrap().transactions, 2);

    let fresh = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(fresh.path());
    restore(&mut slot, &live, &open_input(&path, None)).unwrap();
    let settings = service::settings::get_settings(slot.as_mut().unwrap()).unwrap();
    assert_eq!(
        (settings.backup_folder, settings.last_backup_at),
        (None, None)
    );
    assert_eq!(descriptions(slot.as_mut().unwrap()).len(), 2);
}

#[test]
fn the_folder_address_is_forgotten_but_the_rest_of_the_settings_come_back() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    service::settings::update_settings(
        &mut source,
        &UpdateSettingsInput {
            backup_folder: Some("content://folder/on/old/phone".into()),
            display_name: Some("Riya".into()),
            currency: Some("INR".into()),
            ..settings_input()
        },
    )
    .unwrap();
    service::settings::mark_backup_done(&mut source).unwrap();
    let backup = make_backup(&mut source, dir.path(), "a.vise", None);

    let fresh = tempfile::tempdir().unwrap();
    let (live, mut slot) = live_database(fresh.path());
    restore(&mut slot, &live, &open_input(&backup, None)).unwrap();
    let settings = service::settings::get_settings(slot.as_mut().unwrap()).unwrap();
    assert_eq!(settings.backup_folder, None);
    assert_eq!(
        (settings.display_name.as_deref(), settings.currency.as_str()),
        (Some("Riya"), "INR")
    );
    assert!(settings.last_backup_at.is_some());
}

#[test]
fn creating_a_backup_leaves_only_the_backup_and_overwrites_an_old_one() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let path = make_backup(&mut source, dir.path(), "a.vise", None);
    assert_eq!(file_names(dir.path()), ["a.vise"]);

    service::add_transaction(
        &mut source,
        &NewTransactionInput {
            transaction_type: "expense".into(),
            amount: "3".into(),
            currency: "EUR".into(),
            description: "Third".into(),
            date: "2026-09-25".into(),
            expense_category_id: None,
            income_source_id: None,
        },
    )
    .unwrap();
    make_backup(&mut source, dir.path(), "a.vise", None);
    assert_eq!(
        inspect(&open_input(&path, None))
            .unwrap()
            .summary
            .unwrap()
            .transactions,
        3
    );
    assert_eq!(file_names(dir.path()), ["a.vise"]);
}

#[test]
fn file_uris_and_missing_files_are_handled() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let path = dir.path().join("a.vise");
    create(
        &mut source,
        &CreateInput {
            path: format!("file://{}", path.display()),
            passphrase: None,
        },
    )
    .unwrap();
    assert!(inspect(&open_input(&path, None)).is_ok());
    assert!(inspect(&open_input(&dir.path().join("missing.vise"), None)).is_err());
    assert!(
        inspect(&OpenInput {
            path: "  ".into(),
            passphrase: None
        })
        .is_err()
    );
}

#[test]
fn a_hostile_file_cannot_ask_for_huge_key_derivation() {
    let dir = tempfile::tempdir().unwrap();
    let mut source = establish_connection_test().unwrap();
    populate(&mut source);
    let path = make_backup(&mut source, dir.path(), "a.vise", Some("correct horse"));
    let mut bytes = fs::read(&path).unwrap();
    bytes[HEADER_LEN..HEADER_LEN + 4].copy_from_slice(&u32::MAX.to_be_bytes());
    fs::write(&path, bytes).unwrap();
    assert!(inspect(&open_input(&path, Some("correct horse"))).is_err());
}
