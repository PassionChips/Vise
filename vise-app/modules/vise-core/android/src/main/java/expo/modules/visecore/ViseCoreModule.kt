package expo.modules.visecore

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.provider.Settings
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * Forwards (method, payloadJson) to rust-core's `api::dispatch` and returns its JSON reply, and
 * reads text from a photo on the device (`recognizeText`) for receipt scanning.
 * The database lives in the app's private files directory, so it persists across app restarts
 * and is removed only when the app is uninstalled or its data is cleared.
 */
class ViseCoreModule : Module() {
  private fun context() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // A payment was noticed by the notification service (a separate component): pass it on to the screens.
  private var capturedReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("ViseCore")

    Events("onPaymentCaptured")

    OnCreate {
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          sendEvent("onPaymentCaptured", Bundle())
        }
      }
      capturedReceiver = receiver
      val filter = IntentFilter(PaymentNotificationService.ACTION_CAPTURED)
      val context = appContext.reactContext
      if (context != null) {
        if (Build.VERSION.SDK_INT >= 33) {
          context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          context.registerReceiver(receiver, filter)
        }
      }
    }

    OnDestroy {
      capturedReceiver?.let { receiver -> appContext.reactContext?.unregisterReceiver(receiver) }
      capturedReceiver = null
    }

    // AsyncFunction runs off the main thread.
    AsyncFunction("call") { method: String, payload: String ->
      try {
        NativeCore.call(context(), method, payload)
      } catch (error: IllegalStateException) {
        throw CodedException("ERR_VISE_CORE_OPEN", error.message ?: "Could not open the database.", error)
      }
    }

    // Payment capture: has the user turned on Notification access for VISE, and take them to that screen.
    Function("isPaymentCaptureEnabled") {
      val context = context()
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      enabled.split(":").any { ComponentName.unflattenFromString(it)?.packageName == context.packageName }
    }

    Function("openPaymentCaptureSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context().startActivity(intent)
    }

    // On-device OCR. Resolves a JSON array of {text, left, top, right, bottom}, one entry per line of
    // text; rust-core joins the lines that sit on the same row. The photo never leaves the phone.
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_OCR", "The app is not ready to read photos.", null))
        return@AsyncFunction
      }
      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val lines = JSONArray()
            for (block in result.textBlocks) {
              for (line in block.lines) {
                val box = line.boundingBox ?: continue
                lines.put(
                  JSONObject()
                    .put("text", line.text)
                    .put("left", box.left)
                    .put("top", box.top)
                    .put("right", box.right)
                    .put("bottom", box.bottom)
                )
              }
            }
            recognizer.close()
            promise.resolve(lines.toString())
          }
          .addOnFailureListener { error ->
            recognizer.close()
            promise.reject(CodedException("ERR_OCR", error.message ?: "Could not read the photo.", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("ERR_OCR", error.message ?: "Could not open the photo.", error))
      }
    }
  }
}
