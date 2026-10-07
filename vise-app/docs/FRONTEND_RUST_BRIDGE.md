# Frontend ↔ Rust bridge

How the React Native (Expo) frontend sends data to `rust-core`, and how the reply gets back.
For what happens after the data reaches SQLite, see [PERSISTENCE.md](PERSISTENCE.md).

## In one sentence

The frontend never calls Rust functions directly. It calls **one native function**,
`call(method, payloadJson)`, passing a method name and a JSON string. Rust parses the JSON, runs
the use case, and returns a JSON string. Everything else is plumbing around that.

## The path of a call

```
Screen (app/**)
  │  addTransaction({ amount: "12.50", ... })
  ▼
src/services/viseCore.ts          JSON.stringify(payload)
  │  native.call("addTransaction", '{"amount":"12.50",...}')     (JS → native, async)
  ▼
modules/vise-core                 Expo module "ViseCore"
  ├─ Android: ViseCoreModule.kt   nativeCall(...)  ── JNI ──┐
  └─ iOS:     ViseCoreModule.swift vise_call(...)   ── C ABI┤
                                                            ▼
rust-core/src/ffi.rs              lock the one SQLite connection
  ▼
rust-core/src/api.rs              dispatch(conn, method, payload)
  ▼
service → repository → SQLite
  ▼
reply string  {"ok":true,"data":...}  or  {"ok":false,"error":{...}}
  ▲
  └── travels back the same way; viseCore.ts parses it and resolves or throws
```

## The pieces

### 1. Frontend client: [src/services/viseCore.ts](../src/services/viseCore.ts)

The only TypeScript file that talks to Rust. Screens import typed functions from it
(`addTransaction`, `listTransactions`, `getMonthlySummary`, …) and never touch JSON.

- Looks up the native module with `requireOptionalNativeModule('ViseCore')`. If it is missing,
  the call throws a `ViseError` of kind `bridge_unavailable`.
- `call<T>(method, payload)` does `JSON.stringify(payload)`, awaits `native.call(...)`,
  `JSON.parse`s the reply, and either returns `reply.data` or throws `ViseError(reply.error)`.
- `mutate<T>` is `call` plus `invalidateData()` on success, so every mounted screen reloads
  (see `useCoreQuery` in [src/data/store.ts](../src/data/store.ts)). Reads use `call`, writes use `mutate`.
- Payload types live in [src/services/types.ts](../src/services/types.ts) and mirror the Rust structs.

### 2. Native module: [modules/vise-core/](../modules/vise-core/)

An Expo module registered as `ViseCore` ([expo-module.config.json](../modules/vise-core/expo-module.config.json)).
It exposes a single `AsyncFunction("call")`, which runs off the UI thread. Its jobs:

1. **Open the database lazily** on the first call (`ensureOpen`, guarded by a lock), at
   `filesDir/vise.db` on Android and `Application Support/vise.db` on iOS.
2. **Forward** `(method, payload)` to Rust and return the reply string unchanged.

| Platform | File | How it reaches Rust |
|---|---|---|
| Android | [ViseCoreModule.kt](../modules/vise-core/android/src/main/java/expo/modules/visecore/ViseCoreModule.kt) | `System.loadLibrary("rust_core")`, then JNI `external fun nativeInit` / `nativeCall` |
| iOS | [ViseCoreModule.swift](../modules/vise-core/ios/ViseCoreModule.swift) | `@_silgen_name` bindings to the C functions `vise_init` / `vise_call` / `vise_free` |

### 3. FFI layer: [rust-core/src/ffi.rs](../rust-core/src/ffi.rs)

Exports the entry points the native module calls:

| Function | Platform | Purpose |
|---|---|---|
| `Java_expo_modules_visecore_ViseCoreModule_nativeInit` | Android (JNI) | Open the DB; returns `""` or an error message |
| `Java_expo_modules_visecore_ViseCoreModule_nativeCall` | Android (JNI) | Run one call; returns the JSON reply |
| `vise_init(path)` | iOS (C ABI) | Same as above; returns null on success |
| `vise_call(method, payload)` | iOS (C ABI) | Same; reply must be released with `vise_free` |
| `vise_free(ptr)` | iOS (C ABI) | Frees a string Rust allocated |

Both sets are thin wrappers over the same two Rust functions, `init(path)` and `call(method, payload)`.

