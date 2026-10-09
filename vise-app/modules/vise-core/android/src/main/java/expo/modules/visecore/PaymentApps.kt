package expo.modules.visecore

/**
 * The only apps whose notifications VISE reads: payment apps, not banks. Anything else is dropped without being
 * looked at. This list must match `SUPPORTED_PACKAGES` in rust-core/src/capture/apps.rs (a test checks it).
 */
object PaymentApps {
  val PACKAGES = setOf(
    "com.google.android.apps.nbu.paisa.user", // Google Pay (India)
    "com.google.android.apps.walletnfcrel", // Google Wallet
    "com.phonepe.app", // PhonePe
    "com.revolut.revolut", // Revolut
    "com.paypal.android.p2pmobile", // PayPal
    "net.one97.paytm", // Paytm
    "com.transferwise.android", // Wise
    "com.venmo", // Venmo
    "com.squareup.cash", // Cash App
  )
}
