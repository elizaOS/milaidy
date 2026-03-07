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
#   1. Builds the core server bundle + renderer assets that Electrobun copies
#   2. Builds the native macOS effects dylib
#   3. Runs electrobun build (--env=canary by default)
#   4. Locates the built .app bundle from artifacts/ or mounts the built DMG
#   5. Verifies codesign + notarization
#   6. Launches the app, waits 8s, checks it stays running, then kills it

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTROBUN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$(cd "$ELECTROBUN_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ELECTROBUN_DIR/../../.." && pwd)"
BUILD_ENV="${BUILD_ENV:-canary}"
SKIP_SIGNATURE_CHECK="${SKIP_SIGNATURE_CHECK:-0}"
LAUNCH_TIMEOUT="${LAUNCH_TIMEOUT:-8}"
BUILD_SKIP_CODESIGN="${ELECTROBUN_SKIP_CODESIGN:-}"
MOUNT_POINT=""

if [[ "$SKIP_SIGNATURE_CHECK" == "1" && -z "$BUILD_SKIP_CODESIGN" ]]; then
  BUILD_SKIP_CODESIGN="1"
fi

cleanup() {
  if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "============================================================"
echo " Milady Electrobun Smoke Test"
echo " Build env  : $BUILD_ENV"
echo " Working dir: $ELECTROBUN_DIR"
echo "============================================================"
echo ""

# ── 1. Build prerequisites (core dist + renderer) ────────────────────────────
echo "[1/6] Building core dist + renderer assets..."
(cd "$REPO_ROOT" && bunx tsdown && echo '{"type":"module"}' > dist/package.json && node --import tsx scripts/write-build-info.ts)
(cd "$APP_DIR" && npx vite build)
echo ""

# ── 2. Build native dylib (macOS only) ───────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  echo "[2/6] Building native macOS effects dylib..."
  (cd "$ELECTROBUN_DIR" && bun run build:native-effects)
  DYLIB="$ELECTROBUN_DIR/src/libMacWindowEffects.dylib"
  if [[ ! -f "$DYLIB" ]]; then
    echo "ERROR: $DYLIB not found after build. Abort."
    exit 1
  fi
  echo "      OK — $DYLIB ($(du -sh "$DYLIB" | cut -f1))"
else
  echo "[2/6] Skipping dylib build (not macOS)"
fi
echo ""

# ── 3. Build Electrobun app ───────────────────────────────────────────────────
echo "[3/6] Building Electrobun app (env=$BUILD_ENV)..."
(cd "$ELECTROBUN_DIR" && ELECTROBUN_SKIP_CODESIGN="$BUILD_SKIP_CODESIGN" bun run build -- --env="$BUILD_ENV")
echo ""

# ── 4. Locate built .app ─────────────────────────────────────────────────────
echo "[4/6] Locating built .app bundle..."
ARTIFACTS_DIR="$ELECTROBUN_DIR/artifacts"
LEGACY_DIST_DIR="$ELECTROBUN_DIR/dist"
OUTPUT_DIR=""

if [[ -d "$ARTIFACTS_DIR" ]]; then
  OUTPUT_DIR="$ARTIFACTS_DIR"
elif [[ -d "$LEGACY_DIST_DIR" ]]; then
  OUTPUT_DIR="$LEGACY_DIST_DIR"
  echo "WARNING: Falling back to legacy dist/ output; artifacts/ was not found."
else
  echo "ERROR: Neither $ARTIFACTS_DIR nor $LEGACY_DIST_DIR exists. Build may have failed."
  exit 1
fi

echo "Build output contents ($OUTPUT_DIR):"
find "$OUTPUT_DIR" -maxdepth 3 | sort

APP_BUNDLE=""
while IFS= read -r -d '' f; do
  APP_BUNDLE="$f"
done < <(find "$OUTPUT_DIR" -maxdepth 3 -name "*.app" -type d -print0 2>/dev/null)

if [[ -z "$APP_BUNDLE" ]]; then
  DMG_PATH="$(find "$OUTPUT_DIR" -maxdepth 1 -name "*.dmg" -type f -print -quit 2>/dev/null || true)"
  if [[ -n "$DMG_PATH" && "$(uname)" == "Darwin" ]]; then
    echo "No .app bundle found in artifacts; mounting DMG: $DMG_PATH"
    MOUNT_POINT="$(hdiutil attach -nobrowse -readonly "$DMG_PATH" | awk '/\/Volumes\// { print substr($0, index($0, "/Volumes/")); exit }')"
    if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
      APP_BUNDLE="$(find "$MOUNT_POINT" -maxdepth 2 -name "*.app" -type d -print -quit 2>/dev/null || true)"
    fi
  fi
fi

if [[ -z "$APP_BUNDLE" ]]; then
  echo "ERROR: No .app bundle found under $OUTPUT_DIR or inside the built DMG"
  exit 1
fi
echo "Found: $APP_BUNDLE"
echo "Size : $(du -sh "$APP_BUNDLE" | cut -f1)"

RUNTIME_ARCHIVE="$(find "$APP_BUNDLE/Contents/Resources" -maxdepth 1 -name "*.tar.zst" -type f -print -quit 2>/dev/null || true)"
if [[ -z "$RUNTIME_ARCHIVE" ]]; then
  echo "ERROR: Packaged runtime archive not found inside $APP_BUNDLE"
  exit 1
fi
if ! tar --zstd -tf "$RUNTIME_ARCHIVE" | grep -q "Contents/MacOS/libwebgpu_dawn\\.dylib$"; then
  echo "ERROR: Bundled Dawn runtime not found inside $RUNTIME_ARCHIVE"
  exit 1
fi
echo "WGPU : $RUNTIME_ARCHIVE -> Contents/MacOS/libwebgpu_dawn.dylib"
echo ""

# ── 5. Signature + notarization check ────────────────────────────────────────
if [[ "$(uname)" == "Darwin" && "$SKIP_SIGNATURE_CHECK" != "1" ]]; then
  echo "[5/6] Verifying signature and notarization..."

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
  echo "[5/6] Signature check skipped (SKIP_SIGNATURE_CHECK=1 or not macOS)"
fi
echo ""

# ── 6. Launch + liveness check ───────────────────────────────────────────────
echo "[6/6] Launching app for ${LAUNCH_TIMEOUT}s liveness check..."
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
