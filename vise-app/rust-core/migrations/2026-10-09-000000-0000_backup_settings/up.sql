-- ============================================================
-- Backup status
--
-- Additive migration: existing databases get "never backed up"
-- and no remembered folder.
-- ============================================================

-- The folder the user chose for backups (an opaque address from the phone's file picker), or NULL.
-- It is only meaningful on this install, so a restore clears it.
ALTER TABLE app_settings ADD COLUMN backup_folder TEXT CHECK (
    backup_folder IS NULL OR length(backup_folder) BETWEEN 1 AND 2048
);

-- Unix time of the last backup that reached its destination, or NULL if there never was one.
ALTER TABLE app_settings ADD COLUMN last_backup_at BIGINT;
