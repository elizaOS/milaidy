#!/bin/bash
set -euo pipefail

# Milady Build & Verify Script
# Builds the electron app, signs it, notarizes it (if credentials are present),
# verifies the signature, and runs E2E tests against the packaged app.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)

echo "=== Milady Build & Verify ==="
echo "Repo Root: ${REPO_ROOT}"

cd "${REPO_ROOT}/apps/app"

# ── 1. Check for Signing & Notarization Credentials ──────────────────────────
echo "--- Checking Signing Credentials ---"
HAS_SIGNING_CREDS=false
HAS_NOTARIZE_CREDS=false

if [ -n "${CSC_LINK:-}" ] && [ -n "${CSC_KEY_PASSWORD:-}" ]; then
  echo "✅ Found CSC_LINK and CSC_KEY_PASSWORD env vars."
  HAS_SIGNING_CREDS=true
elif security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
  echo "✅ Found 'Developer ID Application' in Keychain."
  HAS_SIGNING_CREDS=true
  export CSC_IDENTITY_AUTO_DISCOVERY=true
else
  echo "⚠️  No signing credentials found (Env vars or Keychain)."
  echo "   The build will be unsigned or ad-hoc signed."
fi

echo "--- Checking Notarization Credentials ---"

# Method 1: Keychain profile (local dev — most secure)
if [ -n "${APPLE_KEYCHAIN_PROFILE:-}" ]; then
  echo "✅ APPLE_KEYCHAIN_PROFILE is set: ${APPLE_KEYCHAIN_PROFILE}"
  HAS_NOTARIZE_CREDS=true
elif security find-generic-password -s "com.apple.gke.notary.tool" -a "milady-notarize" &>/dev/null; then
  echo "✅ Found 'milady-notarize' keychain profile. Exporting APPLE_KEYCHAIN_PROFILE."
  export APPLE_KEYCHAIN_PROFILE="milady-notarize"
  HAS_NOTARIZE_CREDS=true
fi

# Method 2: Env vars (CI — standard)
if [ "$HAS_NOTARIZE_CREDS" = false ]; then
  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    echo "✅ Found APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID env vars."
    HAS_NOTARIZE_CREDS=true
  fi
fi

if [ "$HAS_NOTARIZE_CREDS" = false ]; then
  echo "⚠️  No notarization credentials found."
  echo "   To notarize locally, run:"
  echo "     xcrun notarytool store-credentials \"milady-notarize\" \\"
  echo "       --apple-id \"YOUR_APPLE_ID\" \\"
  echo "       --password \"YOUR_APP_SPECIFIC_PASSWORD\" \\"
  echo "       --team-id \"25877RY2EH\""
  echo ""
  echo "   For CI, set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID secrets."
fi

# ── 2. Build & Package ───────────────────────────────────────────────────────
echo "--- Building & Packaging ---"

# Build Root Project
echo "--- Building Root Project ---"
cd "${REPO_ROOT}"
bun install
bunx tsdown
node --import tsx scripts/write-build-info.ts
echo '{"type":"module"}' > dist/package.json

# Build App
cd "${REPO_ROOT}/apps/app"
bun install
bun run cap:sync:electron

# Build web assets (Capacitor)
bun run build

# Build Electron
cd electron
bun install
bun run build

echo "--- Packaging Electron App ---"
# Build for current architecture on macOS (arm64 on Apple Silicon, x64 on Intel)
case "$(uname -m)" in
  arm64)  MAC_ARCH="--arm64" ;;
  *)      MAC_ARCH="--x64" ;;
esac

bun run build:whisper

if [ "$HAS_SIGNING_CREDS" = true ]; then
  echo "Building with signing enabled..."
  bunx electron-builder build --mac "${MAC_ARCH}" --publish never
else
  echo "Building without explicit signing identity..."
  bunx electron-builder build --mac "${MAC_ARCH}" --publish never -c.mac.identity=null
fi

# ── 3. Verify Signature ─────────────────────────────────────────────────────
echo "--- Verifying Signature ---"
APP_PATH=$(find dist/mac* -name "Milady.app" | head -n 1)

if [ -z "$APP_PATH" ]; then
  echo "❌ Build failed? Could not find Milady.app in dist/mac*"
  exit 1
fi

echo "Found App: $APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if [ "$HAS_SIGNING_CREDS" = true ]; then
  echo "Checking for Developer ID authority..."
  codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep "Authority=Developer ID Application" && echo "✅ Signed with Developer ID" || echo "⚠️  Not signed with Developer ID (local dev cert?)"

  echo "Validating with spctl (Gatekeeper assessment)..."
  spctl -a -vv --type exec "$APP_PATH" && echo "✅ Gatekeeper accepted" || echo "⚠️  spctl rejected (might be expected if not notarized yet)"
else
  echo "Skipping strict signature checks (unsigned/ad-hoc)."
fi

# ── 4. Verify Notarization ──────────────────────────────────────────────────
if [ "$HAS_NOTARIZE_CREDS" = true ]; then
  echo "--- Verifying Notarization ---"
  if xcrun stapler validate "$APP_PATH" 2>&1 | grep -q "The validate action worked"; then
    echo "✅ Notarization staple verified!"
  else
    echo "⚠️  Notarization staple not found. Checking with spctl..."
    spctl -a -vv --type exec "$APP_PATH" 2>&1 | grep -q "Notarized Developer ID" && echo "✅ Notarized (not yet stapled)" || echo "❌ Notarization may have failed"
  fi
fi

# ── 5. Run E2E Tests against Packaged App ────────────────────────────────────
echo "--- Running E2E Verification ---"
DMG_PATH=$(find dist -name "*.dmg" | head -n 1)

if [ -n "$DMG_PATH" ]; then
  echo "Testing with DMG: $DMG_PATH"
  export MILADY_TEST_DMG_PATH="${PWD}/${DMG_PATH}"
else
  echo "⚠️  No DMG found, testing with .app directly if supported"
  export MILADY_TEST_DMG_PATH="${PWD}/${APP_PATH}"
fi

cd ..
echo "Running: bun run test:electron:packaged:e2e"
bun run test:electron:packaged:e2e

echo "=== Verification Complete ==="
