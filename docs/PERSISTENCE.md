# Persistence: frontend ↔ Rust ↔ SQLite

How data gets from a form to the database and back, how onboarding is saved, and the checks that
protect all of it in CI.

## The rule

> Every persistent entry goes **frontend → Rust (validate + business logic) → SQLite**, and every
> screen **reads from SQLite through Rust**. There is no demo data, no mock reply and no fallback.

If the core is unavailable or a write fails, the user sees an error. Nothing pretends to succeed.

```
 form input                                                       screen
     │                                                              ▲
     ▼                                                              │
 viseCore.ts ──call(method, json)──▶ Expo module ──▶ rust-core ──▶ SQLite
 (mutate → invalidateData())          (Kotlin/Swift)  api → service → repository
     ▲                                                              │
     └────────────── useCoreQuery reloads every mounted screen ◀────┘
```

| Layer | File(s) | Does |
|---|---|---|
| Screens | `app/**`, `src/components/**` | Keep form state while editing; render what Rust returns |
| Data layer | `src/data/store.ts`, `finance.ts`, `pickers.ts` | `useCoreQuery` loads and reloads; `invalidateData()` fires after each successful write |
| Bridge client | `src/services/viseCore.ts` | The only TypeScript that calls Rust; reads use `call`, writes use `mutate` |
| Native module | `modules/vise-core/` | Opens `vise.db` in the app's private storage; forwards `(method, payload)` |
| FFI | `rust-core/src/ffi.rs` | One connection behind a `Mutex`; JNI (Android) and C ABI (iOS) |
| API / service / repository | `rust-core/src/{api,service,repository}` | JSON in/out, validation, transactions, SQL |

The database file is `vise.db` in the app's files directory (Android `filesDir`, iOS Application
Support). It survives app restarts and is removed only by uninstalling or clearing app data.

## Schema change

Migration `2026-10-03-000000-0000_app_settings` (additive: no existing table or row is touched).

`app_settings`: a single row (`id = 1`, enforced by a `CHECK`), created by the migration.

| Column | Meaning |
|---|---|
| `currency` | Default currency for new entries and what screens total in |
| `display_name` | Shown on the Dashboard and Settings |
| `monthly_income_cents` | Expected monthly income (onboarding / Settings). **Actual** income is always summed from transactions |
| `income_source_id` → `income_sources.id` | The source that income belongs to (e.g. "Salary") |
| `warning_threshold_percent` | When a category budget shows "near limit" (default 80) |
| `onboarding_completed_at` | `NULL` until onboarding was fully saved |

## Onboarding

What onboarding collects, and where each answer ends up:

| Answer | Stored in | Used by |
|---|---|---|
| Currency | `app_settings.currency` | Every screen's money formatting; new transactions and budgets |
| Monthly income | `app_settings.monthly_income_cents` **and** the income source in `app_settings.income_source_id` | Dashboard "Income" / "Remaining", Budgets "left to spend", Settings |
| Income source (default "Salary") | `income_sources` row, linked from settings | Settings › Income source; the first income transaction |
| Budget category + monthly limit | `expense_categories` row + `category_budgets` row (for the current month) | Budgets tab, Dashboard, over-limit alerts |
| First transaction | `transactions` row. Expense → its `expense_category_id`; income → `income_source_id` (the same source as above) | Transactions tab, summaries, charts |

`complete_onboarding` (`rust-core/src/service/settings.rs`):

* validates **everything** first, so bad input never reaches the database;
* then writes it all in **one SQLite transaction**: either all of it is saved and
  `onboarding_completed_at` is set, or nothing is;
* finds income sources and categories by name, **case-insensitively**, and reuses them instead of
  creating duplicates;
* is **idempotent**: once onboarding is complete, calling it again changes nothing and returns the
  saved settings. A retry (or a double tap) cannot duplicate or overwrite data.

The tab layout reads `getSettings().onboarding_completed`; if it is `false` the user is sent to
onboarding, so the flow resumes after a restart. Answers typed but not yet saved are not kept: nothing
is half-saved.

Changing things later (Settings) updates the same rows through `updateSettings`, and every screen
reloads, so Dashboard, Budgets, Transactions and Settings stay consistent.

## API methods

All go through `api::dispatch`; names are mirrored in `src/services/viseCore.ts`.

| Method | Kind | Notes |
|---|---|---|
| `getSettings` | read | Includes `onboarding_completed` and the income source's name |
| `updateSettings` | write | Fields left out are unchanged; blank `display_name` / `monthly_income` clears it |
| `completeOnboarding` | write | Atomic and idempotent, see above |
| `addTransaction`, `updateTransaction`, `deleteTransaction`, `listTransactions` | | `updateTransaction` replaces every editable field |
| `listCategories`, `addCategory`, `listIncomeSources`, `addIncomeSource` | | |
| `setCategoryBudget`, `deleteCategoryBudget`, `setMonthBudget` | write | |
| `getMonthlySummary` | read | Now also returns `expected_income_cents`, `income_basis_cents`, `left_cents`, `category_limits_total_cents`, `budgeted_spent_cents`, `unbudgeted_spent_cents` |
| `getCategoryBreakdown`, `getSpendingTrend`, `predictSpending` | read | |

