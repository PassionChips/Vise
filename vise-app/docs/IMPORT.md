# Importing a CSV with any columns

`rust-core/src/importer/` reads a transactions file whose columns can be named or ordered any way,
works out what each column is, and saves the rows. The user always sees a preview first.

```
file text ─▶ previewImport ─▶ (user checks / corrects) ─▶ commitImport ─▶ SQLite
              writes nothing                               one DB transaction
```

Both methods take the same input, so what the preview shows is exactly what is saved.

| Input field | Meaning |
|---|---|
| `content` | The CSV text (max 10 MB, 50,000 rows) |
| `today` | `YYYY-MM-DD`, used when a row has no date anywhere |
| `default_currency` | For rows without a currency (usually the app's currency) |
| `mapping` | Optional column numbers that override detection: `date`, `description`, `amount`, `debit`, `credit`, `transaction_type`, `currency` |
| `date_order` | Optional `dmy` / `mdy` / `ymd` |
| `decimal_separator` | Optional `dot` / `comma` |
| `positive_is` | Optional `income` / `expense`, for files with no sign convention |
| `skip_duplicates` | Default `true` |

TypeScript: `previewImport(input)` and `commitImport(input)` in `src/services/viseCore.ts`; types in
`src/services/types.ts` (`ImportInput`, `ImportPreview`, `ImportSummary`).

## What it works out (functions)

| Step | Function | Does |
|---|---|---|
| 1 | `table::read_table` | Detects `,` `;` tab `\|`, strips a BOM, skips title lines, finds the header row (or numbers the columns) |
| 2 | `columns::detect` | Picks columns from header synonyms (`Booking date`, `Narration`, `Money out` ...) and from the cell contents, so unknown names still work |
| 3 | `dates::guess_order` / `parse_date` | ISO, `dd/mm/yyyy`, `mm/dd/yyyy`, `1.9.26`, `1 Sep 2026`, date-times, Excel serials, Unix timestamps. Day-first vs month-first comes from the whole column |
| 4 | `amounts::guess_decimal` / `parse_signed_cents` | `1.234,56`, `1,234.56`, `(12.50)`, `12.50-`, `€ 12`, `12 EUR`. Exact integer cents, never `f64` |
| 5 | `importer::analyze` | Builds each row, decides income / expense, skips totals and blank rows, reports bad rows by line number |
| 6 | `importer::fill_dates` | Fills missing dates (below) |
| 7 | `importer::mark_duplicates` | Compares with stored transactions |
| 8 | `importer::commit` | Inserts the new rows in one `connection.transaction` |

## Income or expense

1. A type column (`Debit`, `Credit`, `Purchase`, `Refund`, `Transfer` ...) wins.
2. Separate debit / credit columns decide it.
3. Otherwise a negative amount is an expense; a positive one is income if the file has any negatives.
4. If every amount is positive, rows are read as expenses and the preview warns. `positive_is` changes that.

## Missing dates

For a row with no date: the nearest dated row **above**, else the nearest dated row **below**,
else the **import day**. Rows that borrow a date get one extra second each, so they keep the file
order inside that day. A date that is present but unreadable (`32/13/2026`) is a row error, never guessed.
The preview counts how many rows were filled (`filled_from_above`, `filled_from_below`,
`filled_with_import_date`) and warns if more than half were.

## Duplicates

A row is a duplicate if a stored transaction has the same day, amount, currency, type and description
(case and spacing ignored). Each stored transaction cancels at most **one** file row, so two real
identical purchases in the file are both kept, and importing the same file twice adds nothing.

## Categorizing (`importer/categorize.rs`)

The user confirms one category per **group**, not per row. Only expenses and refunds are grouped;
income and transfers are not.

```
previewImport ─▶ groups [ {key, label, rows, total, suggestion} ... ]
user taps through / accepts ─▶ commitImport { categories: [ {group, category_id | new_category} ] }
```

| Group | Made from | Suggestion |
|---|---|---|
| `cat:<name>` (`file_category`) | A category column in the file (`Category`, `Label`, `Tag` ...). "Uncategorized", "N/A" and blanks count as no category | The existing category with that name (case-insensitive), or a **new** one with that name |
| `m:<merchant>` (`merchant`) | The description with numbers, punctuation and words like `POS`, `CARD PAYMENT TO` removed, first two words kept. `LIDL STORE 1234 BERLIN` and `Lidl Berlin 77` are one group | The category the user used most for that merchant in their stored transactions (`source: "history"`) |

- **Learns by itself.** Categorized rows are stored with their category, so the next import's history
  already contains them. No rule table is needed.
- **Nothing is applied unless chosen.** `commitImport` only uses the `categories` it is sent. Groups left
  out are saved uncategorized, so the user is never forced to pick.
- **One choice per group**: `category_id` (existing) or `new_category` (name; an existing category with that
  name is reused, otherwise it is created). Both, or an unknown group key or category id, is a validation error.
- **All or nothing.** Choices, new categories and rows are saved in the same database transaction.
- The preview returns up to 500 groups, biggest spending first.

Frontend helpers in `src/data/importCategories.ts`: `suggestedChoices(groups)` (accept every suggestion in one
call), `withChoice(choices, choice)` (user picks another category), `categorizedRowCount(groups, choices)`.

## Not done yet

- `.xlsx` files (export to CSV for now).
- Built-in keyword rules for first-time users (for example `uber` → Transport). Today a new user gets
  suggestions only from a category column in the file; history fills in after the first import.
- The screen: file picker, preview, the grouped category list with pickers, and a "fix the columns" step.
  The API and helpers are ready for it.

After pulling this, rebuild the native library (`scripts/build-android-core.sh`) and reinstall the app,
otherwise the old `librust_core.so` answers `Unknown method 'previewImport'`.
