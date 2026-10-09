# Payment notifications (automatic capture)

When a payment app tells the user about a payment, VISE can notice it so they do not have to type it. It reads
notifications from **payment apps only, not banks**: Google Pay, Google Wallet, PhonePe, Revolut, PayPal, Paytm, Wise,
Venmo and Cash App. **Android only**: iOS does not let an app read other apps' notifications.

```
payment app notification ─▶ PaymentNotificationService (Kotlin, allowlist) ─▶ rust-core parser ─▶ "to review" inbox
                                                                                                    │
                                                          user confirms ─▶ a real transaction ◀────┘   (or dismisses)
```

## Principles

- **Opt-in, in plain words.** Android's Notification access is a special permission the user grants in Android
  Settings. `app/captured.tsx` explains exactly what is read before sending them there.
- **Only the listed apps.** The service drops every other notification before reading its text. The list is in two
  places that must match (`PaymentApps.kt` and `rust-core/src/capture/apps.rs`); a Rust test compares them, and Rust
  re-checks the package anyway.
- **Never silent.** A payment becomes a row in `captured_payments` (status `pending`), not a transaction. Only on
  **Add** does it become a transaction (`service::add_transaction`), so a misread notification can never change a total.
- **On the phone.** Parsing runs in Rust on the device. Nothing is uploaded.
- **Short-lived text.** The notification's text is stored only while the row is pending (to show what was read, 300
  characters at most) and is erased when it is added or dismissed. Rows are included in backups and removed by "Delete all
  my data".

## Pieces

| Piece | File | Does |
|---|---|---|
| Listener | `modules/vise-core/android/.../PaymentNotificationService.kt` | Allowlist check, skips group summaries, sends title, text, time and the phone's local date to Rust on a background thread |
| Native entry point | `NativeCore.kt` | Opens the same database and calls Rust without the React Native module, so it works while the app is closed |
| Parser | `rust-core/src/capture/parser.rs` | Direction, amount and currency, merchant, reference |
| Inbox | `rust-core/src/capture/mod.rs` (`captureNotification`, `listCaptured`, `confirmCaptured`, `dismissCaptured`) | Stores, deduplicates, suggests a category from history, confirms and dismisses |
| Screen | `app/captured.tsx` | Switch on, what is read, review: category, Add, Dismiss |
| Entry points | Settings → Payment notifications; a "N payments to review" banner on Transactions | |

## How a notification is read

The parser reads meaning, not one template per app, because wording changes between apps, versions and languages.

- **Not a completed payment** (ignored): requests, reminders, offers, cashback, OTPs, failures, "pending".
- **Direction:** "paid you", "received", "credited" are income; "you paid", "sent", "spent", "debited" are expenses.
  "Amit paid you ₹300" is income. Money with no clear direction becomes an item the user finishes by hand.
- **Amount:** next to a currency: `₹250`, `Rs. 99`, `INR 99`, `$25.00 USD`, `4,50 €`; `1,00,000` Indian grouping. A
  balance in the same message (`Available balance ₹4,500`) is never the amount.
- **Currency:** from the symbol or code. A bare `$` stays unnamed and the user's own currency is used when it is added.
- **Merchant:** the name after "to" / "from" / "at" (body first), else a title that is itself a name (Revolut shows the
  shop as the title), never a generic title like "Card payment".
- **Reference:** a UPI or transaction reference when present.

**Duplicates:** the same notification posted again is the same payment (same reference, or same app, amount, direction and
merchant within 10 minutes). A payment that matches one the user already entered the same day is **flagged**, not
dropped. Two real payments of the same amount hours apart are both kept.

**Dates:** the transaction is dated with the **phone's local date** when the notification arrived, so a payment at
11 pm is not dated tomorrow.

## Keeping the parser honest

The wordings in `rust-core/src/capture/parser/tests.rs` are written from how these apps are generally worded and are
**not copied from real captures**. Whenever a notification is misread, add the real text as a test case first, then fix
the parser. A few real examples per app is what makes it reliable.

## Limits

- Android only, and only while Notification access is on. Some phones (Xiaomi, Oppo, Samsung) stop background
  services; the service may need to be allowed to run in the background.
- A payment made while access is off is not noticed later.
- A notification the parser does not understand shows its text so the user can finish it by hand.
- Google Play requires a prominent disclosure and that this is a core feature; read the current policy before release.
- Apps can change their notifications at any time.

## After pulling this

The native library and the Android manifest changed (a new service, renamed JNI functions): run
`./scripts/build-android-core.sh` and `npx expo run:android`. Then in the app: Settings → Payment notifications → Turn on.

## End-to-end test (real-time capture)

`.maestro/capture/payment-capture.yaml` checks that a payment notification is noticed while the app is running, lands
in the inbox without a refresh, and can be confirmed into a transaction. It also checks that offers, money requests,
unsupported apps and repeats are not captured, and that access being off captures nothing.

```bash
npx expo run:android      # a DEBUG build; release builds ignore test notifications
npm run e2e:capture       # starts the notification helper, runs the flow, stops the helper
npm run test:e2e-helper   # unit tests of the helper (no device needed)
```

The real payment apps cannot be told to send a notification, so the test posts one through `adb shell cmd notification
post` with a tag in the title (`[phonepe] Paid ₹250 to Starbucks`). Only a debuggable build maps a shell notification
with such a tag to the tagged app (`DebugPaymentNotifications.kt`); from there it is the real path (listener, Rust
parser, inbox, live update). The wording of the real apps still has to be checked by hand.
