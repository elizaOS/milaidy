#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${MILADY_STATE_DIR:-$ROOT_DIR/.milady-state}"
CONFIG_PATH="${MILADY_CONFIG_PATH:-$STATE_DIR/milady.json}"
PORT="${MILADY_PORT:-31337}"
HEADLESS="${MILADY_HEADLESS:-1}"

export MILADY_STATE_DIR="$STATE_DIR"
export MILADY_CONFIG_PATH="$CONFIG_PATH"
export MILADY_PORT="$PORT"
export MILADY_HEADLESS="$HEADLESS"

# Prevent accidental postgres env leakage into local PGLite boot.
unset POSTGRES_URL
unset DATABASE_URL

echo "[milady] dev-runtime state: $MILADY_STATE_DIR"
echo "[milady] dev-runtime config: $MILADY_CONFIG_PATH"
echo "[milady] dev-runtime port: $MILADY_PORT"

exec bun "$ROOT_DIR/src/runtime/dev-server.ts"
