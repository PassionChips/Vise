#!/usr/bin/env bash
# Builds rust-core as librust_core.so for each Android ABI into the Expo module.
# Needs: Android NDK (ANDROID_NDK_HOME), `cargo install cargo-ndk`, and
# `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`.
set -euo pipefail
cd "$(dirname "$0")/../rust-core"
cargo ndk \
  -t arm64-v8a -t armeabi-v7a -t x86_64 \
  -o ../modules/vise-core/android/src/main/jniLibs \
  build --release
