#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTROBUN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="${1:-apps/app/electrobun/artifacts}"
BUILD_ROOT="${MILADY_STAGE_MACOS_BUILD_ROOT:-$ELECTROBUN_DIR/build}"
SKIP_SIGNATURE_CHECK="${ELECTROBUN_SKIP_CODESIGN:-0}"
SKIP_DMG="${MILADY_STAGE_MACOS_SKIP_DMG:-0}"
SKIP_APP_ZIP="${MILADY_STAGE_MACOS_SKIP_APP_ZIP:-$SKIP_DMG}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "stage-macos-release-artifacts: macOS only"
  exit 1
fi

if [[ ! -d "$ARTIFACTS_DIR" ]]; then
  echo "stage-macos-release-artifacts: artifacts directory not found: $ARTIFACTS_DIR"
  exit 1
fi

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/milady-macos-artifacts.XXXXXX")"
EXTRACT_DIR="$TMP_ROOT/extracted"
DMG_STAGING_DIR="$TMP_ROOT/dmg-staging"
TEMP_DMG_PATH=""

cleanup() {
  if [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    rm -rf "$TMP_ROOT"
  fi
}

trap cleanup EXIT

mkdir -p "$EXTRACT_DIR" "$DMG_STAGING_DIR"

find_newest_path() {
  local search_root="$1"
  shift

  if [[ ! -d "$search_root" ]]; then
    return 0
  fi

  local newest_path=""
  local newest_mtime=-1
  local candidate candidate_mtime
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    candidate_mtime="$(stat -f '%m' "$candidate")"
    if (( candidate_mtime > newest_mtime )); then
      newest_mtime="$candidate_mtime"
      newest_path="$candidate"
    fi
  done < <(find "$search_root" "$@")

  if [[ -n "$newest_path" ]]; then
    printf '%s\n' "$newest_path"
  fi
}

retry_command() {
  local attempts="$1"
  local delay_seconds="$2"
  shift 2

  local attempt command_status=0
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "$@"; then
      return 0
    else
      command_status=$?
    fi
    echo "Command failed (attempt $attempt/$attempts, exit=$command_status): $*" >&2
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$((delay_seconds * attempt))"
    fi
  done

  return "$command_status"
}

DIRECT_APP_PATH="$(find_newest_path "$BUILD_ROOT" -maxdepth 2 -type d -name "*.app")"
TARBALL_PATH="$(find_newest_path "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "*-macos-*.app.tar.zst")"
APP_BUNDLE_PATH=""
FINAL_APP_ZIP_NAME=""
FINAL_DMG_NAME=""

if [[ -n "$DIRECT_APP_PATH" ]]; then
  BUILD_PREFIX="$(basename "$(dirname "$DIRECT_APP_PATH")")"
  APP_BUNDLE_NAME="$(basename "$DIRECT_APP_PATH" .app)"
  FINAL_APP_ZIP_NAME="$BUILD_PREFIX-$APP_BUNDLE_NAME.app.zip"
  FINAL_DMG_NAME="$BUILD_PREFIX-$APP_BUNDLE_NAME.dmg"

  if [[ -e "$DIRECT_APP_PATH/Contents/MacOS/libwebgpu_dawn.dylib" && -e "$DIRECT_APP_PATH/Contents/Resources/version.json" && -d "$DIRECT_APP_PATH/Contents/Resources/app/milady-dist" ]]; then
    echo "Using direct build app: $DIRECT_APP_PATH"
    APP_BUNDLE_PATH="$DIRECT_APP_PATH"
  else
    BUILD_APP_ARCHIVE="$(find_newest_path "$DIRECT_APP_PATH/Contents/Resources" -maxdepth 1 -type f -name "*.tar.zst")"
    if [[ -n "$BUILD_APP_ARCHIVE" ]]; then
      echo "Using build app wrapper: $DIRECT_APP_PATH"
      echo "Extracting app payload from build app archive: $BUILD_APP_ARCHIVE"
      tar --zstd -xf "$BUILD_APP_ARCHIVE" -C "$EXTRACT_DIR"
      APP_BUNDLE_PATH="$(find_newest_path "$EXTRACT_DIR" -maxdepth 2 -type d -name "*.app")"
      if [[ -z "$APP_BUNDLE_PATH" ]]; then
        echo "stage-macos-release-artifacts: extracted build app archive did not contain a .app bundle"
        exit 1
      fi
    else
      echo "stage-macos-release-artifacts: no usable app payload found inside $DIRECT_APP_PATH; falling back to updater tarball"
    fi
  fi
