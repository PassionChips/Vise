# Payment capture end-to-end test

Checks that a notification from a payment app is noticed while the app runs, parsed, put in the inbox, and
confirmed into a real transaction.

```bash
# 1. A DEBUG build of the app on an emulator or phone (a release build ignores test notifications on purpose)
npx expo run:android
# 2. Run the test; this starts the helper that posts the notifications and runs the flow
npm run e2e:capture
```

The payment apps cannot be made to send a notification on demand, and a test must not spend real money. So the test
posts notifications through Android (`adb shell cmd notification post`) with an app tag in the title, e.g.
`[phonepe] Paid ₹250 to Starbucks`. A debuggable build treats a notification from the shell with such a tag as if that
app had posted it (`DebugPaymentNotifications.kt`); everything after that is the real path: the Android notification
listener, the Rust parser, the inbox, and the live update on screen.

It does **not** test the real GPay or PhonePe apps. Their actual wording must be checked by hand, and every real
example you collect belongs in `rust-core/src/capture/parser/tests.rs`.

It is kept out of `maestro test .maestro` (it needs the helper running), so the normal suite is unaffected.
