# Function trace: frontend → Rust → SQLite → UI

A function-by-function chart of every step a call takes. Companion to
[FRONTEND_RUST_BRIDGE.md](FRONTEND_RUST_BRIDGE.md) (the architecture) and
[PERSISTENCE.md](PERSISTENCE.md) (the guarantees). Diagrams are Mermaid; they render on GitHub and in VS Code's Markdown preview.

Legend: **TS** = TypeScript, **KT** = Kotlin, **SW** = Swift, **RS** = Rust.

---

## 1. App start: opening the database

The database is opened lazily, on the first call.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Screen (TS)
    participant VC as viseCore.call (TS)
    participant M as ViseCoreModule (KT/SW)
    participant F as ffi.rs (RS)
    participant C as db/connection.rs (RS)
    participant S as SQLite file vise.db

    UI->>VC: any API function
    VC->>M: native.call(method, json)
    M->>M: ensureOpen() [lock, once]
    M->>F: nativeInit(path) / vise_init(path)
    F->>F: init(path): lock CONNECTION
    F->>C: establish_connection(path)
    C->>S: SqliteConnection::establish
    C->>S: configure_connection: PRAGMA foreign_keys=ON, busy_timeout=5000
    C->>S: run_pending_migrations(MIGRATIONS)
    C-->>F: SqliteConnection
    F->>F: store in static CONNECTION
    F-->>M: "" / null (success)
