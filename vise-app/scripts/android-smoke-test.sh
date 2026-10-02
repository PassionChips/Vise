#!/usr/bin/env bash
# Installs the release APK on the connected device/emulator, starts it with fresh data and checks that
#  - the Rust core opened (a fresh install must reach the onboarding welcome screen; if the native
#    library or database failed, the app shows "Couldn't load your data" instead), and
#  - the app did not crash.
# Usage: scripts/android-smoke-test.sh path/to/app-release.apk   (needs adb on PATH)
set -euo pipefail

APK="${1:?usage: $0 path/to/app.apk}"
PACKAGE="com.reborn_lvl.viseapp"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

screen_has() { grep -q "$1" "$WORK/ui.xml" 2>/dev/null; }
dump_ui() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$WORK/ui.xml" >/dev/null 2>&1
}
fail() {
  echo "::error::$1"
  echo "--- last UI dump (text and descriptions) ---"
  grep -oE '(text|content-desc)="[^"]+"' "$WORK/ui.xml" 2>/dev/null | head -30 || true
  echo "--- logcat (errors) ---"
  adb logcat -d -s AndroidRuntime:E ReactNativeJS:E ReactNative:E DEBUG:F 2>/dev/null | tail -60 || true
  exit 1
}

adb wait-for-device
adb install -r "$APK"
adb shell pm clear "$PACKAGE" >/dev/null 2>&1 || true # fresh database every run
adb logcat -c

launch() { adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; }

launch
reached=""
for _ in $(seq 1 60); do
  sleep 3
  dump_ui || continue
  if screen_has "load your data"; then
    fail "App started but the Rust core did not load (error screen shown)"
  fi
  if screen_has "Get started"; then reached=yes; break; fi
done
[ -n "$reached" ] || fail "Welcome screen never appeared within 3 minutes"
echo "OK: core loaded, onboarding welcome screen shown on a fresh install"

if adb logcat -d | grep -E "FATAL EXCEPTION|UnsatisfiedLinkError|Process: $PACKAGE.*died"; then
  fail "The app logged a crash or could not load a native library"
fi

# Restart: the database must open again from disk and still show onboarding (nothing was saved).
adb shell am force-stop "$PACKAGE"
launch
reached=""
for _ in $(seq 1 30); do
  sleep 3
  dump_ui || continue
  screen_has "load your data" && fail "Core failed to reopen after a restart"
  if screen_has "Get started"; then reached=yes; break; fi
done
[ -n "$reached" ] || fail "Welcome screen did not reappear after a restart"
echo "OK: app restarts cleanly"
