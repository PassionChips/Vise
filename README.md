# Budget Creator / Monthly Spending Estimator — Mobile App Plan

## Overview

A cross-platform (iOS + Android) mobile budget and spending estimator app. The UI is built with React Native + Expo, the core calculation engine and database layer are written in Rust, and Python handles analytics, reporting, and ML-based spending predictions. Rust and Python are bridged via PyO3, and Rust is exposed to React Native via the Expo Modules API.

**Goals:**
- Add income sources and expense categories with monthly limits
- Log transactions against categories
- View a monthly summary of spending vs budget
- See analytics reports and charts (pandas)
- Get ML-powered predictions for next month's spending (scikit-learn)

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
├── rust-core/                    # Rust crate — core engine + native module
│   ├── src/
│   │   ├── lib.rs                # Expo Modules entry point (JNI / Swift FFI)
│   │   ├── db/                   # SQLite connection, migrations, schema
│   │   ├── models/               # Rust structs: Income, Category, Transaction
│   │   ├── repository/           # CRUD functions for each model
│   │   ├── calculations/         # Budget math, totals, limit checks
│   │   └── python_bridge/        # PyO3 bridge — calls Python analytics layer
│   └── Cargo.toml
│
└── python-analytics/             # Python package — analytics + ML
    ├── analytics.py              # pandas-based monthly summaries
    ├── charts.py                 # matplotlib chart generation (returns base64 PNG)
    ├── predictions.py            # scikit-learn spending forecasts
    └── requirements.txt          # pandas, matplotlib, scikit-learn, numpy
