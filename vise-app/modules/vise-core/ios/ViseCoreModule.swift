import ExpoModulesCore
import Foundation
import UIKit
import Vision

// C ABI exported by rust-core/src/ffi.rs
@_silgen_name("vise_init")
private func vise_init(_ path: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?
@_silgen_name("vise_call")
private func vise_call(_ method: UnsafePointer<CChar>, _ payload: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?
@_silgen_name("vise_free")
private func vise_free(_ ptr: UnsafeMutablePointer<CChar>?)

/// Forwards (method, payloadJson) to rust-core's `api::dispatch` and returns its JSON reply, and
/// reads text from a photo on the device (`recognizeText`) for receipt scanning.
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
    // Nothing leaves the phone unless the user backs it up themselves, so keep the database out of iCloud
    // backups. This has to happen after vise_init, which creates the file.
    var databaseURL = URL(fileURLWithPath: path)
    var excluded = URLResourceValues()
    excluded.isExcludedFromBackup = true
    try? databaseURL.setResourceValues(excluded)
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

    // Reading other apps' payment notifications is an Android feature; iOS does not allow it.
    Function("isPaymentCaptureEnabled") { () -> Bool in false }
    Function("openPaymentCaptureSettings") {}

    // On-device OCR with Apple's Vision framework. Returns a JSON array of
    // {text, left, top, right, bottom} (top-left origin, 0...1), one entry per line of text;
    // rust-core joins the lines that sit on the same row. The photo never leaves the phone.
    AsyncFunction("recognizeText") { (uri: String) -> String in
      guard let url = URL(string: uri),
        let data = try? Data(contentsOf: url),
        let image = UIImage(data: data),
        let cgImage = image.cgImage
      else {
        throw Exception(name: "ERR_OCR", description: "Could not open the photo.")
      }

      var lines: [[String: Any]] = []
      let request = VNRecognizeTextRequest { request, _ in
        for case let observation as VNRecognizedTextObservation in request.results ?? [] {
          guard let candidate = observation.topCandidates(1).first else { continue }
          let box = observation.boundingBox  // normalised, origin at the bottom left
          lines.append([
            "text": candidate.string,
            "left": box.minX,
            "top": 1 - box.maxY,
            "right": box.maxX,
            "bottom": 1 - box.minY,
          ])
        }
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = false

      let handler = VNImageRequestHandler(
        cgImage: cgImage, orientation: ViseCoreModule.orientation(of: image), options: [:])
      do {
        try handler.perform([request])
        let json = try JSONSerialization.data(withJSONObject: lines)
        return String(data: json, encoding: .utf8) ?? "[]"
      } catch {
        throw Exception(name: "ERR_OCR", description: "Could not read the photo: \(error.localizedDescription)")
      }
    }
  }

  private static func orientation(of image: UIImage) -> CGImagePropertyOrientation {
    switch image.imageOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
