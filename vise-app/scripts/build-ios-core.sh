#!/usr/bin/env bash
# Builds rust-core as a universal static library for the iOS Expo module. macOS + Xcode only.
# Needs: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios`.
set -euo pipefail
cd "$(dirname "$0")/../rust-core"
out=../modules/vise-core/ios
for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  cargo build --release --target "$target"
done
# One archive per platform slice: device, and a fat simulator library.
mkdir -p target/ios
lipo -create \
  target/aarch64-apple-ios-sim/release/librust_core.a \
  target/x86_64-apple-ios/release/librust_core.a \
  -output target/ios/libvise_core_sim.a
cp target/aarch64-apple-ios/release/librust_core.a "$out/libvise_core.a"
echo "Device library copied to $out/libvise_core.a."
echo "For the simulator, copy target/ios/libvise_core_sim.a over it (or use an xcframework)."
