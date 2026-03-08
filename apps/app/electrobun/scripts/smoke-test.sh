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
SKIP_BUILD="${SKIP_BUILD:-0}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-180}"
LIVENESS_TIMEOUT="${LIVENESS_TIMEOUT:-8}"
BUILD_SKIP_CODESIGN="${ELECTROBUN_SKIP_CODESIGN:-}"
BUILD_DEVELOPER_ID="${ELECTROBUN_DEVELOPER_ID:-}"
ARTIFACTS_DIR_OVERRIDE="${ARTIFACTS_DIR:-}"
MOUNT_POINT=""
LAUNCH_APP_BUNDLE=""
STARTUP_LOG="$HOME/.config/Milady/milady-startup.log"

if [[ "$SKIP_SIGNATURE_CHECK" == "1" && -z "$BUILD_SKIP_CODESIGN" ]]; then
  BUILD_SKIP_CODESIGN="1"
fi

if [[ "$(uname)" == "Darwin" && "$BUILD_SKIP_CODESIGN" != "1" && -z "$BUILD_DEVELOPER_ID" ]]; then
  BUILD_DEVELOPER_ID="$(
    security find-identity -v -p codesigning 2>/dev/null \
      | grep "Developer ID Application" \
      | head -1 \
      | sed 's/.*"\(.*\)"/\1/' || true
  )"
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

kill_stale_processes() {
  local pid=""
  local found=0

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" >/dev/null 2>&1; then
      if [[ $found -eq 0 ]]; then
        echo "Stopping stale Milady launcher/backend processes..."
        found=1
      fi
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done < <(
    pgrep -f '/(Applications|tmp|private/tmp|Volumes)/.*Milady[^/]*\.app/Contents/MacOS/launcher|milady-dist/(eliza|runtime/eliza)\.js' || true
  )

  pid="$(lsof -nP -tiTCP:2138 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    if [[ $found -eq 0 ]]; then
      echo "Stopping stale Milady launcher/backend processes..."
      found=1
    fi
    kill "$pid" >/dev/null 2>&1 || true
  fi

  if [[ $found -eq 1 ]]; then
    sleep 2
  fi
}

trap cleanup EXIT

echo "============================================================"
echo " Milady Electrobun Smoke Test"
echo " Build env  : $BUILD_ENV"
echo " Working dir: $ELECTROBUN_DIR"
echo "============================================================"
echo ""

# ── 1-4. Build or reuse packaged artifact ────────────────────────────────────
if [[ "$SKIP_BUILD" == "1" ]]; then
  echo "[1/7] Reusing existing packaged artifact (SKIP_BUILD=1)..."
else
  echo "[1/7] Building core dist + renderer assets..."
  (cd "$REPO_ROOT" && bunx tsdown && echo '{"type":"module"}' > dist/package.json && node --import tsx scripts/write-build-info.ts)
  (cd "$APP_DIR" && npx vite build)
  echo ""

  echo "[2/7] Bundling runtime node_modules into dist/..."
  (cd "$REPO_ROOT" && node --import tsx scripts/copy-runtime-node-modules.ts --scan-dir dist --target-dist dist)
  echo ""

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

  echo "[4/7] Building Electrobun app (env=$BUILD_ENV)..."
  (cd "$ELECTROBUN_DIR" && ELECTROBUN_DEVELOPER_ID="$BUILD_DEVELOPER_ID" ELECTROBUN_SKIP_CODESIGN="$BUILD_SKIP_CODESIGN" bun run build -- --env="$BUILD_ENV")
fi
echo ""

# ── 5. Locate built .app ─────────────────────────────────────────────────────
echo "[5/7] Locating built .app bundle..."
ARTIFACTS_DIR="${ARTIFACTS_DIR_OVERRIDE:-$ELECTROBUN_DIR/artifacts}"
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
  LAUNCH_APP_DIR="$(mktemp -d /tmp/milady-smoke-app.XXXXXX)"
  LAUNCH_APP_BUNDLE="$LAUNCH_APP_DIR/$(basename "$APP_BUNDLE")"
  ditto "$APP_BUNDLE" "$LAUNCH_APP_BUNDLE"
else
  LAUNCH_APP_BUNDLE="$APP_BUNDLE"
fi

kill_stale_processes

LOG_OFFSET=0
if [[ -f "$STARTUP_LOG" ]]; then
  LOG_OFFSET="$(wc -c < "$STARTUP_LOG" | tr -d ' ')"
fi

LAUNCHER_PATH="$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher"
if [[ ! -x "$LAUNCHER_PATH" ]]; then
  echo "ERROR: Packaged launcher not found or not executable: $LAUNCHER_PATH"
  exit 1
fi

