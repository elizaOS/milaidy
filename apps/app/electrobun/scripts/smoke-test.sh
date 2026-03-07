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
#   2. Bundles runtime node_modules into dist/
#   3. Builds the native macOS effects dylib
#   4. Runs electrobun build (--env=canary by default)
#   5. Locates the built .app bundle from artifacts/ or mounts the built DMG
#   6. Verifies codesign + notarization
#   7. Launches the app, waits for the embedded backend to answer /api/health,
#      then confirms the app stays alive and kills it

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
LAUNCH_APP_BUNDLE=""
STARTUP_LOG="$HOME/.config/Milady/milady-startup.log"

if [[ "$SKIP_SIGNATURE_CHECK" == "1" && -z "$BUILD_SKIP_CODESIGN" ]]; then
  BUILD_SKIP_CODESIGN="1"
fi

cleanup() {
  if [[ -n "${APP_PID:-}" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$LAUNCH_APP_BUNDLE" && "$LAUNCH_APP_BUNDLE" == /tmp/* && -d "$LAUNCH_APP_BUNDLE" ]]; then
    rm -rf "$LAUNCH_APP_BUNDLE"
  fi
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
echo "[1/7] Building core dist + renderer assets..."
(cd "$REPO_ROOT" && bunx tsdown && echo '{"type":"module"}' > dist/package.json && node --import tsx scripts/write-build-info.ts)
(cd "$APP_DIR" && npx vite build)
echo ""

# ── 2. Bundle runtime node_modules into dist/ ────────────────────────────────
echo "[2/7] Bundling runtime node_modules into dist/..."
(cd "$REPO_ROOT" && node --import tsx scripts/copy-runtime-node-modules.ts --scan-dir dist --target-dist dist)
echo ""

# ── 3. Build native dylib (macOS only) ───────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  echo "[3/7] Building native macOS effects dylib..."
  (cd "$ELECTROBUN_DIR" && bun run build:native-effects)
  DYLIB="$ELECTROBUN_DIR/src/libMacWindowEffects.dylib"
  if [[ ! -f "$DYLIB" ]]; then
    echo "ERROR: $DYLIB not found after build. Abort."
    exit 1
  fi
  echo "      OK — $DYLIB ($(du -sh "$DYLIB" | cut -f1))"
else
  echo "[3/7] Skipping dylib build (not macOS)"
fi
echo ""

# ── 4. Build Electrobun app ───────────────────────────────────────────────────
echo "[4/7] Building Electrobun app (env=$BUILD_ENV)..."
(cd "$ELECTROBUN_DIR" && ELECTROBUN_SKIP_CODESIGN="$BUILD_SKIP_CODESIGN" bun run build -- --env="$BUILD_ENV")
echo ""

# ── 5. Locate built .app ─────────────────────────────────────────────────────
echo "[5/7] Locating built .app bundle..."
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

# ── 6. Signature + notarization check ────────────────────────────────────────
if [[ "$(uname)" == "Darwin" && "$SKIP_SIGNATURE_CHECK" != "1" ]]; then
  echo "[6/7] Verifying signature and notarization..."

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
  echo "[6/7] Signature check skipped (SKIP_SIGNATURE_CHECK=1 or not macOS)"
fi
echo ""

# ── 7. Launch + backend health + liveness check ──────────────────────────────
echo "[7/7] Launching app for backend + liveness check..."
if [[ -n "$MOUNT_POINT" ]]; then
  LAUNCH_APP_BUNDLE="/tmp/$(basename "$APP_BUNDLE")"
  rm -rf "$LAUNCH_APP_BUNDLE"
  ditto "$APP_BUNDLE" "$LAUNCH_APP_BUNDLE"
else
  LAUNCH_APP_BUNDLE="$APP_BUNDLE"
fi

LOG_OFFSET=0
if [[ -f "$STARTUP_LOG" ]]; then
  LOG_OFFSET="$(wc -c < "$STARTUP_LOG" | tr -d ' ')"
fi

open "$LAUNCH_APP_BUNDLE"
sleep 2

# Find the process by bundle executable name
APP_NAME="$(basename "$LAUNCH_APP_BUNDLE" .app)"
PID="$(pgrep -x "$APP_NAME" 2>/dev/null | head -1 || true)"
if [[ -z "$PID" ]]; then
  # Try the executable inside the bundle
  EXEC_NAME="$(defaults read "$LAUNCH_APP_BUNDLE/Contents/Info" CFBundleExecutable 2>/dev/null || echo "Milady")"
  PID="$(pgrep -x "$EXEC_NAME" 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PID" ]]; then
  echo "WARNING: Could not find running process for $APP_NAME. App may have exited immediately."
  echo "         Check Console.app or crash logs in ~/Library/Logs/DiagnosticReports/"
else
  APP_PID="$PID"
  echo "App is running (PID $PID). Waiting for backend health..."

  BACKEND_PORT=""
  DEADLINE=$((SECONDS + LAUNCH_TIMEOUT + 20))
  while [[ $SECONDS -lt $DEADLINE ]]; do
    if [[ -f "$STARTUP_LOG" ]]; then
      LOG_SLICE="$(tail -c +"$((LOG_OFFSET + 1))" "$STARTUP_LOG" 2>/dev/null || true)"
      if [[ -z "$BACKEND_PORT" ]]; then
        BACKEND_PORT="$(printf '%s\n' "$LOG_SLICE" | sed -n 's/.*Runtime started -- agent: .* port: \([0-9][0-9]*\), pid: .*/\1/p' | tail -1)"
      fi
      if printf '%s\n' "$LOG_SLICE" | grep -Eq 'Cannot find module|Child process exited with code|Failed to start:'; then
        echo "ERROR: Backend startup failed. Recent startup log:"
        printf '%s\n' "$LOG_SLICE" | tail -n 120
        exit 1
      fi
    fi
    if [[ -n "$BACKEND_PORT" ]]; then
      if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
        echo "Backend health check PASSED on port $BACKEND_PORT."
        break
      fi
    fi
    sleep 1
  done

  if [[ -z "$BACKEND_PORT" ]]; then
    echo "ERROR: Backend never reported a started port in $STARTUP_LOG"
    [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
    exit 1
  fi

  if ! curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
    echo "ERROR: Backend did not answer /api/health on port $BACKEND_PORT"
    [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
    exit 1
  fi

  echo "Waiting ${LAUNCH_TIMEOUT}s for liveness..."
  sleep "$LAUNCH_TIMEOUT"
  if kill -0 "$PID" 2>/dev/null; then
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
      echo "App and backend still healthy after ${LAUNCH_TIMEOUT}s — liveness check PASSED."
    else
      echo "ERROR: App stayed open but backend health check failed after ${LAUNCH_TIMEOUT}s."
      [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
      exit 1
    fi
  else
    echo "ERROR: App exited within ${LAUNCH_TIMEOUT}s. Check crash logs."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo " Smoke test PASSED"
echo "============================================================"
