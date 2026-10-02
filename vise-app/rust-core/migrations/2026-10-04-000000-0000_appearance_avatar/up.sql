-- ============================================================
-- Appearance preference and avatar
--
-- Additive migration: existing rows keep their values; every
-- existing database gets theme = 'system' (follow the device)
-- and no avatar (initials are shown).
-- ============================================================

-- Light, Dark or follow the device (Settings › Appearance).
ALTER TABLE app_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system' CHECK (
    theme IN ('system', 'light', 'dark')
);

-- The preset avatar the user picked (e.g. 'cat'), or NULL for initials.
-- Valid ids are checked by rust-core (service::settings::AVATARS).
ALTER TABLE app_settings ADD COLUMN avatar TEXT CHECK (
    avatar IS NULL OR length(avatar) BETWEEN 1 AND 32
);
