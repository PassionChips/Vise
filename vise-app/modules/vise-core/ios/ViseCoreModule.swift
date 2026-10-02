import ExpoModulesCore
import Foundation

// C ABI exported by rust-core/src/ffi.rs
@_silgen_name("vise_init")
private func vise_init(_ path: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?
@_silgen_name("vise_call")
private func vise_call(_ method: UnsafePointer<CChar>, _ payload: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?
@_silgen_name("vise_free")
private func vise_free(_ ptr: UnsafeMutablePointer<CChar>?)

/// Forwards (method, payloadJson) to rust-core's `api::dispatch` and returns its JSON reply.
/// The database lives in Application Support, so it persists across app restarts.
public class ViseCoreModule: Module {
  private let lock = NSLock()
  private var opened = false

  private func ensureOpen() throws {
    lock.lock()
    defer { lock.unlock() }
    if opened { return }
    let directory = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let path = directory.appendingPathComponent("vise.db").path
    if let failure = vise_init(path) {
      let message = String(cString: failure)
      vise_free(failure)
      throw Exception(name: "ERR_VISE_CORE_OPEN", description: message)
    }
    opened = true
  }

  public func definition() -> ModuleDefinition {
    Name("ViseCore")

    AsyncFunction("call") { (method: String, payload: String) -> String in
      try self.ensureOpen()
      guard let reply = vise_call(method, payload) else { return "" }
      defer { vise_free(reply) }
      return String(cString: reply)
    }
  }
}
