#!/usr/bin/env bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  Milady pre-release smoke test                                          ║
# ║                                                                          ║
# ║  Usage:                                                                  ║
# ║    bash scripts/smoke-test.sh              # full smoke test             ║
# ║    bash scripts/smoke-test.sh --ci         # skip interactive checks     ║
# ║    bash scripts/smoke-test.sh --artifacts  # only check build artifacts  ║
# ╚════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

if [[ ! -t 1 ]] || [[ "${TERM:-}" == "dumb" ]]; then
  RED="" GREEN="" YELLOW="" CYAN="" BOLD="" DIM="" RESET=""
fi

# ── Counters ──────────────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0
WARN=0

pass()  { ((PASS++)); printf "${GREEN}  PASS${RESET}  %s\n" "$*"; }
fail()  { ((FAIL++)); printf "${RED}  FAIL${RESET}  %s\n" "$*"; }
skip()  { ((SKIP++)); printf "${DIM}  SKIP${RESET}  %s\n" "$*"; }
warn()  { ((WARN++)); printf "${YELLOW}  WARN${RESET}  %s\n" "$*"; }
header(){ printf "\n${BOLD}${CYAN}── %s ──${RESET}\n" "$*"; }

# ── Args ──────────────────────────────────────────────────────────────────────

MODE="full"   # full | ci | artifacts
for arg in "$@"; do
  case "$arg" in
    --ci)        MODE="ci"        ;;
    --artifacts) MODE="artifacts" ;;
    --help|-h)
      printf "Usage: %s [--ci | --artifacts]\n" "$0"
      exit 0
      ;;
  esac
done

# ── Resolve project root ─────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

printf "\n${BOLD}Milady Pre-Release Smoke Test${RESET}\n"
printf "${DIM}Project root: %s${RESET}\n" "$ROOT_DIR"
printf "${DIM}Mode: %s${RESET}\n" "$MODE"

# ══════════════════════════════════════════════════════════════════════════════
# 1. Version consistency
# ══════════════════════════════════════════════════════════════════════════════

header "Version Consistency"

PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "")"
if [[ -z "$PKG_VERSION" ]]; then
  fail "Could not read version from package.json"
else
  pass "package.json version: ${PKG_VERSION}"
fi

# Check build-info.json if it exists (only after a build)
if [[ -f dist/build-info.json ]]; then
  BUILD_VERSION="$(node -p "require('./dist/build-info.json').version" 2>/dev/null || echo "")"
  if [[ "$BUILD_VERSION" == "$PKG_VERSION" ]]; then
    pass "build-info.json version matches: ${BUILD_VERSION}"
  else
    fail "build-info.json version mismatch: ${BUILD_VERSION} (expected ${PKG_VERSION})"
  fi
else
  skip "dist/build-info.json not found (run 'bun run build' first)"
fi

