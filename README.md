# Budget Creator / Monthly Spending Estimator — Mobile App Plan

## Overview

A cross-platform (iOS + Android) mobile budget and spending estimator app. The UI is built with React Native + Expo, the core calculation engine and database layer are written in Rust, and analytics and ML predictions are implemented in Rust and rendered natively in React Native.

**Goals:**
- Add income sources and expense categories with monthly limits
- Log transactions against categories
- View a monthly summary of spending vs budget
- See analytics reports and charts (React Native charting library)
- Get spending predictions for next month (Rust linear regression)

**Non-goals (MVP):**
- Cloud sync or backend
- Multi-user / account sharing
- Bank integrations or CSV import

**Offline-first:** All data lives in SQLite on-device, managed entirely by the Rust layer.

---

## Architecture

```
budget-app/
├── app/                          # React Native + Expo frontend
│   ├── components/               # Reusable UI components
│   ├── screens/                  # Dashboard, Categories, Transactions, Reports
│   ├── navigation/               # React Navigation stack/tab config
│   ├── hooks/                    # Custom hooks (useBudget, useTransactions)
│   └── services/                 # JS bridge calls to Rust native module
│
└── rust-core/                    # Rust crate — core engine + native module
    ├── src/
    │   ├── lib.rs                # Expo Modules entry point (JNI / Swift FFI)
    │   ├── db/                   # SQLite connection, migrations, schema
    │   ├── models/               # Rust structs: Income, Category, Transaction
    │   ├── repository/           # CRUD functions for each model
    │   └── calculations/         # Budget math, totals, limit checks, predictions
    └── Cargo.toml
```

---

## Data Model (SQLite — managed by Rust)

| Table | Columns |
|---|---|
| `income_sources` | id, name, is_active, created_at, updated_at |
| `expense_categories` | id, name, icon, color, is_default, is_active, created_at, updated_at |
| `transactions` | id, source_type, transaction_type, amount_cents, currency, description, occurred_at, income_source_id, expense_category_id, external_id, revolut_account_id, merchant_name, raw_description, revolut_category, status, completed_at, exclude_from_totals, created_at, updated_at |
| `budget_months` | id, month (YYYY-MM), currency, spending_limit_cents, savings_target_cents, created_at, updated_at |

---

## Sub-Tasks

---

### Sub-Task 3 — Rust: Budget Calculation Engine

**Intent:** Implement all pure budget math in Rust — category totals, remaining budget, over-limit detection, and monthly summary aggregation. This is the performance-critical core.

**Expected Outcomes:**
- Given a list of transactions and category limits, Rust correctly computes totals and remaining amounts
- Over-budget categories are flagged
- Monthly summary struct is computed and can be written back to the `budget_months` table
- All calculation logic has unit tests

**Todo List:**
1. Create `src/calculations/totals.rs` — sum transactions by category for a given month
2. Create `src/calculations/budget_check.rs` — compare category totals against monthly limits, return over/under status per category
3. Create `src/calculations/summary.rs` — aggregate total income, total limit, total spent, net remaining for a month
4. Expose a `calculate_monthly_summary(month: &str) -> MonthlySummary` function that reads from DB and returns a populated summary struct
5. Write unit tests for all calculation functions with sample data
6. Run `cargo test` and confirm all tests pass

**Relevant Context:**
- All functions operate on data already loaded from the repository layer (Sub-Task 2)
- Keep calculation functions pure where possible (take data as arguments, not DB connections) for easy testing

**Status:** [ ] pending

---

### Sub-Task 4 — Rust: Analytics & Spending Predictions

**Intent:** Implement analytics aggregations and next-month spending prediction entirely in Rust, replacing the previously planned Python analytics layer.

**Expected Outcomes:**
- `src/calculations/analytics.rs` computes monthly breakdowns by category (equivalent to a pandas groupby) and returns them as serialisable Rust structs
- `src/calculations/predictions.rs` implements a simple least-squares linear regression over historical monthly totals and returns a predicted spend for next month
- Cold-start handled gracefully: return `0` or the average when fewer than 3 months of data are available
- All functions are pure (accept data as arguments, not DB connections) and have unit tests
- Results are serialised to JSON via `serde_json` for consumption by the React Native layer

**Todo List:**
1. Implement `src/calculations/analytics.rs` — `monthly_breakdown(transactions: &[Transaction], month: &str) -> Vec<CategoryBreakdown>` returning category name, amount spent, and percentage of total
2. Implement `src/calculations/predictions.rs` — `predict_next_month(monthly_totals: &[(i64, i64)]) -> i64` using least-squares linear regression; handle fewer than 3 data points gracefully
3. Expose both functions through `lib.rs` so the Expo native module (Sub-Task 6) can call them
4. Write unit tests for both functions with sample data, including the cold-start edge case
5. Run `cargo test` and confirm all tests pass

