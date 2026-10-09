-- ============================================================
-- Captured payments: the inbox for payments VISE noticed
--
-- A payment notification from an allowed app (Google Pay, PhonePe, Revolut,
-- PayPal ...) becomes a row here, waiting for the user to confirm it. Only on
-- confirmation does it become a real transaction, so an unconfirmed payment
-- never touches a total.
--
-- `excerpt` is the notification's own text, kept only so the user can see what
-- was read. It is emptied the moment the row is confirmed or dismissed.
-- ============================================================

CREATE TABLE captured_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Which app the notification came from, e.g. 'googlepay'.
    app TEXT NOT NULL,

    -- NULL when the notification had an amount but it was not clear which way the money went.
    direction TEXT CHECK (direction IS NULL OR direction IN ('expense', 'income')),
    amount_cents BIGINT CHECK (amount_cents IS NULL OR amount_cents > 0),
    -- NULL for a bare '$' or no currency; the user's own currency is used on confirmation.
    currency TEXT CHECK (currency IS NULL OR length(currency) = 3),

    merchant TEXT,
    -- A transaction / UPI reference when the notification had one.
    reference TEXT,

    -- When the notification was posted (unix seconds) and the phone's local date then.
    occurred_at BIGINT NOT NULL,
    occurred_on TEXT NOT NULL,

    excerpt TEXT NOT NULL DEFAULT '',

    suggested_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
    -- 1 if a transaction with the same day, amount and type already exists.
    possible_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (possible_duplicate IN (0, 1)),

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

    -- The same notification posted twice must not be captured twice. Kept after the row is resolved.
    fingerprint TEXT NOT NULL UNIQUE,

    created_at BIGINT NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_captured_payments_status ON captured_payments(status, occurred_at DESC);
