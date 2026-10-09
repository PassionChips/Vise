package expo.modules.visecore

import android.content.Context
import java.io.File

/**
 * The entry point into rust-core that does not depend on the React Native module, so a background service
 * (the payment notification listener) can use the same database. The library and the one SQLite connection are
 * shared by the whole process: a call from here and a call from the app are serialised by rust-core.
 *
 * JNI: implemented in rust-core/src/ffi.rs (names must match this package and object).
 */
object NativeCore {
  init {
    System.loadLibrary("rust_core")
  }

  @JvmStatic external fun nativeInit(path: String): String

  @JvmStatic external fun nativeCall(method: String, payload: String): String

  private val lock = Any()
  private var opened = false

  /** Opens the database in the app's private files directory, once. Safe to call from any thread. */
  fun ensureOpen(context: Context) {
    synchronized(lock) {
      if (opened) return
      val failure = nativeInit(File(context.filesDir, "vise.db").absolutePath)
      if (failure.isNotEmpty()) throw IllegalStateException(failure)
      opened = true
    }
  }

  /** Runs one API call and returns rust-core's JSON reply. */
  fun call(context: Context, method: String, payload: String): String {
    ensureOpen(context)
    return nativeCall(method, payload)
  }
}