**Relevant Context:**
- Least-squares linear regression: `slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)`, `intercept = (Σy − slope·Σx) / n`
- No external crates needed — this is ~20 lines of arithmetic
- Return cents (i64) throughout; the RN layer converts to display currency

**Status:** [ ] pending

---

### Sub-Task 5 — Expo Native Module (Rust exposed to React Native)

**Intent:** Expose the Rust core engine to React Native via the Expo Modules API so JavaScript can call Rust functions (CRUD, calculations, analytics, predictions) without any network layer.

**Expected Outcomes:**
- An Expo native module wraps all Rust functions
- JS can call: `addTransaction`, `getTransactions`, `getCategories`, `addCategory`, `getMonthlySummary`, `getCategoryBreakdown`, `predictNextMonth`
- All calls are async (return Promises) to avoid blocking the JS thread
- Module works on both iOS and Android

**Todo List:**
1. Run `npx create-expo-module rust-bridge` inside the monorepo to scaffold the native module
2. On Android: write JNI bindings in `RustBridgeModule.kt` that load the compiled Rust `.so` and call exported functions
3. On iOS: write Swift bindings in `RustBridgeModule.swift` that call the compiled Rust static library via a C header
4. Define the JavaScript API surface in `src/RustBridgeModule.ts` with full TypeScript types matching the Rust data models
5. Wire each JS function through to the corresponding Rust repository / calculation function
6. Test the module on an iOS simulator and an Android emulator
7. Document the build commands needed to compile Rust for each target before running the Expo app

**Relevant Context:**
- Expo Modules API docs: https://docs.expo.dev/modules/overview/
- Use `uniffi-rs` as an alternative to hand-written JNI/Swift if the binding surface grows large
- Rust compilation targets: `aarch64-apple-ios` + `x86_64-apple-ios` (iOS sim) for iOS; `aarch64-linux-android` + `x86_64-linux-android` (emulator) for Android
- All data passed over the bridge must be JSON strings or primitive types — no raw Rust pointers

**Status:** [ ] pending

---

### Sub-Task 6 — React Native UI: Screens and Navigation

**Intent:** Build the four core screens of the app with React Navigation, wired to the Rust bridge via the JS service layer.

**Expected Outcomes:**
- Dashboard screen: shows current month's total income, total spent, remaining budget, and a per-category breakdown
- Categories screen: list of expense categories with monthly limits, ability to add/edit/delete
- Transactions screen: list of transactions for the current month, ability to add a new transaction (amount, category, note, date)
- Reports screen: shows spending breakdown pie chart and monthly trend bar chart rendered natively via a React Native charting library, plus the Rust-computed prediction for next month

**Todo List:**
1. Install `@react-navigation/native`, `@react-navigation/bottom-tabs`, and required dependencies
2. Create `navigation/AppNavigator.tsx` — bottom tab navigator with four tabs: Dashboard, Categories, Transactions, Reports
3. Build `screens/DashboardScreen.tsx` — calls `getMonthlySummary` on mount, displays totals and a category progress list
4. Build `screens/CategoriesScreen.tsx` — calls `getCategories`, renders list with add/edit/delete actions
5. Build `screens/TransactionsScreen.tsx` — calls `getTransactions`, renders list with an add-transaction form (modal or bottom sheet)
6. Build `screens/ReportsScreen.tsx` — calls `getCategoryBreakdown` and `predictNextMonth`; renders a pie chart and bar chart using a React Native charting library (e.g. `victory-native` or `react-native-gifted-charts`), and shows the ML prediction value
7. Create `services/budgetService.ts` — thin wrapper around all native module calls with TypeScript return types
8. Add basic loading and error states to all screens

**Relevant Context:**
- Charts are rendered natively by the charting library — no base64 image round-trip needed
- React Navigation docs: https://reactnavigation.org/
- Keep screens thin — all data logic lives in `services/budgetService.ts` and the Rust layer

**Status:** [ ] pending

---

### Sub-Task 7 — UI Component Library and Styling

**Intent:** Apply a consistent design system to the app using React Native Paper so the app looks and feels polished on both iOS and Android with minimal custom CSS.

**Expected Outcomes:**
- All screens use React Native Paper components (Cards, Buttons, TextInputs, Lists, FAB for add actions)
- A consistent color theme is defined (primary color, surface, background, error)
- The app passes basic usability review on both iOS and Android

**Todo List:**
1. Install `react-native-paper` and `react-native-vector-icons` (latest stable versions)
2. Define a theme in `app/theme.ts` — primary color (green for finance), surface colors, typography
3. Wrap the app in `<PaperProvider theme={theme}>` in `App.tsx`
4. Refactor all four screens to use Paper components: `Card`, `List.Item`, `TextInput`, `Button`, `FAB`, `ProgressBar` (for budget usage)
5. Add a `ProgressBar` per category on the Dashboard showing spent / limit ratio, colored red if over budget
6. Verify layout on both small (iPhone SE) and large (iPad / Android tablet) screen sizes

