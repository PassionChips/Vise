# Backup and restore

The user decides where their data goes. Nothing leaves the phone unless they back it up: Android's own
backup is switched off (`android:allowBackup="false"`) and iOS excludes the database from iCloud backups.

```
Settings → Backup & restore ─▶ rust-core backup file (.vise) ─▶ a folder the user picked (survives deleting the app)
                                                                 or the share sheet (Drive, Files, email)
Welcome → "I already use VISE" ─▶ pick the file ─▶ (passphrase) ─▶ confirm ─▶ restore ─▶ Dashboard
```

Google Drive is planned as a second destination (see "Not built yet").

## The file

`rust-core/src/backup.rs`. One `.vise` file holds a consistent copy of the whole SQLite database
(`VACUUM INTO`): transactions, categories, income sources, budgets and settings.

| | |
|---|---|
| Header | `VISEBAK1`, flags, creation time |
| No passphrase | SHA-256 of the payload, then the payload. A damaged or cut-off file is detected |
| With a passphrase | Argon2id (19 MiB, 2 passes) derives an AES-256-GCM key. The header is authenticated too. A wrong passphrase and a damaged file both fail the same way |
| Passphrase | Optional, at least 8 characters, never stored. **A forgotten passphrase cannot be recovered** |

## Functions

| Step | Function | Does |
|---|---|---|
| Back up | `backup::create` (`createBackup`) | Writes the file to a path in the app cache |
| Save it | `backUpToFolder` (`src/data/backupFiles.ts`) | Copies it into the chosen folder, checks the size arrived, keeps the newest 3, then `markBackupDone` |
| Share a copy | `shareBackup` | System share sheet. Not recorded as a backup, because VISE cannot know where it ended up |
| Look inside | `backup::inspect` (`inspectBackup`) | Counts, dates, whether it needs a passphrase. Changes nothing |
| Restore | `backup::restore` (`restoreBackup`, handled in `ffi::call`) | See below |

## A restore cannot half-happen

1. Decrypt and check the file's integrity.
2. Stage the database next to the live one and check it: SQLite integrity, the tables VISE needs, and that it was not
   made by a **newer** VISE (refused with "update the app").
3. A backup from an **older** VISE is upgraded on the staged copy (migrations), never on the live database.
4. The remembered folder address is cleared (it only means something on the phone that chose it).
5. Only then the live database is closed, renamed aside, the staged copy renamed into place and reopened. If any
   step fails the old database is put back and reopened.

A bad file, a wrong passphrase or a file from a newer app leaves the current data untouched (tested).

## Onboarding

The last step, after everything is saved, is "Never lose your data": choose a folder and back up, optionally with a
passphrase. **Skip** shows a warning first ("it can't be recovered") whose highlighted button is *Back up now*;
*Skip anyway* continues. The warning appears once; nothing nags afterwards except the status in Settings
(a warning if never backed up, or if the last backup is 30+ days old).

## Limits and notes

- After deleting the app the folder is forgotten (permissions go with the app), so the user picks the **file** again in
  the restore screen. The screen says where to look.
- A file in shared storage can be read by other apps with file access. That is why a passphrase is offered.
- The folder permission may not survive every phone's restart. If saving fails, the screen asks the user to choose the
  folder again (`BackupFolderError`).
- Keeping the **package id** stable matters for Google Drive later, not for file backups.
- "Delete all my data" does not delete backup files saved elsewhere, and says so.

## Not built yet

- **Google Drive** (sign-in, private app-data folder, versions). Needs a Google Cloud OAuth client tied to the package
  name and signing key.
- **Automatic backups** (when the app goes to the background) and an encrypted-backup passphrase kept in the keystore.
- **iOS folder choice with automatic updates.** Today iOS users use "Share a backup copy" → Save to Files.
- The Swift changes (`recognizeText` is separate; here the iCloud exclusion in `ViseCoreModule.swift`) are not compiled yet.

## After pulling this

New Rust crates (crypto) and a changed Android manifest: run `./scripts/build-android-core.sh`,
`npx expo prebuild --platform android`, then `npx expo run:android`.