# Verify version tag format
if [[ "$PKG_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  pass "Version format is valid semver: ${PKG_VERSION}"
else
  fail "Version format is not valid semver: ${PKG_VERSION}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 2. Build artifacts
# ══════════════════════════════════════════════════════════════════════════════

header "Build Artifacts"

# Core dist files
REQUIRED_DIST_FILES=(
  "dist/index.js"
  "dist/entry.js"
  "dist/build-info.json"
)

for f in "${REQUIRED_DIST_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    pass "Found: ${f}"
  else
    fail "Missing: ${f} (run 'bun run build')"
  fi
done

# Desktop build artifacts (check if electron dist exists)
ELECTRON_DIST="apps/app/electron/dist"
if [[ -d "$ELECTRON_DIST" ]]; then
  DMG_COUNT=$(find "$ELECTRON_DIST" -name "*.dmg" 2>/dev/null | wc -l | tr -d ' ')
  EXE_COUNT=$(find "$ELECTRON_DIST" -name "*.exe" 2>/dev/null | wc -l | tr -d ' ')
  APPIMAGE_COUNT=$(find "$ELECTRON_DIST" -name "*.AppImage" 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$DMG_COUNT" -gt 0 ]]; then
    pass "Found ${DMG_COUNT} DMG file(s) in electron/dist"
  else
    skip "No DMG files (expected on non-macOS or if desktop build was not run)"
  fi

  if [[ "$EXE_COUNT" -gt 0 ]]; then
    pass "Found ${EXE_COUNT} EXE file(s) in electron/dist"
  else
    skip "No EXE files (expected on non-Windows or if desktop build was not run)"
  fi

  if [[ "$APPIMAGE_COUNT" -gt 0 ]]; then
    pass "Found ${APPIMAGE_COUNT} AppImage file(s) in electron/dist"
  else
    skip "No AppImage files (expected on non-Linux or if desktop build was not run)"
  fi
else
  skip "No electron dist directory (desktop build not run)"
fi

# Stop early for --artifacts mode
if [[ "$MODE" == "artifacts" ]]; then
  printf "\n${BOLD}Results:${RESET} ${GREEN}${PASS} passed${RESET}, ${RED}${FAIL} failed${RESET}, ${SKIP} skipped, ${YELLOW}${WARN} warnings${RESET}\n\n"
  [[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3. CLI boot check
# ══════════════════════════════════════════════════════════════════════════════

header "CLI Boot"

# --version should print cleanly and exit 0
CLI_VERSION=""
if CLI_VERSION="$(node scripts/run-node.mjs --version 2>&1)"; then
  pass "CLI --version exits cleanly: ${CLI_VERSION}"
else
  fail "CLI --version failed (exit code $?)"
fi

# --help should work
if node scripts/run-node.mjs --help &>/dev/null; then
  pass "CLI --help exits cleanly"
else
  fail "CLI --help failed"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 4. API server startup
# ══════════════════════════════════════════════════════════════════════════════

header "API Server Startup"

SERVER_PID=""
SERVER_PORT="${MILADY_TEST_PORT:-18799}"

cleanup_server() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
trap cleanup_server EXIT

# Start the gateway in the background with a test port
MILADY_GATEWAY_PORT="$SERVER_PORT" \
  MILADY_PROFILE="test" \
  MILADY_SKIP_ONBOARDING="1" \
  node scripts/run-node.mjs start --no-browser &>/dev/null &
SERVER_PID=$!

# Wait for the server to come up (up to 30s)
SERVER_UP=false
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${SERVER_PORT}/api/health" &>/dev/null; then
    SERVER_UP=true
    break
  fi
  # Check if process is still alive
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if $SERVER_UP; then
  pass "API server started on port ${SERVER_PORT}"

  # Check health endpoint
  HEALTH_RESPONSE="$(curl -sf "http://127.0.0.1:${SERVER_PORT}/api/health" 2>/dev/null || echo "{}")"
  if [[ -n "$HEALTH_RESPONSE" ]]; then
    pass "Health endpoint responds"
  else
    fail "Health endpoint returned empty response"
  fi
else
  fail "API server did not start within 30s"
fi

cleanup_server

# ══════════════════════════════════════════════════════════════════════════════
# 5. npm pack validation (same as release:check)
# ══════════════════════════════════════════════════════════════════════════════

header "npm Pack Validation"

if npm pack --dry-run --json --ignore-scripts &>/dev/null; then
  PACK_OUTPUT="$(npm pack --dry-run --json --ignore-scripts 2>/dev/null)"
  PACK_FILES="$(echo "$PACK_OUTPUT" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const files = data.flatMap(e => (e.files || []).map(f => f.path));
    console.log(files.join('\n'));
  " 2>/dev/null || echo "")"

  PACK_REQUIRED=("dist/index.js" "dist/entry.js" "dist/build-info.json" "README.md")
  PACK_FORBIDDEN_PREFIX="dist/Milady.app/"

  for req in "${PACK_REQUIRED[@]}"; do
    if echo "$PACK_FILES" | grep -qx "$req"; then
      pass "npm pack includes: ${req}"
    else
      fail "npm pack missing: ${req}"
    fi
  done

  if echo "$PACK_FILES" | grep -q "^${PACK_FORBIDDEN_PREFIX}"; then
    fail "npm pack includes forbidden path: ${PACK_FORBIDDEN_PREFIX}*"
  else
    pass "No forbidden paths in npm pack"
  fi
else
  fail "npm pack --dry-run failed"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 6. Release workflow validation
# ══════════════════════════════════════════════════════════════════════════════

header "Release Workflow"

RELEASE_YML=".github/workflows/release.yml"
if [[ -f "$RELEASE_YML" ]]; then
  pass "Release workflow exists: ${RELEASE_YML}"

  # Check for key elements
  if grep -q 'generate_release_notes: true' "$RELEASE_YML"; then
    pass "Release notes auto-generation enabled"
  else
    warn "Release notes auto-generation not found in workflow"
  fi

  if grep -q 'sha256sum' "$RELEASE_YML"; then
    pass "SHA256 checksum generation present"
  else
    fail "SHA256 checksum generation missing"
  fi

  if grep -q 'SHA256SUMS.txt' "$RELEASE_YML"; then
    pass "SHA256SUMS.txt output present"
  else
    fail "SHA256SUMS.txt output missing"
  fi

  if grep -q 'APPLE_ID' "$RELEASE_YML"; then
    pass "Apple notarization secrets referenced"
  else
    warn "Apple notarization secrets not found"
  fi

  if grep -q 'CSC_LINK' "$RELEASE_YML"; then
    pass "Code signing certificate secret referenced"
  else
    warn "Code signing certificate secret not found"
  fi

  if grep -q 'Package desktop app (unsigned fallback)' "$RELEASE_YML"; then
    fail "Unsigned desktop fallback is still enabled in release workflow"
  else
    pass "Unsigned desktop fallback removed"
  fi

  if grep -q 'Verify macOS signature and notarization' "$RELEASE_YML" && grep -q 'xcrun stapler validate' "$RELEASE_YML"; then
    pass "macOS signature/notarization verification checks present"
  else
    fail "macOS signature/notarization verification checks missing"
  fi

  if grep -q 'if-no-files-found: error' "$RELEASE_YML"; then
    pass "Artifact upload fails when expected files are missing"
  else
    fail "Artifact upload does not enforce expected files"
  fi

  if grep -q 'softprops/action-gh-release' "$RELEASE_YML"; then
    pass "GitHub Release action present"
  else
    fail "GitHub Release action missing"
  fi
else
  fail "Release workflow not found: ${RELEASE_YML}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 7. Entitlements & electron-builder
# ══════════════════════════════════════════════════════════════════════════════

header "Desktop Config"

EB_CONFIG="apps/app/electron/electron-builder.config.json"
if [[ -f "$EB_CONFIG" ]]; then
  pass "electron-builder config exists"

  if node -e "
    const c = require('./${EB_CONFIG}');
    if (!c.mac?.hardenedRuntime) process.exit(1);
  " 2>/dev/null; then
    pass "hardenedRuntime enabled"
  else
    fail "hardenedRuntime not enabled in electron-builder config"
  fi

  if node -e "
    const c = require('./${EB_CONFIG}');
    if (!c.mac?.entitlements) process.exit(1);
  " 2>/dev/null; then
    pass "macOS entitlements configured"
  else
    fail "macOS entitlements not configured"
  fi
else
  fail "electron-builder config not found: ${EB_CONFIG}"
fi

ENTITLEMENTS="apps/app/electron/entitlements.mac.plist"
if [[ -f "$ENTITLEMENTS" ]]; then
  pass "Entitlements plist exists"
  if grep -q 'com.apple.security.cs.allow-jit' "$ENTITLEMENTS"; then
    pass "JIT entitlement present"
  else
    warn "JIT entitlement missing (required for Electron)"
  fi
else
  fail "Entitlements plist not found: ${ENTITLEMENTS}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════

printf "\n${BOLD}════════════════════════════════════════${RESET}\n"
printf "${BOLD}Smoke Test Results${RESET}\n"
printf "${BOLD}════════════════════════════════════════${RESET}\n"
printf "  ${GREEN}Passed:${RESET}   %d\n" "$PASS"
printf "  ${RED}Failed:${RESET}   %d\n" "$FAIL"
printf "  ${YELLOW}Warnings:${RESET} %d\n" "$WARN"
printf "  ${DIM}Skipped:${RESET}  %d\n" "$SKIP"
printf "${BOLD}════════════════════════════════════════${RESET}\n"

if [[ "$FAIL" -gt 0 ]]; then
  printf "\n${RED}${BOLD}SMOKE TEST FAILED${RESET} — %d check(s) failed.\n\n" "$FAIL"
  exit 1
else
  printf "\n${GREEN}${BOLD}SMOKE TEST PASSED${RESET}"
  if [[ "$WARN" -gt 0 ]]; then
    printf " (with %d warning(s))" "$WARN"
  fi
  printf "\n\n"
  exit 0
fi
