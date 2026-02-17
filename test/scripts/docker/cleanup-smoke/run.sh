#!/usr/bin/env bash
set -euo pipefail

cd /repo

export MILADY_STATE_DIR="/tmp/milady-test"
export MILADY_CONFIG_PATH="${MILADY_STATE_DIR}/milady.json"

echo "==> Build"
bun run build

echo "==> Seed state"
mkdir -p "${MILADY_STATE_DIR}/credentials"
mkdir -p "${MILADY_STATE_DIR}/agents/main/sessions"
echo '{}' >"${MILADY_CONFIG_PATH}"
echo 'creds' >"${MILADY_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${MILADY_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
bun run milady reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${MILADY_CONFIG_PATH}"
test ! -d "${MILADY_STATE_DIR}/credentials"
test ! -d "${MILADY_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${MILADY_STATE_DIR}/credentials"
echo '{}' >"${MILADY_CONFIG_PATH}"

echo "==> Uninstall (state only)"
bun run milady uninstall --state --yes --non-interactive

test ! -d "${MILADY_STATE_DIR}"

echo "OK"
