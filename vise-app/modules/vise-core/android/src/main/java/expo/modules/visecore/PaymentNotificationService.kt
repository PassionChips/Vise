package expo.modules.visecore

import android.app.Notification
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Reads payment notifications once the user has turned on Notification access for VISE in Android Settings.
 *
 * It looks only at apps in [PaymentApps]; every other notification is ignored before its text is read. The title
 * and text of an allowed notification go to rust-core, which parses them on the phone and keeps the result in the
 * "to review" inbox. Nothing is sent anywhere, and nothing becomes a transaction until the user confirms it.
 */
class PaymentNotificationService : NotificationListenerService() {
  // Database work off the main thread; one at a time keeps notifications in order.
  private val worker = Executors.newSingleThreadExecutor()

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val notification = sbn.notification ?: return
    // A "3 new notifications" summary repeats the ones inside it.
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val extras = notification.extras
    var title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    var packageName = sbn.packageName
    if (packageName !in PaymentApps.PACKAGES) {
      // Only an automated test, in a debuggable build, can pass here; see DebugPaymentNotifications.
      val test = DebugPaymentNotifications.resolve(applicationContext, packageName, title) ?: return
      packageName = test.first
      title = test.second
    }
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
      ?.toString()
      .orEmpty()
    if (title.isBlank() && text.isBlank()) return

    val postedAt = sbn.postTime
    val payload = JSONObject()
      .put("package", packageName)
      .put("title", title.take(200))
      .put("text", text.take(600))
      .put("posted_at", postedAt / 1000)
      // The phone's own date when it happened, so a payment at 11 pm is not dated tomorrow in UTC.
      .put("local_date", SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(postedAt)))
      .toString()

    val context = applicationContext
    worker.execute {
      try {
        val reply = NativeCore.call(context, "captureNotification", payload)
        // Tell the app, if it is open, so the inbox updates the moment a payment is noticed.
        if (JSONObject(reply).optJSONObject("data")?.optString("status") == "captured") {
          context.sendBroadcast(Intent(ACTION_CAPTURED).setPackage(context.packageName))
        }
      } catch (error: Throwable) {
        // A notification that cannot be read must never crash the user's phone or leave a trace of its text.
      }
    }
  }

  override fun onDestroy() {
    worker.shutdown()
    super.onDestroy()
  }

  companion object {
    /** Sent inside the app when a payment lands in the inbox. */
    const val ACTION_CAPTURED = "expo.modules.visecore.PAYMENT_CAPTURED"
  }
}
