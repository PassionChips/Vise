# Scanning a receipt (on-device OCR)

"Scan receipt" reads a photo of a bill and fills in the Add expense form. The user always checks and
saves it; nothing is saved by the scan itself. **The photo is read on the phone and never uploaded.**

```
Camera / photo ─▶ ML Kit (Android) / Vision (iOS) ─▶ lines of text + boxes ─▶ Rust parseReceipt ─▶ pre-filled form
 expo-image-picker      modules/vise-core: recognizeText                      receipt.rs
```

## Where to find it

- Dashboard → **+** → **Scan receipt** (opens the camera straight away).
- Add expense → **Scan receipt** → Take a photo / Choose a photo.

## Functions, in order

| Step | Function | File | Does |
|---|---|---|---|
| 1 | `scanReceipt(source, defaults)` | `src/data/receiptScan.ts` | Asks for camera permission, opens the camera or the photo library, deletes the cached photo afterwards |
| 2 | `recognizeLines(uri)` | `src/services/ocr.ts` | Calls the native `recognizeText` and parses its JSON |
| 3 | `recognizeText` | `ViseCoreModule.kt` (ML Kit, bundled Latin model) / `ViseCoreModule.swift` (Vision) | Returns `[{text, left, top, right, bottom}]`, one entry per line of text |
| 4 | `parseReceipt(input)` | `src/services/viseCore.ts` → `api.rs` → `receipt::parse` | Sends the lines to Rust |
| 5 | `receipt::rows_from_lines` | `rust-core/src/receipt.rs` | Joins lines on the same row, so `TOTAL` and `45.30` (separate OCR blocks) end up together |
| 6 | `find_merchant`, `find_date`, `find_totals`, `find_currency` | `receipt.rs` | Reads the rows (below) |
| 7 | `categorize::suggest_category` | `importer/categorize.rs` | Suggests the category the user usually files that merchant under |
| 8 | `runScan` | `app/add-transaction.tsx` | Fills amount, description, date, currency and category; shows `ScanNotes` |

## How the total is chosen

Each row with a price (two decimals; `12.50` or `12,50`; dates, times and percentages ignored) gets a score:

| Row | Score |
|---|---|
| Starts with `TOTAL`, `Grand total`, `Amount due`, `Summe`, `Gesamt`, `Zu zahlen`... | 100 to 110 |
| Contains `total` / `summe` elsewhere | 70 |
| A card payment line (`VISA`, `Karte`, `Paid`...) | 50 |
| Any other price | 10 |
| **Never offered:** subtotal, VAT / tax, cash, change, tip, discount, German `Bar` / `Rückgeld` | 0 |

The largest amount gets +30. `Total VAT 4.50` is not a total; `Total (incl. VAT) 54.00` is. The best
guess goes in the form and the other amounts appear under it as one-tap alternatives. If nothing is labelled, or
several totals disagree, the screen warns.

## Limits

- OCR quality depends on light and print. Faded thermal paper and curved receipts need a retake.
- Latin script only (English, German, French, Spanish...). No Arabic, Hindi or CJK receipts yet.
- Only the total is read, not individual items.
- Receipts differ by store and country; the label lists are in `receipt.rs` and are easy to extend. Add a
  failing example to `receipt/tests.rs` first.
- The Android build adds about 4 MB per CPU architecture for the bundled ML Kit model.
- iOS code (`ViseCoreModule.swift`) has not been compiled yet; it needs a Mac.

## After pulling this

New native modules (`expo-image-picker`, ML Kit), so rebuild: `npx expo prebuild --platform android`,
`./scripts/build-android-core.sh`, then `npx expo run:android`. Expo Go cannot run it.
