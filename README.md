# VISE — Monthly Budget & Spending Estimator

A cross-platform (iOS + Android) budgeting app. The UI is React Native + Expo;
all business logic (validation, budget maths, analytics, predictions) and all
storage (SQLite) live in a Rust crate, `rust-core`.

**Offline-first:** all data stays in SQLite on the device. There is no server,
no account and no cloud sync.

**Goals**
- Track income sources and expense categories
- Set a monthly spending limit, a savings target and per-category limits
- Log transactions; import them from CSV
- See a monthly summary of spending vs. budget, with over-limit warnings
- See report charts and a prediction of next month's spending

**Non-goals (MVP):** cloud sync, multiple users, live bank integrations.

---

## Current status

| Area | Status |
|---|---|
| Database schema & migrations | ✅ Done |
| Repositories (CRUD per table) | ✅ Done |
| CSV import (`import_csv` binary) | ✅ Done |
| Budget calculations, analytics, predictions | ✅ Done (pure Rust, unit-tested) |
| Validation + use-case layer (`service`) | ✅ Done |
| JSON API for the frontend (`api::dispatch`) | ✅ Done |
| TypeScript client for the API (`src/services/viseCore.ts`) | ✅ Done (type-checked) |
| Native bridge (Expo module: Kotlin/Swift → Rust) | 🟡 Android: Rust library cross-compiles, module written, not yet run on a device. iOS: written, untested (needs macOS) |
| Onboarding (Figma "1 · Onboarding") | ✅ Saved atomically through `completeOnboarding`; completion persisted in `app_settings` |
| Main app screens + add/edit/delete flows | ✅ Read from and write to SQLite through `viseCore`; no demo data |

The app opens on onboarding until it has been saved, then the tab screens (Dashboard, Transactions,
Budgets, Reports, Settings). Every screen reads its data from SQLite through the Rust core, and every
change is validated and saved by Rust. If the native core is not built into the app, screens show an
error instead of sample data. See [docs/PERSISTENCE.md](docs/PERSISTENCE.md) for the data flow, schema,
onboarding mapping and tests.

---

## Project structure

```
Vise/
├── .github/workflows/        CI: Rust tests, clippy + fmt, TypeScript type-check
└── vise-app/                 Expo app
    ├── app/                  Expo Router routes: onboarding, (tabs)/ for the 5 tabs, add-transaction, budget-form, edit-setting
    ├── src/components/       Design-system components (cards, charts, controls, nav)
    ├── src/theme/tokens.ts   Colours, spacing, radii and text styles from Figma
    ├── src/features/onboarding/  Onboarding steps, flow state and saving via viseCore
    ├── src/data/             useCoreQuery + invalidation, finance reads, form pickers
    ├── modules/vise-core/    Expo native module (Kotlin / Swift) that calls the Rust core
    ├── scripts/              build-android-core.sh, build-ios-core.sh
    ├── src/format.ts         Money and date display formatting
    ├── src/services/
    │   ├── types.ts          TS mirrors of the Rust JSON types
    │   └── viseCore.ts       The only file that calls Rust
    └── rust-core/            Rust crate: all logic and storage
        ├── migrations/       SQL migrations (run automatically on connect)
        ├── data/             Sample CSV for the importer
        ├── docs/             CSV import guide
        └── src/
            ├── lib.rs        Module list + layer overview
            ├── api.rs        JSON in → JSON out; the frontend's entry point
            ├── service.rs    Use cases: validate → load/save → calculate
            ├── calculations/ Pure budget maths (no database)
            │   ├── totals.rs        income/spending per month & category
            │   ├── budget_check.rs  spent vs. limit per category
            │   ├── summary.rs       monthly headline numbers
            │   ├── analytics.rs     category breakdown, monthly trend
            │   └── predictions.rs   next-month linear regression
            ├── repository/   One file of Diesel queries per table
            ├── models/       Structs mirroring table rows
            ├── db/           Connection, migrations, generated schema.rs
            ├── parser/       CSV importer
            ├── bin/import_csv.rs   CLI to import data/transactions.csv
            ├── error.rs      AppError (validation / not_found / …)
            ├── money.rs      "12.50" → 1250 cents, exactly
            └── month.rs      YearMonth ("YYYY-MM") and its timestamp range
```

---

## Setup

Requirements: Rust (stable, edition 2024, installed with `rustup`), a current Node.js LTS with npm.
Diesel CLI is optional. You only need it to create new migrations
(`cargo install diesel_cli --no-default-features --features sqlite-bundled`).

```bash
# Rust
cd vise-app/rust-core
cargo build

# App
cd vise-app
npm ci
```

SQLite is compiled in (`libsqlite3-sys` with the `bundled` feature), so there
is nothing to install system-wide.

## Running

```bash
# Start the Expo dev server
cd vise-app
npm start

# Import the sample CSV into rust-core/vise.db (created if missing)
cd vise-app/rust-core
cargo run --bin import_csv
```