fi

if [[ -z "$APP_BUNDLE_PATH" ]]; then
  echo "stage-macos-release-artifacts: no usable macOS build app found under $BUILD_ROOT; falling back to updater tarball"
  if [[ -z "$TARBALL_PATH" ]]; then
    echo "stage-macos-release-artifacts: no macOS updater tarball found in $ARTIFACTS_DIR"
    exit 1
  fi

  echo "Using updater tarball: $TARBALL_PATH"
  tar --zstd -xf "$TARBALL_PATH" -C "$EXTRACT_DIR"

  APP_BUNDLE_PATH="$(find_newest_path "$EXTRACT_DIR" -maxdepth 2 -type d -name "*.app")"
  if [[ -z "$APP_BUNDLE_PATH" ]]; then
    echo "stage-macos-release-artifacts: extracted tarball did not contain a .app bundle"
    exit 1
  fi

  FINAL_DMG_NAME="$(basename "${TARBALL_PATH%.app.tar.zst}.dmg")"
  FINAL_APP_ZIP_NAME="$(basename "${TARBALL_PATH%.tar.zst}.zip")"
fi

STAGED_APP_PATH="$ARTIFACTS_DIR/$(basename "$APP_BUNDLE_PATH")"
rm -rf "$STAGED_APP_PATH"
ditto "$APP_BUNDLE_PATH" "$STAGED_APP_PATH"

LAUNCHER_PATH="$STAGED_APP_PATH/Contents/MacOS/launcher"
WGPU_PATH="$STAGED_APP_PATH/Contents/MacOS/libwebgpu_dawn.dylib"
VERSION_JSON_PATH="$STAGED_APP_PATH/Contents/Resources/version.json"
RUNTIME_DIR="$STAGED_APP_PATH/Contents/Resources/app/milady-dist"
DIRECT_LAUNCHER_SOURCE="$SCRIPT_DIR/macos-direct-launcher.c"

for required_path in "$LAUNCHER_PATH" "$WGPU_PATH" "$VERSION_JSON_PATH" "$RUNTIME_DIR"; do
  if [[ ! -e "$required_path" ]]; then
    echo "stage-macos-release-artifacts: expected staged app content is missing: $required_path"
    exit 1
  fi
done

if [[ ! -f "$DIRECT_LAUNCHER_SOURCE" ]]; then
  echo "stage-macos-release-artifacts: direct launcher source not found: $DIRECT_LAUNCHER_SOURCE"
  exit 1
fi

entitlement_args=()
if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${ELECTROBUN_DEVELOPER_ID:-}" ]]; then
  TMP_ENTITLEMENTS_PATH="$TMP_ROOT/staged-entitlements.plist"
  if ! codesign -d --entitlements :- "$STAGED_APP_PATH" >"$TMP_ENTITLEMENTS_PATH" 2>/dev/null; then
    echo "stage-macos-release-artifacts: failed to extract entitlements from staged app bundle"
    exit 1
  fi
  if [[ ! -s "$TMP_ENTITLEMENTS_PATH" ]]; then
    echo "stage-macos-release-artifacts: extracted entitlements were empty"
    exit 1
  fi
  entitlement_args=(--entitlements "$TMP_ENTITLEMENTS_PATH")
fi

TMP_LAUNCHER_PATH="$TMP_ROOT/direct-launcher"
/usr/bin/clang \
  -O2 \
  -Wall \
  -Wextra \
  -mmacosx-version-min=11.0 \
  "$DIRECT_LAUNCHER_SOURCE" \
  -o "$TMP_LAUNCHER_PATH"
install -m 0755 "$TMP_LAUNCHER_PATH" "$LAUNCHER_PATH"