```

| # | Function | File | What it does |
|---|---|---|---|
| 1 | `ensureOpen()` | `ViseCoreModule.kt` / `.swift` | Builds the path (`filesDir/vise.db` or `Application Support/vise.db`); runs once per process |
| 2 | `nativeInit` / `vise_init` | `ffi.rs` | JNI / C wrapper; converts the path to a Rust `String` (`read` / `c_str`) |
| 3 | `init(path)` | `ffi.rs` | Locks `CONNECTION`; opens only if still `None` |
| 4 | `establish_connection` | `db/connection.rs` | Opens the file, applies pragmas, runs embedded migrations (`migrations/*`) |
| 5 | `configure_connection` | `db/connection.rs` | Enables foreign keys and a 5 s busy timeout |

---

## 2. Master flow: one call, end to end

Every API call, read or write, passes through these same functions.

```mermaid
flowchart TD
    A["Screen event or mount"] --> B["viseCore.ts exported fn<br/>e.g. addTransaction(input)"]
    B --> C{"read or write?"}
    C -- write --> D["mutate(method, payload)"]
    C -- read --> E["call(method, payload)"]
    D --> E
    E --> F["nativeModule() → requireOptionalNativeModule('ViseCore')"]
    F -- missing --> X1["throw ViseError(bridge_unavailable)"]
    F --> G["JSON.stringify(payload)"]
    G --> H["native.call(method, json)  [AsyncFunction]"]
    H --> I["ensureOpen() then nativeCall / vise_call"]
    I --> J["ffi::call(method, payload)<br/>lock CONNECTION"]
    J -- not open / poisoned --> X2["unavailable() → ok:false, kind=database"]
    J --> K["api::dispatch(conn, method, payload)"]
    K --> L["api::handle: match method"]
    L -- unknown --> X3["AppError::InvalidRequest"]
    L --> M["api::parse(payload) → input struct (serde)"]
    M -- bad JSON / unknown field --> X4["AppError::InvalidRequest"]
    M --> N["service::&lt;use_case&gt;(conn, input)"]
    N --> O["repository::&lt;table&gt;::&lt;op&gt;(conn, ...)  (Diesel SQL)"]
    O --> P[("SQLite")]
    P --> O
    O --> N
    N --> Q["api::to_json(result)"]
    Q --> R["dispatch wraps: {ok:true,data} or {ok:false,error: ErrorBody::from(&AppError)}"]
    X2 --> S
    R --> S["reply String returned over JNI / C ABI"]
    S --> T["viseCore.call: JSON.parse(reply)"]
    T -- ok:false --> U["throw ViseError(explain(method, error))"]
    T -- ok:true --> V["return reply.data"]
    V --> W{"was mutate?"}
    W -- yes --> Y["invalidateData(): version++, notify listeners"]
    W -- no --> Z["resolve Promise to caller"]
    Y --> Z
```

---

## 3. Write flow: `addTransaction`

Frontend sends `{transaction_type, amount:"12.50", currency, description, date, expense_category_id?}`.

```mermaid
sequenceDiagram
    autonumber
    participant UI as add-transaction.tsx
    participant VC as viseCore.ts
    participant ST as data/store.ts
    participant FF as ffi.rs
    participant AP as api.rs
    participant SV as service.rs
    participant MN as money.rs
    participant RP as transaction_repository.rs
    participant DB as SQLite

    UI->>VC: addTransaction(input)
    VC->>VC: mutate("addTransaction", input)
    VC->>VC: call() → JSON.stringify → native.call
    VC->>FF: (via Kotlin/Swift) call(method, payload)
    FF->>AP: dispatch(conn, "addTransaction", json)
    AP->>AP: handle() → parse::<NewTransactionInput>(json)
    AP->>SV: add_transaction(conn, &input)
    SV->>SV: validate_new_transaction(&input)
    SV->>MN: parse_amount_cents("12.50") → 1250
    SV->>SV: validate_currency(), validate_text(description)
    SV->>SV: parse date → occurred_at (unix seconds)
    SV->>SV: income/category rule checks → NewTransaction
    SV->>SV: check_transaction_references(conn, &new)
    SV->>DB: expense_category_repository::get_by_id / income_source_repository::get_by_id
    SV->>RP: transaction_repository::insert(conn, &new)
    RP->>DB: INSERT INTO transactions ... RETURNING *
    DB-->>RP: Transaction row
    RP-->>SV: Transaction
    SV-->>AP: Ok(Transaction)
    AP->>AP: to_json() → {"ok":true,"data":{...}}
    AP-->>VC: reply string
    VC->>VC: JSON.parse, ok → data
    VC->>ST: invalidateData()
    ST-->>UI: all useCoreQuery hooks reload (see §7)
```

| Layer | Function | Input → output |
|---|---|---|
| TS | `addTransaction` → `mutate` → `call` | `NewTransactionInput` → JSON string |
| KT/SW | `AsyncFunction("call")` | forwards strings |
| RS ffi | `ffi::call` | locks connection, forwards |
| RS api | `dispatch` → `handle` → `parse` | JSON → `NewTransactionInput` |
| RS service | `add_transaction` | orchestrates below |
| RS service | `validate_new_transaction` | raw strings → `NewTransaction` (cents, unix time) or `AppError::Validation{field}` |
| RS money | `parse_amount_cents` | `"12.50"` → `1250` |
| RS service | `check_transaction_references` | confirms category / source IDs exist |
| RS repo | `transaction_repository::insert` | `INSERT ... RETURNING` → `Transaction` |
| RS api | `to_json` + `dispatch` | `Transaction` → `{"ok":true,"data":...}` |
| TS | `invalidateData` | triggers UI reload |

---

## 4. Per-method function map

Each row: the function chain after `api::handle` picks the method. All chains start at `viseCore.ts` →
`ffi::call` → `api::dispatch`; only the unique part is shown.
`R` = read (`call`), `W` = write (`mutate`, triggers UI refresh).

### Transactions

| TS function | R/W | Method | Service fn | Validation / calc helpers | Repository fn(s) | SQL |
|---|---|---|---|---|---|---|
| `addTransaction` | W | `addTransaction` | `add_transaction` | `validate_new_transaction`, `parse_amount_cents`, `check_transaction_references` | `transaction_repository::insert` | INSERT … RETURNING |
| `updateTransaction` | W | `updateTransaction` | `update_transaction` | same as above | `transaction_repository::update` | UPDATE … `updated_at=unixepoch()` RETURNING |
| `deleteTransaction` | W | `deleteTransaction` | `delete_transaction` | n/a (NotFound if 0 rows) | `transaction_repository::delete` | DELETE WHERE id |
| `listTransactions` | R | `listTransactions` | `list_transactions` | `validate_month`, `YearMonth::start_timestamp/end_timestamp` | `transaction_repository::get_in_range` | SELECT by `occurred_at` range, newest first |

### Categories & income sources

| TS function | R/W | Service fn | Helpers | Repository fn(s) |
|---|---|---|---|---|
| `listCategories` | R | `list_categories` | n/a | `expense_category_repository::get_all` |
| `addCategory` | W | `add_category` | `validate_text`, `validate_color`, `duplicate_name_error` | `expense_category_repository::insert` |
| `listIncomeSources` | R | `list_income_sources` | n/a | `income_source_repository::get_all` |
| `addIncomeSource` | W | `add_income_source` | `validate_text`, `duplicate_name_error` | `income_source_repository::insert` |

### Budgets

| TS function | R/W | Service fn | Helpers | Repository fn(s) |
|---|---|---|---|---|
| `setMonthBudget` | W | `set_month_budget` | `validate_month`, `validate_currency`, `validate_optional_limit`, `get_or_create_budget_month` | `budget_month_repository::get_by_month` / `insert` / `update` |
| `setCategoryBudget` | W | `set_category_budget` → `upsert_category_budget` | `validate_month`, `validate_currency`, `parse_limit_cents` | `get_or_create_budget_month` repos + `category_budget_repository::upsert` |
| `deleteCategoryBudget` | W | `delete_category_budget` | n/a | `category_budget_repository::delete_for_category` |

### Settings & onboarding

| TS function | R/W | Service fn | Notes |
|---|---|---|---|
| `getSettings` | R | `settings::get_settings` → `view` | `app_settings_repository::get`, plus `income_source_repository::get_by_id` for the source name |
| `updateSettings` | W | `settings::update_settings` | Validates each provided field; `app_settings_repository::update`; returns `view` |
| `completeOnboarding` | W | `settings::complete_onboarding` | **One DB transaction.** See §5 |

### Data management

| TS function | R/W | Service fn | Notes |
|---|---|---|---|
| `getDataOverview` | R | `data::get_data_overview` | `COUNT(*)` on transactions, categories, income sources, budgets |
| `exportDataCsv` | R | `data::export_csv` | Loads categories, sources, all transactions; builds CSV with the `csv` crate; returns the text, writes no file |
| `deleteAllData` | W | `data::delete_all_data` | Requires `confirm:"DELETE"`; **one DB transaction**, then `VACUUM` |

### Reports (read-only, computed in Rust)

| TS function | Service fn | Reads (repository) | Pure calculations (`calculations/`) |
|---|---|---|---|
| `getMonthlySummary` | `get_monthly_summary` | `transaction_repository::get_in_range`, `expense_category_repository::get_all`, `budget_month_repository::get_by_month`, `category_budget_repository::get_for_budget_month`, `app_settings_repository::get` | `totals::month_totals` → `budget_check::check_categories` (uses `compare_to_limit`) → `summary::build_summary` → `summary::apply_expected_income` |
| `getCategoryBreakdown` | `get_category_breakdown` | via `get_monthly_summary` | `analytics::category_breakdown` |
| `getSpendingTrend` | `get_spending_trend` | `transaction_repository::get_in_range` (whole window, one query) | `totals::spending_by_month` → `analytics::spending_trend` |
| `predictSpending` | `predict_spending` | `transaction_repository::get_in_range` (lookback window) | `totals::spending_by_month` → `analytics::spending_trend` → `predictions::predict_next` |

---

## 5. Atomic multi-step writes

Two methods change many tables in a single SQLite transaction (`connection.transaction`), so a failure
part-way leaves nothing behind.

### `completeOnboarding`

```mermaid
flowchart TD
    A["saveOnboarding(answers) (TS)"] --> B["completeOnboarding(input) → mutate"]
    B --> C["api::dispatch → settings::complete_onboarding"]
    C --> D["Validate everything first:<br/>validate_currency, parse today → YearMonth,<br/>optional_text, validate_optional_limit,<br/>validate_text, validate_new_transaction"]
    D -- invalid --> E["Err(Validation{field}) – DB untouched"]
    D --> F["connection.transaction( … )"]
    F --> G["app_settings_repository::get"]
    G -- already completed --> H["return current settings (idempotent retry)"]
    G --> I["ensure_income_source (if income given)"]
    I --> J["ensure_category + upsert_category_budget (if limit given)"]
    J --> K["transaction_repository::insert (first transaction)"]
    K --> L["app_settings_repository::update (sets onboarding_completed_at)"]
    L --> M["view(): SettingsView"]
    M --> N[("COMMIT")]
    N --> O["reply → invalidateData() → UI reload"]
```

### `deleteAllData`

`delete_all_data` checks `confirm == "DELETE"`, then inside one transaction deletes (children first):
transactions → category budgets → month budgets → auto category rules → sync state → revolut accounts,
resets the `app_settings` row (id 1), then deletes categories and income sources. After commit it
runs `VACUUM` so deleted rows leave the file. Returns `DeletedCounts`.

---

## 6. Error path

```mermaid
flowchart LR
    A["service / repository fails"] --> B["AppError<br/>Validation | NotFound | InvalidRequest | Database"]
    B --> C["ErrorBody::from(&AppError)<br/>(Database message is replaced by a generic one)"]
    C --> D["dispatch: {ok:false, error:{kind, field?, message}}"]
    D --> E["viseCore.call: reply.ok == false"]
    E --> F["explain(method, error)<br/>(rewrites 'Unknown method' to 'rebuild the core')"]
    F --> G["throw new ViseError(body)"]
    G --> H["Screen catch: show message; use error.field to highlight the form field"]
```

For writes, `invalidateData()` is **not** called on failure, so the UI is not refreshed by a failed save.

---

## 7. Read flow: how data is published to the UI

Rust never pushes to the UI. The UI **pulls**, and `invalidateData()` tells every mounted screen to pull again.

```mermaid
sequenceDiagram
    autonumber
    participant SC as Screen component
    participant Q as useCoreQuery (data/store.ts)
    participant VC as viseCore.ts (call)
    participant RS as Rust (ffi → api → service → repo)
    participant DB as SQLite

    Note over SC,Q: On mount, on deps change, on invalidateData(), or reload()
    SC->>Q: useCoreQuery(() => getMonthlySummary(m, c), [m, c])
    Q->>Q: useSyncExternalStore subscribes to `version`
    Q->>VC: useEffect → load()
    VC->>RS: call("getMonthlySummary", {month, currency})
    RS->>DB: SELECT transactions / categories / budgets / settings
    DB-->>RS: rows
    RS->>RS: calculations::* (totals, budget_check, summary)
    RS-->>VC: {"ok":true,"data":MonthlySummary}
    VC-->>Q: data
    Q->>Q: setState({data, loading:false})
    Q-->>SC: re-render with {data, loading, error, reload}
```

### After a write: the refresh loop

```mermaid
sequenceDiagram
    participant W as Writer screen
    participant VC as viseCore.mutate
    participant ST as store.invalidateData
    participant A as Screen A (useCoreQuery)
    participant B as Screen B (useCoreQuery)

    W->>VC: addTransaction(...)
    VC->>VC: await call() succeeds
    VC->>ST: invalidateData()
    ST->>ST: version += 1
    ST->>A: listener() → useSyncExternalStore sees new version
    ST->>B: listener()
    A->>A: useEffect([dataVersion]) → load() again
    B->>B: useEffect([dataVersion]) → load() again
    Note over A,B: Each re-runs its own getXxx() calls into Rust and re-renders with fresh data
```

| Function | File | Role in publishing to the UI |
|---|---|---|
| `invalidateData()` | `src/data/store.ts` | Bumps the global `version`, calls every listener |
| `subscribeToInvalidation()` | `src/data/store.ts` | Registers a listener; returns the unsubscribe |
| `useCoreQuery(load, deps)` | `src/data/store.ts` | Hook: runs `load` on mount, when `deps` or `version` change, or on `reload()`; ignores results that arrive after unmount (`cancelled`) |
| `reload()` | `src/data/store.ts` | Manual retry (bumps an internal counter) |
| Return `{data, loading, error, reload}` | n/a | What screens render. `loading` is only true until the first result; old `data` stays visible during a refetch |

Screens that use it: Home `app/(tabs)/index.tsx` (`predictSpending`, history), Reports `reports.tsx`,
Settings `settings.tsx` (`getSettings`, `getDataOverview`), tab layout `_layout.tsx`, `ThemeProvider.tsx`
(`getSettings`), `add-transaction.tsx`, `edit-setting.tsx`, and `finance.ts` helpers.

---

## 8. Threading and consistency notes

- **JS side:** `native.call` is an `AsyncFunction`, so Rust runs off the UI thread.
- **Native side:** `ensureOpen()` uses a lock, so concurrent first calls open the database once.
- **Rust side:** one `static Mutex<Option<SqliteConnection>>` serialises all calls, so each API call is atomic relative to the others, and a reader never sees a half-finished write.
- **SQLite side:** `PRAGMA foreign_keys = ON` enforces references; multi-table writes use `connection.transaction`, so they commit all-or-nothing.
- **Money:** amounts travel as strings, are stored as integer cents (`amount_cents`), and are only formatted for display in the UI.
- **Dates:** the frontend sends `YYYY-MM-DD`; Rust stores unix seconds (`occurred_at`) and queries by month range via `YearMonth::start_timestamp` / `end_timestamp`.