`vise.db` is git-ignored. It holds personal financial data, so never commit it.

## Testing and linting

CI runs these on every PR; run them locally first:

```bash
# Rust: tests, lint (zero warnings), formatting
cd vise-app/rust-core
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
cargo fmt --check        # `cargo fmt` to fix

# TypeScript
cd vise-app
npx tsc --noEmit
npm test                 # Vitest: bridge client, onboarding payload, API contract, no-demo-data guards
```

Rust tests include `tests/persistence.rs` (a real SQLite file reopened between steps) and
`tests/contract.rs` (JSON shapes checked against `rust-core/contracts/api-shapes.json`).

Rust tests use an in-memory SQLite database
(`db::connection::establish_connection_test`), so they never touch `vise.db`.

---

## How the Rust backend is organised

Each layer only calls the layer below it:

```
frontend ──JSON──▶ api ──▶ service ──┬──▶ repository ──▶ SQLite
                                     └──▶ calculations (pure functions)
```

| Module | Responsibility | Talks to the DB? |
|---|---|---|
| `api` | Parse the JSON request, call `service`, wrap the result as `{ok, data}` / `{ok, error}` | No |
| `service` | Validate user input, load data, call calculations | Through repositories |
| `calculations` | Budget maths on already-loaded data | **No.** Pure functions, easy to test |
| `repository` | Plain Diesel queries, one module per table | Yes |
| `models` | Row structs (`Transaction`, `NewTransaction`, `UpdateTransaction`, …) | No |
| `db` | Opening connections, enabling foreign keys, running migrations | Yes |

**Example: "show September's summary"**

1. JS calls `getMonthlySummary('2026-09', 'EUR')` in `viseCore.ts`.
2. The bridge passes `("getMonthlySummary", '{"month":"2026-09","currency":"EUR"}')` to `api::dispatch`.
3. `service::get_monthly_summary` validates the month and currency, then loads
   that month's transactions, all categories, the budget month and its
   category limits.
4. `calculations::totals::month_totals` → `budget_check::check_categories` →
   `summary::build_summary` compute the result.
5. `api` serialises it to `{"ok":true,"data":{…}}` and JS gets a typed `MonthlySummary`.

### Budget rules (in `calculations/totals.rs`)

- Only transactions in the requested currency count. There is no currency conversion.
- `exclude_from_totals`, `reverted` and `failed` transactions are skipped; `pending` counts.
- `income` adds to income; `expense` adds to spending; `refund` subtracts from
  spending in its category; `transfer` is ignored.
- Months are calendar months in **UTC**, and dates are stored as midnight UTC.
- Money is always integer cents (`i64`). Parsing goes through `money.rs`, never `f64`.

### Predictions (in `calculations/predictions.rs`)

`predictSpending(month)` looks at up to 6 months before `month`. It skips the
empty months before your first recorded spending, then:
- 0 months of history → predicts 0 (`no_data`)
- 1–2 months → average (`average`)
- 3+ months → least-squares linear regression extended one month (`linear_regression`), clamped at ≥ 0

### Design decisions worth knowing

- **One `dispatch(method, payload)` entry point instead of one native function per feature.**
  The Kotlin/Swift bridge then only has to forward two strings. New features
  touch only Rust and `viseCore.ts`, never native code.
- **Frontend sends raw form strings** (`amount: "12,50"`, `date: "2026-09-15"`).
  Rust parses and validates them and returns errors with a `field` name, so
  the UI can highlight the right input without duplicating rules.
- **No traits or generic layers.** Every function takes a
  `&mut SqliteConnection`. There is one database and one implementation, so an
  abstraction would add indirection without solving anything.

---

## Frontend ⇄ Rust integration

`vise-app/src/services/viseCore.ts` loads a native module named `ViseCore`
with one method, `call(method: string, payloadJson: string): Promise<string>`.
Until that module exists, every call rejects with `ViseError` kind
`bridge_unavailable`.

| JS function | Method | Payload | Returns |
|---|---|---|---|
| `addTransaction` | `addTransaction` | `NewTransactionInput` | `Transaction` |
| `deleteTransaction` | `deleteTransaction` | `{id}` | `null` |
| `listTransactions` | `listTransactions` | `{month}` | `Transaction[]` (newest first) |
| `listCategories` | `listCategories` | — | `ExpenseCategory[]` |
| `addCategory` | `addCategory` | `{name, icon?, color?}` | `ExpenseCategory` |
| `listIncomeSources` | `listIncomeSources` | — | `IncomeSource[]` |
| `addIncomeSource` | `addIncomeSource` | `{name}` | `IncomeSource` |
| `setMonthBudget` | `setMonthBudget` | `{month, currency, spending_limit?, savings_target?}` | `BudgetMonth` |
| `setCategoryBudget` | `setCategoryBudget` | `{month, currency, expense_category_id, limit}` | `CategoryBudget` |
| `getMonthlySummary` | `getMonthlySummary` | `{month, currency}` | `MonthlySummary` |
| `getCategoryBreakdown` | `getCategoryBreakdown` | `{month, currency}` | `CategoryBreakdown[]` |
| `getSpendingTrend` | `getSpendingTrend` | `{month, currency, months}` (1–24) | `MonthSpending[]` |
| `predictSpending` | `predictSpending` | `{month, currency}` | `Prediction` |

