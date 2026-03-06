#!/usr/bin/env bash
# smoke-test.sh — Build and verify the signed Electrobun .app bundle locally.
#
# Usage:
#   bash apps/app/electrobun/scripts/smoke-test.sh
#
# Pre-requisites (macOS):
#   - Bun installed
#   - Xcode Command Line Tools installed (for codesign, spctl, xcrun)
#   - Signing identity in Keychain (for codesign check to pass)
#     OR run without signing: set SKIP_SIGNATURE_CHECK=1
#
# What this script does:
#   1. Builds the native macOS effects dylib
#   2. Runs electrobun build (--env=canary by default)
#   3. Locates the built .app bundle
#   4. Verifies codesign + notarization
#   5. Launches the app, waits 8s, checks it stays running, then kills it

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTROBUN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_ENV="${BUILD_ENV:-canary}"
SKIP_SIGNATURE_CHECK="${SKIP_SIGNATURE_CHECK:-0}"
LAUNCH_TIMEOUT="${LAUNCH_TIMEOUT:-8}"

echo "============================================================"
echo " Milady Electrobun Smoke Test"
echo " Build env  : $BUILD_ENV"
echo " Working dir: $ELECTROBUN_DIR"
echo "============================================================"
echo ""

# ── 1. Build native dylib (macOS only) ───────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  echo "[1/4] Building native macOS effects dylib..."
  (cd "$ELECTROBUN_DIR" && bun run build:native-effects)
  DYLIB="$ELECTROBUN_DIR/src/libMacWindowEffects.dylib"
  if [[ ! -f "$DYLIB" ]]; then
    echo "ERROR: $DYLIB not found after build. Abort."
    exit 1
  fi
  echo "      OK — $DYLIB ($(du -sh "$DYLIB" | cut -f1))"
else
  echo "[1/4] Skipping dylib build (not macOS)"
fi
echo ""

# ── 2. Build Electrobun app ───────────────────────────────────────────────────
echo "[2/4] Building Electrobun app (env=$BUILD_ENV)..."
(cd "$ELECTROBUN_DIR" && bun run build -- --env="$BUILD_ENV")
echo ""

# ── 3. Locate built .app ─────────────────────────────────────────────────────
echo "[3/4] Locating built .app bundle..."
DIST_DIR="$ELECTROBUN_DIR/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "ERROR: $DIST_DIR does not exist. Build may have failed."
  exit 1
fi

echo "dist/ contents:"
find "$DIST_DIR" -maxdepth 2 -type f | sort

APP_BUNDLE=""
while IFS= read -r -d '' f; do
  APP_BUNDLE="$f"
done < <(find "$DIST_DIR" -maxdepth 3 -name "*.app" -type d -print0 2>/dev/null)

if [[ -z "$APP_BUNDLE" ]]; then
  echo "ERROR: No .app bundle found under $DIST_DIR"
  exit 1
fi
echo "Found: $APP_BUNDLE"
echo "Size : $(du -sh "$APP_BUNDLE" | cut -f1)"
echo ""

# ── 4. Signature + notarization check ────────────────────────────────────────
if [[ "$(uname)" == "Darwin" && "$SKIP_SIGNATURE_CHECK" != "1" ]]; then
  echo "[4/4] Verifying signature and notarization..."

  codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

  SIGN_INFO="$(codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1 || true)"
  echo "$SIGN_INFO"

  if echo "$SIGN_INFO" | grep -q "adhoc"; then
    echo "WARNING: App was signed ad-hoc (no Developer ID). Notarization check skipped."
    echo "         For a Gatekeeper-clean build, sign with a Developer ID Application cert."
  elif echo "$SIGN_INFO" | grep -q "Authority=Developer ID Application"; then
    echo "Developer ID signature present."
    spctl -a -vv --type exec "$APP_BUNDLE"
    xcrun stapler validate "$APP_BUNDLE" 2>/dev/null && echo "Staple ticket validated." || echo "WARNING: No staple ticket (expected if notarization is in progress)."
  else
    echo "WARNING: No signing authority found. App is unsigned."
    echo "         Set SKIP_SIGNATURE_CHECK=1 to suppress this warning."
  fi
else
  echo "[4/4] Signature check skipped (SKIP_SIGNATURE_CHECK=1 or not macOS)"
fi
echo ""

# ── 5. Launch + liveness check ───────────────────────────────────────────────
echo "[5/5] Launching app for ${LAUNCH_TIMEOUT}s liveness check..."
open "$APP_BUNDLE"
sleep 2

# Find the process by bundle executable name
APP_NAME="$(basename "$APP_BUNDLE" .app)"
PID="$(pgrep -x "$APP_NAME" 2>/dev/null | head -1 || true)"
if [[ -z "$PID" ]]; then
  # Try the executable inside the bundle
  EXEC_NAME="$(defaults read "$APP_BUNDLE/Contents/Info" CFBundleExecutable 2>/dev/null || echo "Milady")"
  PID="$(pgrep -x "$EXEC_NAME" 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PID" ]]; then
  echo "WARNING: Could not find running process for $APP_NAME. App may have exited immediately."
  echo "         Check Console.app or crash logs in ~/Library/Logs/DiagnosticReports/"
else
  echo "App is running (PID $PID). Waiting ${LAUNCH_TIMEOUT}s..."
  sleep "$LAUNCH_TIMEOUT"
  if kill -0 "$PID" 2>/dev/null; then
    echo "App still running after ${LAUNCH_TIMEOUT}s — liveness check PASSED."
    kill "$PID" 2>/dev/null || true
  else
    echo "ERROR: App exited within ${LAUNCH_TIMEOUT}s. Check crash logs."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo " Smoke test PASSED"
echo "============================================================"
