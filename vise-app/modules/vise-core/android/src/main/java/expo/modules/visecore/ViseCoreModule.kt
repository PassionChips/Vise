package expo.modules.visecore

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Forwards (method, payloadJson) to rust-core's `api::dispatch` and returns its JSON reply.
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
  }

  companion object {
    init {
      System.loadLibrary("rust_core")
    }
  }
}
