package expo.modules.visecore

import android.net.Uri
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
import java.io.File

/**
 * Forwards (method, payloadJson) to rust-core's `api::dispatch` and returns its JSON reply, and
 * reads text from a photo on the device (`recognizeText`) for receipt scanning.
 * The database lives in the app's private files directory, so it persists across app restarts
 * and is removed only when the app is uninstalled or its data is cleared.
 */
class ViseCoreModule : Module() {
  private val lock = Any()
  private var opened = false

  // JNI entry points; implemented in rust-core/src/ffi.rs (names must match this package/class).
  private external fun nativeInit(path: String): String
  private external fun nativeCall(method: String, payload: String): String

  private fun ensureOpen() {
    synchronized(lock) {
      if (opened) return
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val failure = nativeInit(File(context.filesDir, "vise.db").absolutePath)
      if (failure.isNotEmpty()) throw CodedException("ERR_VISE_CORE_OPEN", failure, null)
      opened = true
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ViseCore")

    // AsyncFunction runs off the main thread.
    AsyncFunction("call") { method: String, payload: String ->
      ensureOpen()
      nativeCall(method, payload)
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

  companion object {
    init {
      System.loadLibrary("rust_core")
    }
  }
}