Errors have a `kind` (`validation` with the offending `field`, `not_found`, `invalid_request`,
`database`, `bridge_unavailable`). Forms map `field` onto the input to highlight. A failed save keeps
the screen open with what the user typed.

## What the screens do now

* **Loading**: a spinner until the first result. **Error**: the message and a "Try again" button.
* **Empty states** (no demo fallback): no transactions, no budgets, no spending history, no report data.
* **After a write**: `mutate()` calls `invalidateData()`; every mounted `useCoreQuery` reloads.
* **Undo** (transaction or budget delete) writes the item back through Rust. A restored transaction
  gets a new id.

## Changes to the product surface

Removed because nothing real backs them (they showed hard-coded values or did nothing):

* "Explore with demo data" on the welcome screen and "Clear demo data" in Settings.
* The Goals screen and the "Savings goal" quick-add entry (no goals table yet).
* Settings rows with no stored value: theme, number/date format, first day of week, language, budget
  month start, show predictions, notifications, Face ID, accessibility toggles, import/export, sign out.
* The Note field on Add transaction (the `transactions` table has no note column).
* Reports: the range chips are now 3M / 6M / 12M (was Month / 3M / 6M / Year / Custom) and there is
  no Export button. The Dashboard spending chart shows months (it showed weeks) because Rust has no
  weekly API.

Added: edit a transaction (press and hold a row), the Settings editor (`app/edit-setting.tsx`:
name, currency, expected monthly income, income source, warning threshold), month stepper on the
Transactions tab.

Known limits: onboarding does not ask for an income source (it defaults to "Salary"; change it in
Settings); changing currency does not convert existing transactions; categories are picked from the
stored list plus starters (custom category names are not offered in forms yet).

## Native bridge

```bash
# Android (Linux/macOS/Windows): needs the Android SDK + NDK, cargo-ndk and the Rust Android targets
cd vise-app
./scripts/build-android-core.sh      # writes modules/vise-core/android/src/main/jniLibs/
npx expo run:android                 # dev build; Expo Go cannot load custom native code

# iOS (macOS + Xcode only, not exercised in CI)
./scripts/build-ios-core.sh
npx expo run:ios
```

Verified in this repo: the Rust library cross-compiles for `aarch64-linux-android` and
`x86_64-linux-android` with NDK 30, exports the JNI symbols, and the C ABI round-trips in a Rust test.
**Not verified**: running it on a device or emulator, and the iOS module (Swift + static library).

## Tests and CI

Run locally:

```bash
cd vise-app/rust-core && cargo test --all-targets && cargo clippy --all-targets -- -D warnings && cargo fmt --check
cd vise-app && npm run typecheck && npm test
```

| Workflow | Job | Fails the PR when |
|---|---|---|
| `rust-core-tests.yml` | Rust core tests | any Rust test fails (see below) |
| `rust-lint.yml` | Clippy, Format Check | warnings, or unformatted code |
| `app-tests.yml` | Type-check and unit tests | `tsc` errors or a Vitest test fails |
| `ts-typecheck.yml` | tsc --noEmit | type errors (app files) |
| `android-core.yml` | Build librust_core.so | the Android library stops compiling or loses its JNI entry points |

What the tests pin down:

* **Onboarding** (`service/settings.rs`): saves everything and links records; income transaction is
  linked to the income source; retry changes nothing; existing source/category reused (no duplicates);
  invalid input saves nothing and does not mark complete; a database failure midway **rolls back all
  writes**; every optional step can be skipped; settings changes are stored, validated and reflected in
  summaries.
* **Persistence** (`tests/persistence.rs`, real SQLite file): data and onboarding survive closing and
  reopening the database; reopening/retrying never resets settings; the settings migration keeps
  pre-existing data.
* **API** (`api.rs`): onboarding round trip, update/delete of transactions and budgets, error kinds.
* **Contract** (`tests/contract.rs` + `src/__tests__/contract.test.ts`): the JSON field names Rust
  returns, `src/services/types.ts` and `rust-core/contracts/api-shapes.json` must agree. Changing a
  reply means updating all three.
* **Bridge client** (`viseCore.test.ts`): writes invalidate screens, reads do not, a rejected write
  throws `ViseError` with its field and does **not** invalidate, a missing native module fails every call.
* **Onboarding payload** (`saveOnboarding.test.ts`): one call carrying every answer; skipped steps are
  `null`; failures (including "core unavailable") propagate instead of being treated as success.
* **No demo data** (`noDemoData.test.ts`): fails if app code imports demo data, mentions demo entry
  points, or swallows `bridge_unavailable` as success.

### Make these checks required

CI only blocks merging if the checks are marked **required** in GitHub (repo → Settings → Branches →
branch protection rule for `main` → "Require status checks to pass"). Add:
`Rust core tests`, `Clippy`, `Format Check`, `Type-check and unit tests`, `tsc --noEmit`,
`Build librust_core.so`. Path filters mean a check is skipped when its paths are untouched; GitHub
treats skipped required checks as passing.