LAUNCHER_STDOUT="$(mktemp /tmp/milady-smoke-launcher.stdout.XXXXXX)"
LAUNCHER_STDERR="$(mktemp /tmp/milady-smoke-launcher.stderr.XXXXXX)"
"$LAUNCHER_PATH" >"$LAUNCHER_STDOUT" 2>"$LAUNCHER_STDERR" &
PID="$!"
APP_PID="$PID"
sleep 2

if [[ -z "$PID" ]]; then
  echo "WARNING: Could not start packaged launcher. App may have exited immediately."
  echo "         Check Console.app or crash logs in ~/Library/Logs/DiagnosticReports/"
else
  echo "Launcher is running (PID $PID). Waiting for backend health..."

  BACKEND_PORT=""
  DEADLINE=$((SECONDS + STARTUP_TIMEOUT))
  while [[ $SECONDS -lt $DEADLINE ]]; do
    if [[ -f "$STARTUP_LOG" ]]; then
      LOG_SLICE="$(tail -c +"$((LOG_OFFSET + 1))" "$STARTUP_LOG" 2>/dev/null || true)"
      if [[ -z "$BACKEND_PORT" ]]; then
        BACKEND_PORT="$(printf '%s\n' "$LOG_SLICE" | sed -n 's/.*Runtime started -- agent: .* port: \([0-9][0-9]*\), pid: .*/\1/p' | tail -1)"
      fi
      if printf '%s\n' "$LOG_SLICE" | grep -Eq 'Cannot find module|Child process exited with code|Failed to start:'; then
        echo "ERROR: Backend startup failed. Recent startup log:"
        printf '%s\n' "$LOG_SLICE" | tail -n 120
        echo ""
        echo "Launcher stderr:"
        cat "$LAUNCHER_STDERR" 2>/dev/null || true
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
    echo ""
    echo "Launcher stderr:"
    cat "$LAUNCHER_STDERR" 2>/dev/null || true
    exit 1
  fi

  if ! curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
    echo "ERROR: Backend did not answer /api/health on port $BACKEND_PORT"
    [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
    echo ""
    echo "Launcher stderr:"
    cat "$LAUNCHER_STDERR" 2>/dev/null || true
    exit 1
  fi

  LOG_SLICE="$(tail -c +"$((LOG_OFFSET + 1))" "$STARTUP_LOG" 2>/dev/null || true)"
  STREAMING_FAILURE_REGEX='@elizaos/plugin-streaming-base|@elizaos/plugin-x-streaming|@milady/plugin-x-streaming|@milady/plugin-youtube-streaming|@milady/plugin-retake'
  if printf '%s\n' "$LOG_SLICE" | grep -Eq "Could not load plugin (${STREAMING_FAILURE_REGEX})"; then
    echo "ERROR: Streaming plugin resolution failed during packaged startup."
    printf '%s\n' "$LOG_SLICE" | grep -E "Could not load plugin|Failed plugins:" | tail -n 40
    exit 1
  fi
  if printf '%s\n' "$LOG_SLICE" | grep -Eq "Failed plugins:.*(${STREAMING_FAILURE_REGEX})"; then
    echo "ERROR: Packaged startup reported failed streaming plugins."
    printf '%s\n' "$LOG_SLICE" | grep -E "Plugin resolution complete|Failed plugins:" | tail -n 20
    exit 1
  fi
  if printf '%s\n' "$LOG_SLICE" | grep -Eq "Plugin @milady/plugin-streaming-base did not export a valid Plugin object"; then
    echo "ERROR: Streaming helper package was treated as a real plugin."
    printf '%s\n' "$LOG_SLICE" | grep -E "plugin-streaming-base|Plugin resolution complete|Failed plugins:" | tail -n 20
    exit 1
  fi
  if printf '%s\n' "$LOG_SLICE" | grep -Eq "AGENT_EVENT service not found on runtime"; then
    echo "ERROR: AGENT_EVENT runtime service was not registered."
    printf '%s\n' "$LOG_SLICE" | grep -E "AGENT_EVENT service not found on runtime|Plugin resolution complete|Failed plugins:" | tail -n 20
    exit 1
  fi
  echo "Streaming plugin resolution check PASSED."

  echo "Waiting ${LIVENESS_TIMEOUT}s for liveness..."
  sleep "$LIVENESS_TIMEOUT"
  if kill -0 "$PID" 2>/dev/null; then
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
      echo "App and backend still healthy after ${LIVENESS_TIMEOUT}s — liveness check PASSED."
    else
      echo "ERROR: App stayed open but backend health check failed after ${LIVENESS_TIMEOUT}s."
      [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
      echo ""
      echo "Launcher stderr:"
      cat "$LAUNCHER_STDERR" 2>/dev/null || true
      exit 1
    fi
  else
    echo "ERROR: App exited within ${LIVENESS_TIMEOUT}s. Check crash logs."
    echo ""
    echo "Launcher stderr:"
    cat "$LAUNCHER_STDERR" 2>/dev/null || true
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo " Smoke test PASSED"
echo "============================================================"