Errors look like `{ "kind": "validation", "field": "amount", "message": "Amount must be greater than zero" }`.
The possible kinds are `validation`, `not_found`, `invalid_request`, `database` and (frontend only) `bridge_unavailable`.
Database errors show a generic message, so raw SQL errors never reach the UI.
Unknown payload fields are rejected, which catches typos early.

### Rust bridge

Implemented: `rust-core/src/ffi.rs` holds one connection (behind a `Mutex`) and exposes `api::dispatch`
through JNI (Android) and a C ABI (iOS). The Expo module `modules/vise-core` opens `vise.db` in the
app's private storage and forwards `call(method, payloadJson)`.

```bash
cd vise-app
./scripts/build-android-core.sh   # needs Android SDK + NDK, cargo-ndk, Rust Android targets
npx expo run:android              # a dev build; Expo Go cannot load the native module
```

The Android library cross-compiles in CI (`android-core.yml`). Running it on a device and the iOS module
(`scripts/build-ios-core.sh`, macOS only) are not yet verified. Details: [docs/PERSISTENCE.md](docs/PERSISTENCE.md).

New API methods: `getSettings`, `updateSettings`, `completeOnboarding`, `updateTransaction`,
`deleteCategoryBudget`. The `app_settings` table stores currency, name, expected monthly income, its income
source, warning threshold and whether onboarding finished.

---

## Database

SQLite, managed by Diesel. Migrations are embedded in the binary and run
automatically when a connection opens (`db::connection::establish_connection`),
so existing databases are upgraded in place.

| Table | Purpose |
|---|---|
| `income_sources` | Salary, freelance, … |
| `expense_categories` | Groceries, rent, … (name unique, case-insensitive) |
| `budget_months` | Spending limit & savings target per `(month, currency)` |
| `category_budgets` | Limit per category per budget month |
| `app_settings` | One row: currency, name, expected monthly income + its source, warning threshold, onboarding completion **(new)** |
| `transactions` | Every income/expense/refund/transfer, amounts in cents |
| `revolut_accounts`, `sync_state`, `auto_category_rules` | Reserved for post-MVP bank sync |

### Migration `2026-10-02-000000-0000_category_budgets`

This migration adds the `category_budgets` table with
`(budget_month_id, expense_category_id, limit_cents ≥ 0)`. Each
(month, category) pair is unique, and the row is removed automatically
(`ON DELETE CASCADE`) when its month or category is deleted.

It only adds a table, so no existing rows change. It was checked against a
copy of a real database: the transaction count and totals were identical
after migrating. `down.sql` drops the table.

To add a migration: `diesel migration generate <name>`, write `up.sql` and
`down.sql`, then regenerate `src/db/schema.rs` against a **scratch** database:

```bash
diesel migration run --database-url /tmp/scratch.db
diesel print-schema --database-url /tmp/scratch.db > src/db/schema.rs
```

### Dependencies

No new dependencies were added for the calculation/service/API work. It uses
the existing `diesel`, `serde`, `serde_json` and `chrono` crates. On the
frontend, `viseCore.ts` uses `requireOptionalNativeModule` from `expo`.

---

## Design

The design lives in Figma (*VISE — Design System*). The Figma page needs a
login and can't be read by tooling. To implement the screens, export the
frames as PNG (plus Dev Mode CSS or variables for colours, type and spacing)
into `vise-app/design/`.

Planned screens: Dashboard (monthly summary + category progress),
Transactions (list + add form), Categories & budgets, Reports (breakdown,
trend, prediction). Every data call they need already exists in `viseCore.ts`.

---

## Roadmap

1. **Native bridge**: verify on an Android device, then iOS (see [Rust bridge](#rust-bridge)).
2. **Screens & navigation** from the exported design, using React Navigation
   (bottom tabs). Each screen needs loading, empty and error states, and
   validation errors shown next to the matching `field`.
3. **Charts**: category breakdown and monthly trend, with the prediction shown alongside.
4. **Build pipeline**: cross-compile script plus `eas.json` build hooks for iOS and Android.
5. **Device testing**: on a physical iOS and Android device, covering small and large screens.

---

## Security notes

- No secrets or API keys. The app is fully offline.
- The SQLite file lives in app-private storage, and no data leaves the device.
- `.gitignore` covers `*.db` (and `-wal`/`-shm`), `.env*`, `target/`, `node_modules/` and `__pycache__/`.
- Keep dependencies on current stable versions with no known critical CVEs (CVSS ≥ 7.0).