echo "Staged app bundle: $STAGED_APP_PATH"
if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${ELECTROBUN_DEVELOPER_ID:-}" ]]; then
  # The extracted updater app bundle is already correctly signed/notarized by
  # electrobun. Re-sign only what changed and keep the original entitlements so
  # we do not rewrite valid nested signatures with a blanket --deep pass.
  if ! codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" --options runtime "${entitlement_args[@]}" "$LAUNCHER_PATH"; then
    echo "stage-macos-release-artifacts: launcher runtime signing failed, retrying without hardened runtime" >&2
    codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "${entitlement_args[@]}" "$LAUNCHER_PATH"
  fi
  codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" --options runtime "${entitlement_args[@]}" "$STAGED_APP_PATH"
  codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"
else
  echo "Skipping staged app signature verification (unsigned/local build)."
fi

create_app_zip() {
  local source_app="$1"
  local output_zip="$2"
  rm -f "$output_zip"
  ditto -c -k --sequesterRsrc --keepParent "$source_app" "$output_zip"
}

FINAL_APP_ZIP_PATH="$ARTIFACTS_DIR/$FINAL_APP_ZIP_NAME"
TEMP_NOTARY_APP_ZIP_PATH="$TMP_ROOT/$FINAL_APP_ZIP_NAME"
rm -f "$FINAL_APP_ZIP_PATH"

if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${ELECTROBUN_APPLEID:-}" && -n "${ELECTROBUN_APPLEIDPASS:-}" && -n "${ELECTROBUN_TEAMID:-}" ]]; then
  create_app_zip "$STAGED_APP_PATH" "$TEMP_NOTARY_APP_ZIP_PATH"
  retry_command 3 20 xcrun notarytool submit \
    --apple-id "$ELECTROBUN_APPLEID" \
    --password "$ELECTROBUN_APPLEIDPASS" \
    --team-id "$ELECTROBUN_TEAMID" \
    --wait \
    "$TEMP_NOTARY_APP_ZIP_PATH"
  retry_command 5 15 xcrun stapler staple "$STAGED_APP_PATH"
fi

if [[ "$SKIP_APP_ZIP" != "1" ]]; then
  create_app_zip "$STAGED_APP_PATH" "$FINAL_APP_ZIP_PATH"
fi

echo "Standard macOS installer ready:"
echo "  app: $STAGED_APP_PATH"
if [[ "$SKIP_APP_ZIP" == "1" ]]; then
  echo "  app zip: skipped (MILADY_STAGE_MACOS_SKIP_APP_ZIP=1)"
else
  echo "  app zip: $FINAL_APP_ZIP_PATH"
fi
if [[ "$SKIP_DMG" == "1" ]]; then
  echo "  dmg: skipped (MILADY_STAGE_MACOS_SKIP_DMG=1)"
  exit 0
fi

FINAL_DMG_PATH="$ARTIFACTS_DIR/$FINAL_DMG_NAME"
TEMP_DMG_PATH="$TMP_ROOT/$FINAL_DMG_NAME"
VOLUME_NAME="$(basename "$STAGED_APP_PATH" .app)"

ditto "$STAGED_APP_PATH" "$DMG_STAGING_DIR/$(basename "$STAGED_APP_PATH")"
ln -s /Applications "$DMG_STAGING_DIR/Applications"

rm -f "$FINAL_DMG_PATH"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$DMG_STAGING_DIR" \
  -ov \
  -format ULFO \
  "$TEMP_DMG_PATH"

if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${ELECTROBUN_DEVELOPER_ID:-}" ]]; then
  codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$TEMP_DMG_PATH"
fi

if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${ELECTROBUN_APPLEID:-}" && -n "${ELECTROBUN_APPLEIDPASS:-}" && -n "${ELECTROBUN_TEAMID:-}" ]]; then
  retry_command 3 20 xcrun notarytool submit \
    --apple-id "$ELECTROBUN_APPLEID" \
    --password "$ELECTROBUN_APPLEIDPASS" \
    --team-id "$ELECTROBUN_TEAMID" \
    --wait \
    "$TEMP_DMG_PATH"
  retry_command 5 15 xcrun stapler staple "$TEMP_DMG_PATH"
fi

mv "$TEMP_DMG_PATH" "$FINAL_DMG_PATH"

echo "  dmg: $FINAL_DMG_PATH"