**Relevant Context:**
- React Native Paper docs: https://callstack.github.io/react-native-paper/
- Keep the theme finance-appropriate: greens for under-budget, reds for over-budget

**Status:** [ ] pending

---

### Sub-Task 8 — Build Pipeline and Cross-Compilation

**Intent:** Set up the scripts and CI configuration needed to compile Rust for iOS and Android targets and bundle everything into a working Expo build.

**Expected Outcomes:**
- A single `build.sh` script compiles Rust for all four targets and places the binaries where the Expo native module expects them
- `eas build` (Expo Application Services) can produce a working `.ipa` and `.apk`

**Todo List:**
1. Install Rust cross-compilation targets: `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-linux-android x86_64-linux-android`
2. Install Android NDK and configure `~/.cargo/config.toml` with the correct linkers for each Android target
3. Write `build.sh` — compiles Rust for all targets, copies output to `ios/` and `android/jniLibs/` directories
4. Configure `eas.json` with `prebuildCommand` to run `build.sh` before each EAS build
5. Do a full `eas build --platform ios` and `eas build --platform android` and verify both succeed
6. Document any manual steps required (Apple Developer account, Android keystore)

**Relevant Context:**
- EAS Build docs: https://docs.expo.dev/build/introduction/
- Android NDK linker config for Cargo: https://doc.rust-lang.org/cargo/reference/config.html

**Status:** [ ] pending

---

### Sub-Task 9 — Testing and Polish

**Intent:** Ensure the full app works end-to-end on real devices, fix edge cases, and prepare for personal use or distribution.

**Expected Outcomes:**
- All four screens function correctly on a physical iOS device and Android device
- Edge cases handled: no transactions yet (empty state), category over budget (red indicator), fewer than 3 months of data (prediction graceful fallback)
- No crashes on app cold start or when navigating between screens

**Todo List:**
1. Test the full user flow on a physical iOS device: add income → add categories → add transactions → view dashboard → view reports
2. Test the same flow on a physical Android device
3. Add empty state UI to all list screens (friendly message when no data exists yet)
4. Verify the spending prediction falls back gracefully when fewer than 3 months of data are available
5. Check app performance: dashboard should load in under 500ms on a mid-range Android device
6. Fix any layout issues found on different screen sizes
7. Final `eas build` for both platforms and install on device

**Relevant Context:**
- Empty states are a key UX detail for a first-launch experience — show a helpful prompt to add first category/transaction
- Rust calculation performance should be invisible — if any screen feels slow, profile the JS layer first

**Status:** [ ] pending

---

## Technology Reference

| Technology | Version Policy | Link |
|---|---|---|
| React Native | Latest stable via Expo SDK | https://reactnative.dev |
| Expo SDK | Latest stable | https://expo.dev |
| Rust | Latest stable (rustup) | https://rustup.rs |
| diesel | Latest stable | https://crates.io/crates/diesel |
| libsqlite3-sys | Latest stable, `bundled` feature | https://crates.io/crates/libsqlite3-sys |
| serde / serde_json | Latest stable | https://crates.io/crates/serde |
| victory-native | Latest stable | https://commerce.nearform.com/open-source/victory-native |
| React Navigation | Latest stable v7 | https://reactnavigation.org |
| React Native Paper | Latest stable | https://callstack.github.io/react-native-paper |


## Before Opening a Pull Request — Run Linting Locally

All linting workflows run automatically on every PR. Run the checks below **before pushing** so the CI passes first time.

---

### Rust — Clippy & Format

```bash
cd vise-app/rust-core

# Lint (must produce zero warnings)
cargo clippy --all-targets -- -D warnings

# Format check (auto-fix, then verify)
cargo fmt
cargo fmt --check
```

> `cargo fmt` rewrites files in-place. Run it, commit the changes, then confirm `cargo fmt --check` exits cleanly.

---

### TypeScript — Type-Check

```bash
cd vise-app

# Install deps (if not already done)
npm ci

# Type-check (no output = all good)
npx tsc --noEmit
```

---

### Quick all-in-one script

Run this from the repo root to check all layers in one go:

```bash
# Rust
(cd vise-app/rust-core && cargo clippy --all-targets -- -D warnings && cargo fmt --check)

# TypeScript
(cd vise-app && npx tsc --noEmit)
```

All commands must exit with code `0` before the PR is ready to open.

---

## Security Notes

- No secrets or API keys — fully offline app, nothing to protect in transit
- SQLite file stored in app-private storage (not accessible to other apps on iOS/Android)
- No user PII leaves the device
- All dependencies must be pinned to latest stable versions with no known critical CVEs (CVSS >= 7.0)
- `.gitignore` must cover `.env`, `*.db`, `*.sqlite`, and `__pycache__/`
