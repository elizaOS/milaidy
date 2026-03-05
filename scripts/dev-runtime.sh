#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${MILADY_STATE_DIR:-$ROOT_DIR/.milady-state}"
CONFIG_PATH="${MILADY_CONFIG_PATH:-$STATE_DIR/milady.json}"
PORT="${MILADY_PORT:-31337}"
HEADLESS="${MILADY_HEADLESS:-1}"
WIPE_DB="${MILADY_RUNTIME_WIPE_DB:-0}"

export MILADY_STATE_DIR="$STATE_DIR"
export MILADY_CONFIG_PATH="$CONFIG_PATH"
export MILADY_PORT="$PORT"
export MILADY_HEADLESS="$HEADLESS"

# Prevent accidental postgres env leakage into local PGLite boot.
unset POSTGRES_URL
unset DATABASE_URL

# Kill stale backend listeners for this runtime to avoid split/old processes.
for stale_port in "$MILADY_PORT" 31338; do
  stale_pids="$(lsof -ti "tcp:${stale_port}" 2>/dev/null || true)"
  if [[ -n "${stale_pids}" ]]; then
    echo "[milady] stopping stale backend listener(s) on :${stale_port}"
    kill -9 ${stale_pids} 2>/dev/null || true
  fi
done

# Optional escape hatch for persistent local migration corruption.
if [[ "$WIPE_DB" == "1" ]]; then
  echo "[milady] wiping local pglite dirs before boot"
  rm -rf \
    "$MILADY_STATE_DIR/workspace/.eliza/.elizadb" \
    "$HOME/.milady/workspace/.eliza/.elizadb"
fi

mkdir -p "$MILADY_STATE_DIR"

echo "[milady] dev-runtime state: $MILADY_STATE_DIR"
echo "[milady] dev-runtime config: $MILADY_CONFIG_PATH"
echo "[milady] dev-runtime port: $MILADY_PORT"

exec bun "$ROOT_DIR/src/runtime/dev-server.ts"
