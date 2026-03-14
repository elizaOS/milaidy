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
PACKAGED_HANDOFF_GRACE_SECONDS="${PACKAGED_HANDOFF_GRACE_SECONDS:-90}"
BUILD_SKIP_CODESIGN="${ELECTROBUN_SKIP_CODESIGN:-}"
BUILD_DEVELOPER_ID="${ELECTROBUN_DEVELOPER_ID:-}"
ARTIFACTS_DIR_OVERRIDE="${ARTIFACTS_DIR:-}"
SMOKE_DIAGNOSTICS_DIR="${SMOKE_DIAGNOSTICS_DIR:-}"
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
  kill_stale_processes
  if [[ -n "$LAUNCH_APP_BUNDLE" && "$LAUNCH_APP_BUNDLE" == /tmp/* && -d "$LAUNCH_APP_BUNDLE" ]]; then
    rm -rf "$LAUNCH_APP_BUNDLE"
  fi
  if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  fi
}

attach_dmg_with_retry() {
  local dmg_path="$1"
  local attempts="${2:-5}"
  local sleep_seconds="${3:-2}"
  local attempt=1
  local attach_output=""
  local mount_point=""

  while [[ "$attempt" -le "$attempts" ]]; do
    if attach_output="$(hdiutil attach -nobrowse -readonly "$dmg_path" 2>&1)"; then
      mount_point="$(printf "%s\n" "$attach_output" | awk '/\/Volumes\// { print substr($0, index($0, "/Volumes/")); exit }')"
      if [[ -n "$mount_point" && -d "$mount_point" ]]; then
        printf "%s\n" "$mount_point"
        return 0
      fi
      echo "WARNING: DMG attach succeeded but no mount point was detected (attempt $attempt/$attempts)." >&2
    else
      echo "WARNING: DMG attach failed (attempt $attempt/$attempts):" >&2
      printf "%s\n" "$attach_output" >&2
    fi

    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$sleep_seconds"
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

ensure_diagnostics_dir() {
  if [[ -z "$SMOKE_DIAGNOSTICS_DIR" ]]; then
    SMOKE_DIAGNOSTICS_DIR="$(mktemp -d /tmp/milady-smoke-diagnostics.XXXXXX)"
  fi
  mkdir -p "$SMOKE_DIAGNOSTICS_DIR"
}

collect_recent_crash_reports() {
  if [[ "$(uname)" != "Darwin" ]]; then
    return 0
  fi

  ensure_diagnostics_dir
  local crash_dir="$HOME/Library/Logs/DiagnosticReports"
  [[ -d "$crash_dir" ]] || return 0

  while IFS= read -r crash_file; do
    cp "$crash_file" "$SMOKE_DIAGNOSTICS_DIR/" 2>/dev/null || true
  done < <(
    find "$crash_dir" -maxdepth 1 -type f \( -name "*.crash" -o -name "*.ips" \) 2>/dev/null | sort | tail -n 10
  )
}

copy_supporting_diagnostics() {
  ensure_diagnostics_dir

  if [[ -f "$STARTUP_LOG" ]]; then
    cp "$STARTUP_LOG" "$SMOKE_DIAGNOSTICS_DIR/milady-startup.log" 2>/dev/null || true
  fi

  while IFS= read -r wrapper_file; do
    [[ -z "$wrapper_file" ]] && continue
    local relative_path
    relative_path="${wrapper_file#"$ELECTROBUN_DIR"/}"
    relative_path="${relative_path#"$APP_DIR"/}"
    relative_path="${relative_path#"$REPO_ROOT"/}"
    relative_path="${relative_path#/}"
    local destination_dir="$SMOKE_DIAGNOSTICS_DIR/$(dirname "$relative_path")"
    mkdir -p "$destination_dir"
    cp "$wrapper_file" "$destination_dir/" 2>/dev/null || true
  done < <(
    find "$ELECTROBUN_DIR/build" -type f -name "wrapper-diagnostics.json" 2>/dev/null | sort
  )
}

write_bundle_diagnostics() {
  ensure_diagnostics_dir
  local diagnostics_file="$SMOKE_DIAGNOSTICS_DIR/bundle-diagnostics.txt"
  : >"$diagnostics_file"

  {
    echo "Bundle: $LAUNCH_APP_BUNDLE"
    echo "Launcher: ${LAUNCHER_PATH:-<unset>}"
    echo ""

    if [[ -d "$LAUNCH_APP_BUNDLE/Contents/MacOS" ]]; then
      echo "Contents/MacOS:"
      find "$LAUNCH_APP_BUNDLE/Contents/MacOS" -maxdepth 2 -type f | sort
      echo ""
    fi

    if [[ -d "$LAUNCH_APP_BUNDLE/Contents/Resources" ]]; then
      echo "Contents/Resources:"
      find "$LAUNCH_APP_BUNDLE/Contents/Resources" -maxdepth 2 | sort
      echo ""
    fi
  } >>"$diagnostics_file"

  for candidate in \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher" \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/bun" \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib" \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/libNativeWrapper.dylib" \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/zig-zstd" \
    "$LAUNCH_APP_BUNDLE/Contents/MacOS/bspatch"
  do
    if [[ ! -e "$candidate" ]]; then
      continue
    fi

    {
      echo "=== $candidate ==="
      file "$candidate" 2>&1 || true
      lipo -info "$candidate" 2>&1 || true
      otool -L "$candidate" 2>&1 || true
      codesign -dv --verbose=4 "$candidate" 2>&1 || true
      echo ""
    } >>"$diagnostics_file"
  done

  if [[ -n "${RUNTIME_ARCHIVE:-}" && -f "$RUNTIME_ARCHIVE" ]]; then
    {
      echo "=== $RUNTIME_ARCHIVE ==="
      tar --zstd -tf "$RUNTIME_ARCHIVE" 2>&1 | sed -n '1,120p'
      echo ""
    } >>"$diagnostics_file"
  fi
}

dump_failure_diagnostics() {
  local reason="$1"
  local launcher_stdout="${LAUNCHER_STDOUT:-}"
  local launcher_stderr="${LAUNCHER_STDERR:-}"
  ensure_diagnostics_dir
  write_bundle_diagnostics
  collect_recent_crash_reports
  copy_supporting_diagnostics

  {
    echo "Reason: $reason"
    echo "Build env: $BUILD_ENV"
    echo "Startup timeout: $STARTUP_TIMEOUT"
    echo "Liveness timeout: $LIVENESS_TIMEOUT"
    echo "Packaged handoff grace: $PACKAGED_HANDOFF_GRACE_SECONDS"
    echo "Mounted volume: ${MOUNT_POINT:-<none>}"
    echo "Launch bundle: ${LAUNCH_APP_BUNDLE:-<none>}"
    echo "Launcher path: ${LAUNCHER_PATH:-<none>}"
    echo "Current packaged PID: $(find_live_packaged_pid)"
    echo ""
    echo "Launcher stdout:"
    if [[ -n "$launcher_stdout" && -f "$launcher_stdout" ]]; then
      cat "$launcher_stdout" 2>/dev/null || true
    fi
    echo ""
    echo "Launcher stderr:"
    if [[ -n "$launcher_stderr" && -f "$launcher_stderr" ]]; then
      cat "$launcher_stderr" 2>/dev/null || true
    fi
    echo ""
    echo "Startup log tail:"
    tail -n 200 "$STARTUP_LOG" 2>/dev/null || true
  } >"$SMOKE_DIAGNOSTICS_DIR/failure-summary.txt"

  echo "Diagnostics written to: $SMOKE_DIAGNOSTICS_DIR"
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
    pgrep -f '/(Applications|tmp|private/tmp|Volumes)/.*Milady[^/]*\.app/Contents/MacOS/launcher|milady-dist/entry\.js' || true
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

escape_regex() {
  printf '%s' "$1" | sed -e 's/[][(){}.^$+*?|\\]/\\&/g'
}

build_launcher_command() {
  LAUNCH_COMMAND=("$LAUNCHER_PATH")

  # The Electrobun macOS launcher copies the inherited environment before it
  # spawns Bun. GitHub Actions runners inject a very large env block, and the
  # x64 launcher can segfault in std.process.getEnvMap() before our app starts.
  # Launch the packaged app with a small user-like environment in CI so the
  # smoke test reflects end-user startup instead of runner-specific env noise.
  if [[ "$(uname)" == "Darwin" && -n "${GITHUB_ACTIONS:-}" ]]; then
    local launch_user=""
    local launch_path=""
    local launch_shell=""
    local launch_lang=""
    local launch_lc_all=""

    launch_user="${USER:-$(id -un 2>/dev/null || echo runner)}"
    launch_path="${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
    launch_shell="${SHELL:-/bin/bash}"
    launch_lang="${LANG:-en_US.UTF-8}"
    launch_lc_all="${LC_ALL:-$launch_lang}"

    LAUNCH_COMMAND=(
      /usr/bin/env
      -i
      HOME="$HOME"
      PATH="$launch_path"
      SHELL="$launch_shell"
      USER="$launch_user"
      LOGNAME="${LOGNAME:-$launch_user}"
      TMPDIR="${TMPDIR:-/tmp}"
      LANG="$launch_lang"
      LC_ALL="$launch_lc_all"
      TERM="${TERM:-dumb}"
      "$LAUNCHER_PATH"
    )
  fi
}

find_live_packaged_pid() {
  if [[ -z "$LAUNCH_APP_BUNDLE" ]]; then
    return 0
  fi

  local bundle_regex=""
  bundle_regex="$(escape_regex "$LAUNCH_APP_BUNDLE")"
  pgrep -f "${bundle_regex}/Contents/MacOS/launcher|${bundle_regex}/Contents/MacOS/bun|${bundle_regex}/Contents/Resources/main\\.js|${bundle_regex}/Contents/Resources/app/bun/index\\.js|${bundle_regex}/Contents/Resources/app/milady-dist/entry\\.js" | head -1 || true
}

assert_packaged_asset() {
  local asset_path="$1"
  local description="$2"
  local min_size="${3:-1}"
  local size_bytes=""

  if [[ ! -f "$asset_path" ]]; then
    echo "ERROR: Missing packaged ${description}: $asset_path"
    dump_failure_diagnostics "missing packaged ${description}"
    exit 1
  fi

  size_bytes="$(wc -c < "$asset_path" | tr -d ' ')"
  if [[ -z "$size_bytes" || "$size_bytes" -lt "$min_size" ]]; then
    echo "ERROR: Packaged ${description} looks truncated (${size_bytes:-0} bytes): $asset_path"
    dump_failure_diagnostics "packaged ${description} failed size check"
    exit 1
  fi
}

assert_packaged_archive_asset() {
  local archive_path="$1"
  local archive_member="$2"
  local description="$3"
  local min_size="${4:-1}"
  local size_bytes=""

  if ! tar --zstd -tf "$archive_path" | grep -Fxq "$archive_member"; then
    echo "ERROR: Missing packaged ${description} in wrapper archive: $archive_member"
    dump_failure_diagnostics "missing packaged ${description} in wrapper archive"
    exit 1
  fi

  size_bytes="$(
    tar --zstd -xOf "$archive_path" "$archive_member" 2>/dev/null \
      | wc -c \
      | tr -d ' '
  )"
  if [[ -z "$size_bytes" || "$size_bytes" -lt "$min_size" ]]; then
    echo "ERROR: Packaged ${description} in wrapper archive looks truncated (${size_bytes:-0} bytes): $archive_member"
    dump_failure_diagnostics "packaged ${description} in wrapper archive failed size check"
    exit 1
  fi
}

verify_packaged_renderer_assets() {
  local renderer_dir="$LAUNCH_APP_BUNDLE/Contents/Resources/app/renderer"
  local archive_bundle_root=""

  if [[ -d "$renderer_dir" ]]; then
    assert_packaged_asset "$renderer_dir/index.html" "renderer entrypoint" 256
    assert_packaged_asset "$renderer_dir/vrms/milady-1.vrm" "default avatar VRM" 1024
    assert_packaged_asset "$renderer_dir/vrms/backgrounds/milady-1.png" "default avatar background" 1024
    assert_packaged_asset "$renderer_dir/animations/idle.glb" "default idle animation" 1024

    echo "Packaged renderer asset check PASSED (direct app bundle)."
    return 0
  fi

  if [[ -n "${RUNTIME_ARCHIVE:-}" && -f "$RUNTIME_ARCHIVE" ]]; then
    archive_bundle_root="$(basename "$LAUNCH_APP_BUNDLE")/Contents/Resources/app/renderer"
    assert_packaged_archive_asset "$RUNTIME_ARCHIVE" "$archive_bundle_root/index.html" "renderer entrypoint" 256
    assert_packaged_archive_asset "$RUNTIME_ARCHIVE" "$archive_bundle_root/vrms/milady-1.vrm" "default avatar VRM" 1024
    assert_packaged_archive_asset "$RUNTIME_ARCHIVE" "$archive_bundle_root/vrms/backgrounds/milady-1.png" "default avatar background" 1024
    assert_packaged_archive_asset "$RUNTIME_ARCHIVE" "$archive_bundle_root/animations/idle.glb" "default idle animation" 1024

    echo "Packaged renderer asset check PASSED (wrapper archive)."
    return 0
  fi

  echo "ERROR: Packaged renderer directory missing and no wrapper archive was available: $renderer_dir"
  dump_failure_diagnostics "packaged renderer directory missing"
  exit 1
}

assert_packaged_asset() {
  local asset_path="$1"
  local description="$2"
  local min_size="${3:-1}"
  local size_bytes=""

  if [[ ! -f "$asset_path" ]]; then
    echo "ERROR: Missing packaged ${description}: $asset_path"
    dump_failure_diagnostics "missing packaged ${description}"
    exit 1
  fi

  size_bytes="$(wc -c < "$asset_path" | tr -d ' ')"
  if [[ -z "$size_bytes" || "$size_bytes" -lt "$min_size" ]]; then
    echo "ERROR: Packaged ${description} looks truncated (${size_bytes:-0} bytes): $asset_path"
    dump_failure_diagnostics "packaged ${description} failed size check"
    exit 1
  fi
}

verify_packaged_renderer_assets() {
  local renderer_dir="$LAUNCH_APP_BUNDLE/Contents/Resources/app/renderer"

  if [[ ! -d "$renderer_dir" ]]; then
    echo "ERROR: Packaged renderer directory missing: $renderer_dir"
    dump_failure_diagnostics "packaged renderer directory missing"
    exit 1
  fi

  assert_packaged_asset "$renderer_dir/index.html" "renderer entrypoint" 256
  assert_packaged_asset "$renderer_dir/vrms/milady-1.vrm" "default avatar VRM" 1024
  assert_packaged_asset "$renderer_dir/vrms/backgrounds/milady-1.png" "default avatar background" 1024
  assert_packaged_asset "$renderer_dir/animations/idle.glb" "default idle animation" 1024

  echo "Packaged renderer asset check PASSED."
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
APP_BUNDLE_FALLBACK=""
while IFS= read -r -d '' f; do
  if [[ -z "$APP_BUNDLE_FALLBACK" ]]; then
    APP_BUNDLE_FALLBACK="$f"
  fi
  if [[ "$f" == *"/.dmg-staging/"* ]]; then
    continue
  fi
  APP_BUNDLE="$f"
done < <(find "$OUTPUT_DIR" -maxdepth 3 -name "*.app" -type d -print0 2>/dev/null)

if [[ -z "$APP_BUNDLE" ]]; then
  APP_BUNDLE="$APP_BUNDLE_FALLBACK"
fi

if [[ -z "$APP_BUNDLE" ]]; then
  DMG_PATH="$(find "$OUTPUT_DIR" -maxdepth 1 -name "*.dmg" -type f -print -quit 2>/dev/null || true)"
  if [[ -n "$DMG_PATH" && "$(uname)" == "Darwin" ]]; then
    echo "No .app bundle found in artifacts; mounting DMG: $DMG_PATH"
    MOUNT_POINT="$(attach_dmg_with_retry "$DMG_PATH")"
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
DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"
DIRECT_RUNTIME_DIR="$APP_BUNDLE/Contents/Resources/app/milady-dist"
if [[ -n "$RUNTIME_ARCHIVE" ]]; then
  if ! tar --zstd -tf "$RUNTIME_ARCHIVE" | grep -q "Contents/MacOS/libwebgpu_dawn\\.dylib$"; then
    echo "ERROR: Bundled Dawn runtime not found inside $RUNTIME_ARCHIVE"
    exit 1
  fi
  echo "WGPU : wrapper bundle -> $RUNTIME_ARCHIVE"
elif [[ -f "$DIRECT_WGPU_DYLIB" && -d "$DIRECT_RUNTIME_DIR" ]]; then
  echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"
else
  echo "ERROR: Neither a packaged runtime archive nor a direct WebGPU runtime was found in $APP_BUNDLE"
  exit 1
fi
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
LAUNCHER_PATH="$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher"
verify_packaged_renderer_assets

kill_stale_processes

LOG_OFFSET=0
if [[ -f "$STARTUP_LOG" ]]; then
  LOG_OFFSET="$(wc -c < "$STARTUP_LOG" | tr -d ' ')"
fi

if [[ ! -x "$LAUNCHER_PATH" ]]; then
  echo "ERROR: Packaged launcher not found or not executable: $LAUNCHER_PATH"
  exit 1
fi

LAUNCHER_STDOUT="$(mktemp /tmp/milady-smoke-launcher.stdout.XXXXXX)"
LAUNCHER_STDERR="$(mktemp /tmp/milady-smoke-launcher.stderr.XXXXXX)"
build_launcher_command
"${LAUNCH_COMMAND[@]}" >"$LAUNCHER_STDOUT" 2>"$LAUNCHER_STDERR" &
PID="$!"
sleep 2

BACKEND_PORT=""
HANDOFF_PID=""
LAUNCHER_EXIT_OBSERVED_AT=""

if [[ -z "$PID" ]]; then
  echo "WARNING: Could not start packaged launcher. App may have exited immediately."
  echo "         Check Console.app or crash logs in ~/Library/Logs/DiagnosticReports/"
  LAUNCHER_EXIT_OBSERVED_AT="$SECONDS"
elif ! kill -0 "$PID" >/dev/null 2>&1; then
  wait "$PID" || true
  echo "Launcher exited before the first health probe; continuing to wait for packaged app handoff..."
  LAUNCHER_EXIT_OBSERVED_AT="$SECONDS"
else
  echo "Launcher is running (PID $PID). Waiting for backend health..."
fi

DEADLINE=$((SECONDS + STARTUP_TIMEOUT))
while [[ $SECONDS -lt $DEADLINE ]]; do
  LIVE_PID="$(find_live_packaged_pid)"

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
      dump_failure_diagnostics "backend startup log reported a failure"
      exit 1
    fi
  fi

  if [[ -n "$LIVE_PID" ]] && kill -0 "$LIVE_PID" >/dev/null 2>&1; then
    if [[ "$LIVE_PID" != "$PID" && "$LIVE_PID" != "$HANDOFF_PID" ]]; then
      echo "Launcher handoff detected; following packaged app process $LIVE_PID."
      HANDOFF_PID="$LIVE_PID"
    fi
  fi

  if ! kill -0 "$PID" >/dev/null 2>&1 && [[ -z "$BACKEND_PORT" ]]; then
    if [[ -z "$LAUNCHER_EXIT_OBSERVED_AT" ]]; then
      LAUNCHER_EXIT_OBSERVED_AT="$SECONDS"
      echo "Launcher exited; waiting for packaged app handoff..."
    fi

    if [[ -z "$LIVE_PID" ]]; then
      HANDOFF_WAITED=$((SECONDS - LAUNCHER_EXIT_OBSERVED_AT))
      if [[ "$HANDOFF_WAITED" -ge "$PACKAGED_HANDOFF_GRACE_SECONDS" ]]; then
        echo "WARNING: No packaged app process detected within ${PACKAGED_HANDOFF_GRACE_SECONDS}s; continuing to wait for backend startup."
        LAUNCHER_EXIT_OBSERVED_AT="$SECONDS"
      fi
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
  dump_failure_diagnostics "backend never reported a started port"
  exit 1
fi

if ! curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
  echo "ERROR: Backend did not answer /api/health on port $BACKEND_PORT"
  [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
  echo ""
  echo "Launcher stderr:"
  cat "$LAUNCHER_STDERR" 2>/dev/null || true
  dump_failure_diagnostics "backend health endpoint never became reachable"
  exit 1
fi

LOG_SLICE="$(tail -c +"$((LOG_OFFSET + 1))" "$STARTUP_LOG" 2>/dev/null || true)"
STREAMING_FAILURE_REGEX='@elizaos/plugin-streaming-base|@elizaos/plugin-x-streaming|@milady/plugin-x-streaming|@milady/plugin-youtube-streaming|@milady/plugin-retake'
if printf '%s\n' "$LOG_SLICE" | grep -Eq "Could not load plugin (${STREAMING_FAILURE_REGEX})"; then
  echo "ERROR: Streaming plugin resolution failed during packaged startup."
  printf '%s\n' "$LOG_SLICE" | grep -E "Could not load plugin|Failed plugins:" | tail -n 40
  dump_failure_diagnostics "streaming plugin resolution failed"
  exit 1
fi
if printf '%s\n' "$LOG_SLICE" | grep -Eq "Failed plugins:.*(${STREAMING_FAILURE_REGEX})"; then
  echo "ERROR: Packaged startup reported failed streaming plugins."
  printf '%s\n' "$LOG_SLICE" | grep -E "Plugin resolution complete|Failed plugins:" | tail -n 20
  dump_failure_diagnostics "streaming plugins reported failed"
  exit 1
fi
if printf '%s\n' "$LOG_SLICE" | grep -Eq "Plugin @milady/plugin-streaming-base did not export a valid Plugin object"; then
  echo "ERROR: Streaming helper package was treated as a real plugin."
  printf '%s\n' "$LOG_SLICE" | grep -E "plugin-streaming-base|Plugin resolution complete|Failed plugins:" | tail -n 20
  dump_failure_diagnostics "streaming helper package treated as a plugin"
  exit 1
fi
if printf '%s\n' "$LOG_SLICE" | grep -Eq "AGENT_EVENT service not found on runtime"; then
  echo "ERROR: AGENT_EVENT runtime service was not registered."
  printf '%s\n' "$LOG_SLICE" | grep -E "AGENT_EVENT service not found on runtime|Plugin resolution complete|Failed plugins:" | tail -n 20
  dump_failure_diagnostics "AGENT_EVENT runtime service missing"
  exit 1
fi
echo "Streaming plugin resolution check PASSED."

echo "Waiting ${LIVENESS_TIMEOUT}s for liveness..."
sleep "$LIVENESS_TIMEOUT"
LIVE_PID="$(find_live_packaged_pid)"
if [[ -n "$LIVE_PID" ]] && kill -0 "$LIVE_PID" 2>/dev/null; then
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
    echo "App process ($LIVE_PID) and backend still healthy after ${LIVENESS_TIMEOUT}s — liveness check PASSED."
  else
    echo "ERROR: App stayed open but backend health check failed after ${LIVENESS_TIMEOUT}s."
    [[ -f "$STARTUP_LOG" ]] && tail -n 120 "$STARTUP_LOG"
    echo ""
    echo "Launcher stderr:"
    cat "$LAUNCHER_STDERR" 2>/dev/null || true
    dump_failure_diagnostics "backend liveness check failed after startup"
    exit 1
  fi
elif curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null; then
  echo "WARNING: No packaged app process was detected after ${LIVENESS_TIMEOUT}s, but the packaged backend remained healthy."
  echo "         Treating backend liveness as the release gate for this launcher path."
else
  echo "ERROR: No packaged app process remained alive within ${LIVENESS_TIMEOUT}s."
  echo ""
  echo "Launcher stderr:"
  cat "$LAUNCHER_STDERR" 2>/dev/null || true
  dump_failure_diagnostics "packaged app process did not stay alive"
  exit 1
fi

echo ""
echo "============================================================"
echo " Smoke test PASSED"
echo "============================================================"