- The connection is a `static Mutex<Option<SqliteConnection>>`. Calls from different threads are
  serialised, so each API call is atomic with respect to the others.
- A call before `init`, a poisoned lock, or non-UTF-8 input returns an `{"ok":false,"error":{"kind":"database",...}}`
  reply instead of panicking.
- JNI function names encode the Kotlin package and class. **Renaming `expo.modules.visecore.ViseCoreModule`
  breaks the link** unless the Rust names change too.

### 4. API boundary: [rust-core/src/api.rs](../rust-core/src/api.rs)

`dispatch(connection, method, payload)` is where Rust "gets the data from the frontend":

1. `match method` selects the use case (`"addTransaction"` → `service::add_transaction`, …).
2. `parse(payload)` deserialises the JSON string into a Rust struct with `serde_json`. An empty
   payload counts as `{}`, so list calls need no arguments.
3. The service function validates and runs the logic, then the result is serialised back to JSON.
4. The result is wrapped in the envelope below. `dispatch` never panics on bad input.

Payload structs use `#[serde(deny_unknown_fields)]`: a misspelled or extra key from the frontend
is rejected as `invalid_request` rather than silently ignored.

## Message format

**Request**: two strings.

```
method  = "addTransaction"
payload = {"transaction_type":"expense","amount":"12.50","currency":"EUR",
           "description":"Lunch","date":"2026-09-01","expense_category_id":3}
```

Amounts are sent **as the user typed them** (`"12.50"`). Rust parses them into integer cents
([money.rs](../rust-core/src/money.rs)); the frontend does no money maths.

**Reply**: one JSON string, always this envelope.

```jsonc
{ "ok": true,  "data": { /* method-specific result, or null */ } }
{ "ok": false, "error": { "kind": "validation", "field": "amount", "message": "..." } }
```

| `error.kind` | Meaning | Source |
|---|---|---|
| `validation` | Input rejected; `field` names the form field to highlight | Rust |
| `not_found` | Record does not exist | Rust |
| `invalid_request` | Unknown method or malformed payload | Rust |
| `database` | Unexpected DB failure, or DB not open | Rust |
| `bridge_unavailable` | Native module missing from this build | `viseCore.ts` only |

In TypeScript every failure becomes a thrown `ViseError` with `kind`, `field` and `message`.
If Rust reports `Unknown method`, `explain()` rewrites it to "rebuild the core and reinstall",
since the `.so`/`.a` is built separately from the JS bundle.

## Methods

Defined in `handle()` in [api.rs](../rust-core/src/api.rs) and mirrored in `viseCore.ts`:

- **Transactions**: `addTransaction`, `updateTransaction`, `deleteTransaction`, `listTransactions`
- **Categories / income**: `listCategories`, `addCategory`, `listIncomeSources`, `addIncomeSource`
- **Budgets**: `setMonthBudget`, `setCategoryBudget`, `deleteCategoryBudget`
- **Settings / onboarding**: `getSettings`, `updateSettings`, `completeOnboarding`
- **Data**: `getDataOverview`, `exportDataCsv`, `deleteAllData`
- **Reports**: `getMonthlySummary`, `getCategoryBreakdown`, `getSpendingTrend`, `predictSpending`

## Building the native library

Rust is compiled separately and dropped into the Expo module:

| Target | Script | Output |
|---|---|---|
| Android | [scripts/build-android-core.sh](../scripts/build-android-core.sh) | `modules/vise-core/android/src/main/jniLibs/<abi>/librust_core.so` |
| iOS (macOS only) | [scripts/build-ios-core.sh](../scripts/build-ios-core.sh) | `modules/vise-core/ios/libvise_core.a` |

`Cargo.toml` builds the crate as `rlib` (tests), `cdylib` (Android) and `staticlib` (iOS).
After changing Rust, rebuild the library and reinstall the app, or the app keeps the old core.

## Adding a new method

Only three places change; the Kotlin/Swift/JNI glue stays untouched.

1. **Rust service**: add the use case in `rust-core/src/service*`, with an input struct deriving
   `Deserialize` (+ `deny_unknown_fields`).
2. **Rust API**: add a `"yourMethod" => to_json(service::your_method(connection, &parse(payload)?))`
   arm in `handle()` in `api.rs`, plus a test.
3. **TypeScript**: add the input/output types to `src/services/types.ts` and an exported function
   in `viseCore.ts` (`call` for reads, `mutate` for writes). Use the exact same method string.

Then rebuild the native library.