```

---

## Data Model (SQLite — managed by Rust)

| Table | Columns |
|---|---|
| `income_sources` | id, name, amount, frequency (monthly/weekly/yearly), created_at |
| `expense_categories` | id, name, monthly_limit, color, created_at |
| `transactions` | id, category_id, amount, date, note, created_at |
| `budget_months` | id, month (YYYY-MM), total_income, total_limit, total_spent |

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding

**Intent:** Set up the monorepo structure with all three layers (Expo, Rust crate, Python package) so every subsequent sub-task has a valid home.

**Expected Outcomes:**
- Expo app boots on iOS simulator and Android emulator
- Rust crate compiles for host target (`cargo build`)
- Python package installs cleanly (`pip install -r requirements.txt`)
- Folder structure matches the architecture above

**Todo List:**
1. Run `npx create-expo-app budget-app --template blank-typescript` to scaffold the Expo project
2. Inside the repo root, run `cargo new rust-core --lib` to create the Rust crate
3. Create `python-analytics/` directory with placeholder `analytics.py`, `charts.py`, `predictions.py`, and `requirements.txt`
4. Add `pandas`, `matplotlib`, `scikit-learn`, `numpy` to `requirements.txt` (latest stable versions)
5. Set up `.gitignore` covering `node_modules/`, `target/`, `__pycache__/`, `.env`, `*.pyc`, and SQLite `.db` files
6. Verify all three layers initialize without errors

**Relevant Context:**
- Expo docs: https://docs.expo.dev/get-started/create-a-project/
- Cargo workspace can be used if desired to manage the Rust crate alongside the app

**Status:** [ ] pending

---

### Sub-Task 2 — Rust: SQLite Schema and Repository Layer

**Intent:** Define the database schema, run migrations on first launch, and implement all CRUD operations in Rust so the rest of the app has a stable data access layer.

**Expected Outcomes:**
- SQLite DB file is created on first app launch at the platform-appropriate path
- All four tables are created via migration on first run
- CRUD functions exist for: income sources, expense categories, transactions, budget month summaries
- Unit tests pass for all repository functions using an in-memory SQLite DB

**Todo List:**
1. Add `rusqlite` with the `bundled` feature to `Cargo.toml` (bundles SQLite — no system dependency needed on iOS/Android)
2. Create `src/db/connection.rs` — opens or creates the SQLite file, runs migrations
3. Create `src/db/migrations.rs` — SQL `CREATE TABLE IF NOT EXISTS` statements for all four tables
4. Create `src/models/` — define `IncomeSource`, `ExpenseCategory`, `Transaction`, `BudgetMonth` as Rust structs with `serde` derive macros
5. Create `src/repository/` — one file per model with `insert`, `get_all`, `get_by_id`, `update`, `delete` functions
6. Write unit tests for each repository function using `rusqlite`'s in-memory DB (`:memory:`)
7. Run `cargo test` and confirm all tests pass

**Relevant Context:**
- `rusqlite` crate: https://crates.io/crates/rusqlite — use `features = ["bundled"]`
- `serde` + `serde_json` needed for JSON serialization when passing data back to React Native
- DB file path on iOS: use app documents directory; on Android: use app-specific internal storage

**Status:** [ ] pending

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
4. Expose a `calculate_monthly_summary(month: &str) -> BudgetMonth` function that reads from DB and returns a populated summary struct
5. Write unit tests for all calculation functions with sample data
6. Run `cargo test` and confirm all tests pass

**Relevant Context:**
- All functions operate on data already loaded from the repository layer (Sub-Task 2)
- Keep calculation functions pure where possible (take data as arguments, not DB connections) for easy testing

**Status:** [ ] pending

---

### Sub-Task 4 — Python Analytics Layer

**Intent:** Build the Python analytics package that receives transaction data (as JSON) and returns monthly summaries, chart images, and ML spending predictions back to the Rust caller.

**Expected Outcomes:**
- `analytics.py` accepts JSON transaction data and returns monthly breakdown as JSON (using pandas)
- `charts.py` generates a spending-by-category pie chart and a monthly trend bar chart, returns base64-encoded PNG strings
- `predictions.py` trains a simple linear regression (scikit-learn) on historical monthly totals and returns a predicted spend for next month
- All three modules are callable as Python functions (no CLI, no server — pure functions for PyO3)

**Todo List:**
1. Implement `analytics.py` — `monthly_breakdown(transactions_json: str) -> str` using pandas DataFrame, returns JSON summary
2. Implement `charts.py` — `spending_pie_chart(breakdown_json: str) -> str` and `monthly_trend_chart(monthly_totals_json: str) -> str`, both return base64 PNG strings using matplotlib with a non-interactive backend (`matplotlib.use('Agg')`)
3. Implement `predictions.py` — `predict_next_month(monthly_totals_json: str) -> float` using scikit-learn `LinearRegression` on at least 3 months of historical data
4. Write Python unit tests (`pytest`) for all three modules with sample JSON inputs
5. Run `pytest` and confirm all tests pass
6. Pin all dependency versions in `requirements.txt` after verifying they are the latest stable releases with no known critical CVEs

**Relevant Context:**
- Use `matplotlib.use('Agg')` — critical for headless rendering (no display required on mobile)
- All functions must accept and return strings (JSON or base64) — this is the contract PyO3 will use
- `scikit-learn` requires at least a few data points for meaningful predictions — handle the cold-start case (fewer than 3 months) gracefully by returning 0.0 or the average

**Status:** [ ] pending

---

### Sub-Task 5 — PyO3 Bridge (Rust calls Python)

**Intent:** Wire Rust to the Python analytics layer via PyO3 so the Rust core can call `analytics.py`, `charts.py`, and `predictions.py` as if they were native Rust functions.

**Expected Outcomes:**
- Rust can call `monthly_breakdown`, `spending_pie_chart`, `monthly_trend_chart`, and `predict_next_month` from Python
- Results are deserialized from Python strings back into Rust types
- PyO3 bridge compiles for iOS (`aarch64-apple-ios`) and Android (`aarch64-linux-android`) targets
- Error handling: Python exceptions are caught and converted to Rust `Result` errors (never panic)

**Todo List:**
1. Add `pyo3` with `features = ["auto-initialize"]` to `Cargo.toml`
2. Create `src/python_bridge/mod.rs` — initialize the Python interpreter and import the analytics module
3. Implement `call_monthly_breakdown(transactions_json: &str) -> Result<String, BridgeError>`
4. Implement `call_spending_chart(breakdown_json: &str) -> Result<String, BridgeError>`
5. Implement `call_monthly_trend_chart(monthly_totals_json: &str) -> Result<String, BridgeError>`
6. Implement `call_predict_next_month(monthly_totals_json: &str) -> Result<f64, BridgeError>`
7. Bundle the Python scripts into the app binary or as embedded assets — document the embedding strategy for iOS vs Android
8. Write integration tests that call each bridge function end-to-end
9. Run `cargo test` and confirm all bridge tests pass

**Relevant Context:**
- PyO3 docs: https://pyo3.rs — pay close attention to the GIL (`Python::with_gil`)
- Bundling CPython on mobile requires `python3-sys` and linking against a static `libpython` — this is the most complex build step in the project
- iOS requires a static library (`staticlib`); Android requires a shared library (`cdylib`)
- The Python `.py` files must be accessible at runtime — embed them using `include_str!` or bundle as app assets

**Status:** [ ] pending

---

### Sub-Task 6 — Expo Native Module (Rust exposed to React Native)

**Intent:** Expose the Rust core engine to React Native via the Expo Modules API so JavaScript can call Rust functions (CRUD, calculations, analytics) without any network layer.

**Expected Outcomes:**
- An Expo native module wraps all Rust functions
- JS can call: `addTransaction`, `getTransactions`, `getCategories`, `addCategory`, `getMonthlySummary`, `getSpendingChart`, `predictNextMonth`
- All calls are async (return Promises) to avoid blocking the JS thread
- Module works on both iOS and Android

**Todo List:**
1. Run `npx create-expo-module rust-bridge` inside the monorepo to scaffold the native module
2. On Android: write JNI bindings in `RustBridgeModule.kt` that load the compiled Rust `.so` and call exported functions
3. On iOS: write Swift bindings in `RustBridgeModule.swift` that call the compiled Rust static library via a C header
4. Define the JavaScript API surface in `src/RustBridgeModule.ts` with full TypeScript types matching the Rust data models
5. Wire each JS function through to the corresponding Rust repository / calculation / bridge function
6. Test the module on an iOS simulator and an Android emulator
7. Document the build commands needed to compile Rust for each target before running the Expo app

**Relevant Context:**
- Expo Modules API docs: https://docs.expo.dev/modules/overview/
- Use `uniffi-rs` as an alternative to hand-written JNI/Swift if the binding surface grows large
- Rust compilation targets: `aarch64-apple-ios` + `x86_64-apple-ios` (iOS sim) for iOS; `aarch64-linux-android` + `x86_64-linux-android` (emulator) for Android
- All data passed over the bridge must be JSON strings or primitive types — no raw Rust pointers

**Status:** [ ] pending

---

### Sub-Task 7 — React Native UI: Screens and Navigation

**Intent:** Build the four core screens of the app with React Navigation, wired to the Rust bridge via the JS service layer.

**Expected Outcomes:**
- Dashboard screen: shows current month's total income, total spent, remaining budget, and a per-category breakdown
- Categories screen: list of expense categories with monthly limits, ability to add/edit/delete
- Transactions screen: list of transactions for the current month, ability to add a new transaction (amount, category, note, date)
- Reports screen: shows spending pie chart and monthly trend bar chart (images from Python via Rust bridge), plus ML prediction for next month

**Todo List:**
1. Install `@react-navigation/native`, `@react-navigation/bottom-tabs`, and required dependencies
2. Create `navigation/AppNavigator.tsx` — bottom tab navigator with four tabs: Dashboard, Categories, Transactions, Reports
3. Build `screens/DashboardScreen.tsx` — calls `getMonthlySummary` on mount, displays totals and a category progress list
4. Build `screens/CategoriesScreen.tsx` — calls `getCategories`, renders list with add/edit/delete actions
5. Build `screens/TransactionsScreen.tsx` — calls `getTransactions`, renders list with an add-transaction form (modal or bottom sheet)
6. Build `screens/ReportsScreen.tsx` — calls `getSpendingChart`, `getMonthlyTrendChart`, `predictNextMonth`; displays charts as `<Image>` components from base64 and shows the ML prediction value
7. Create `services/budgetService.ts` — thin wrapper around all native module calls with TypeScript return types
8. Add basic loading and error states to all screens

**Relevant Context:**
- Charts returned from Python are base64 PNG strings — use `<Image source={{ uri: 'data:image/png;base64,...' }}>`
- React Navigation docs: https://reactnavigation.org/
- Keep screens thin — all data logic lives in `services/budgetService.ts` and the Rust layer

**Status:** [ ] pending

---

### Sub-Task 8 — UI Component Library and Styling

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

### Sub-Task 9 — Build Pipeline and Cross-Compilation

**Intent:** Set up the scripts and CI configuration needed to compile Rust for iOS and Android targets and bundle everything into a working Expo build.

**Expected Outcomes:**
- A single `build.sh` script compiles Rust for all four targets and places the binaries where the Expo native module expects them
- `eas build` (Expo Application Services) can produce a working `.ipa` and `.apk`
- The Python interpreter and analytics scripts are bundled correctly inside both builds

**Todo List:**
1. Install Rust cross-compilation targets: `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-linux-android x86_64-linux-android`
2. Install Android NDK and configure `~/.cargo/config.toml` with the correct linkers for each Android target
3. Write `build.sh` — compiles Rust for all targets, copies output to `ios/` and `android/jniLibs/` directories
4. Configure `eas.json` with `prebuildCommand` to run `build.sh` before each EAS build
5. Document the Python bundling strategy: static `libpython` compiled for each target, embedded in the Rust binary
6. Do a full `eas build --platform ios` and `eas build --platform android` and verify both succeed
7. Document any manual steps required (Apple Developer account, Android keystore)

**Relevant Context:**
- EAS Build docs: https://docs.expo.dev/build/introduction/
- Android NDK linker config for Cargo: https://doc.rust-lang.org/cargo/reference/config.html
- Bundling CPython statically for mobile is the hardest step — `python3-sys` with `PYO3_CROSS` env vars

**Status:** [ ] pending

---

### Sub-Task 10 — Testing and Polish

**Intent:** Ensure the full app works end-to-end on real devices, fix edge cases, and prepare for personal use or distribution.

**Expected Outcomes:**
- All four screens function correctly on a physical iOS device and Android device
- Edge cases handled: no transactions yet (empty state), category over budget (red indicator), fewer than 3 months of data (ML graceful fallback)
- No crashes on app cold start or when navigating between screens

**Todo List:**
1. Test the full user flow on a physical iOS device: add income → add categories → add transactions → view dashboard → view reports
2. Test the same flow on a physical Android device
3. Add empty state UI to all list screens (friendly message when no data exists yet)
4. Verify the ML prediction falls back gracefully when fewer than 3 months of data are available
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
| rusqlite | Latest stable, `bundled` feature | https://crates.io/crates/rusqlite |
| PyO3 | Latest stable | https://pyo3.rs |
| serde / serde_json | Latest stable | https://crates.io/crates/serde |
| pandas | Latest stable | https://pandas.pydata.org |
| matplotlib | Latest stable | https://matplotlib.org |
| scikit-learn | Latest stable | https://scikit-learn.org |
| React Navigation | Latest stable v7 | https://reactnavigation.org |
| React Native Paper | Latest stable | https://callstack.github.io/react-native-paper |

---

## Security Notes

- No secrets or API keys — fully offline app, nothing to protect in transit
- SQLite file stored in app-private storage (not accessible to other apps on iOS/Android)
- No user PII leaves the device
- All dependencies must be pinned to latest stable versions with no known critical CVEs (CVSS >= 7.0)
- `.gitignore` must cover `.env`, `*.db`, `*.sqlite`, and `__pycache__/`
