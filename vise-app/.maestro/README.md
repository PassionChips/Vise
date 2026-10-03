# Maestro end-to-end tests

UI flows that drive the real app on an emulator or device, through the whole stack
(screen → `viseCore.ts` → Rust → SQLite and back).

## Run

```bash
# 1. Install Maestro once: https://docs.maestro.dev/getting-started/installing-maestro
# 2. Build the Rust core and install the app (rebuild the core after pulling changes in rust-core/)
./scripts/build-android-core.sh
npx expo run:android --variant release   # release embeds the JS, so no Metro is needed
# 3. With the emulator/device running:
npm run e2e                               # all flows
maestro test .maestro/flows/04-add-expense.yaml   # one flow
```

If you test a debug build instead, start Metro first (`npx expo start --dev-client`).

## Rules these flows rely on

- App id is `com.reborn_lvl.viseapp`.
- Every flow starts with `launchApp: clearState: true`, which deletes `vise.db`, so each flow
  starts from an empty database and is independent of the others. **This erases the app's data on
  the device.** Don't run it against a device holding data you want to keep.
- Selectors use visible text and accessibility labels (the app has no `testID`s). If you rename
  a label in the UI, update the flows that use it.

## Flows

| File | Covers |
|---|---|
| `01-onboarding-full` | All 5 onboarding steps, saved through `completeOnboarding` |
| `02-onboarding-skip` | Skipping every optional step |
| `03-tabs-navigation` | Each bottom tab opens |
| `04-add-expense` | Add expense; appears in Transactions and Dashboard (UI refresh) |
| `05-add-income` | Quick-add sheet → income |
| `06-transaction-validation` | Empty form and invalid amount are rejected |
| `07-transaction-search-delete-undo` | Search, delete, undo |
| `08-budget-create-edit-delete` | Category budget lifecycle |
| `09-settings-profile` | Settings reflect onboarding; edit name |
| `10-settings-edit-values` | Income, threshold (incl. rust-core validation), currency |
| `11-theme-and-avatar` | Theme and avatar saves. Fails with "unknown field" if `librust_core.so` is stale |
| `12-data-export-and-delete-all` | CSV export, cancel, delete all → back to onboarding |
| `13-persistence-after-restart` | Data is still there after killing and relaunching |

`subflows/` holds shared steps (`fresh-start`, `onboard`, `add-expense`, `open-tab`).
Tags: `smoke`, `onboarding`, `transactions`, `validation`, `settings`, `data`, `persistence`,
`regression`. Run a group with `maestro test .maestro --include-tags=smoke`.

## Troubleshooting

- **"Not saved … unknown field"**: stale Rust library. Run `./scripts/build-android-core.sh`
  and reinstall the app.
- **Element not found**: the text differs from the flow. Run `maestro studio` to inspect the screen.
- **Keyboard covers a button**: the flows call `hideKeyboard`; add it before the tap that fails.
