package expo.modules.visecore

import android.content.Context
import android.content.pm.ApplicationInfo

/**
 * For automated tests only. The payment apps themselves cannot be made to send a notification on demand (and a test
 * must not spend real money), so in a **debuggable** build a notification posted from the shell
 * (`adb shell cmd notification post`) whose title starts with an app tag is treated as if that app had posted it:
 *
 *     adb shell cmd notification post -S bigtext -t "[phonepe] Paid ₹250 to Starbucks" tag "Payment successful"
 *
 * A release build never does this: it checks the debuggable flag at runtime, so shipping a normal build cannot
 * accept notifications from the shell. Everything after this point is the real path: the listener, the Rust parser,
 * the inbox.
 */
object DebugPaymentNotifications {
  private const val SHELL = "com.android.shell"
  private val TAG = Regex("^\\[([a-z]+)]\\s*(.*)$", RegexOption.DOT_MATCHES_ALL)

  private val APPS = mapOf(
    "gpay" to "com.google.android.apps.nbu.paisa.user",
    "wallet" to "com.google.android.apps.walletnfcrel",
    "phonepe" to "com.phonepe.app",
    "revolut" to "com.revolut.revolut",
    "paypal" to "com.paypal.android.p2pmobile",
    "paytm" to "net.one97.paytm",
    "wise" to "com.transferwise.android",
    "venmo" to "com.venmo",
    "cashapp" to "com.squareup.cash",
  )

  /** The payment app a test notification stands for, and its title without the tag; null if it is not a test one. */
  fun resolve(context: Context, packageName: String, title: String): Pair<String, String>? {
    if (packageName != SHELL) return null
    if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0) return null
    val match = TAG.find(title) ?: return null
    val app = APPS[match.groupValues[1]] ?: return null
    return app to match.groupValues[2]
  }
}
