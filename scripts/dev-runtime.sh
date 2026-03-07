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
export MILADY_STRICT_PORT="${MILADY_STRICT_PORT:-1}"
export MILADY_RUNTIME_AUTO_DB_RESET="${MILADY_RUNTIME_AUTO_DB_RESET:-1}"

ALLOW_NON_WORKSPACE_STATE="${MILADY_ALLOW_NON_WORKSPACE_STATE:-0}"
EXPECTED_STATE_DIR="$ROOT_DIR/.milady-state"
EXPECTED_CONFIG_PATH="$EXPECTED_STATE_DIR/milady.json"

if [[ "$ALLOW_NON_WORKSPACE_STATE" != "1" ]]; then
  if [[ "$(cd "$(dirname "$MILADY_STATE_DIR")" && pwd)/$(basename "$MILADY_STATE_DIR")" != "$EXPECTED_STATE_DIR" ]]; then
    echo "[milady] error: refusing non-workspace MILADY_STATE_DIR: $MILADY_STATE_DIR"
    echo "[milady] expected: $EXPECTED_STATE_DIR"
    echo "[milady] set MILADY_ALLOW_NON_WORKSPACE_STATE=1 only for temporary debugging."
    exit 1
  fi

  if [[ "$(cd "$(dirname "$MILADY_CONFIG_PATH")" && pwd)/$(basename "$MILADY_CONFIG_PATH")" != "$EXPECTED_CONFIG_PATH" ]]; then
    echo "[milady] error: refusing mismatched MILADY_CONFIG_PATH: $MILADY_CONFIG_PATH"
    echo "[milady] expected: $EXPECTED_CONFIG_PATH"
    echo "[milady] set MILADY_ALLOW_NON_WORKSPACE_STATE=1 only for temporary debugging."
    exit 1
  fi
fi

# Prevent accidental postgres env leakage into local PGLite boot.
unset POSTGRES_URL
unset DATABASE_URL

# Kill stale backend listeners for this runtime to avoid split/old processes.
# Always reclaim the primary runtime port; otherwise a detached old process can
# trap the UI in a "runtime not running" loop while the new backend fails to bind.
START_PORT="$MILADY_PORT"
END_PORT=$((MILADY_PORT + 20))
for stale_port in $(seq "$START_PORT" "$END_PORT"); do
  stale_pids="$(lsof -ti "tcp:${stale_port}" 2>/dev/null || true)"
  if [[ -z "${stale_pids}" ]]; then
    continue
  fi
  for stale_pid in ${stale_pids}; do
    stale_cmd="$(ps -p "${stale_pid}" -o command= 2>/dev/null || true)"
    if [[ "${stale_port}" == "${START_PORT}" ]] || \
       [[ "${stale_cmd}" == *"milaidy-main"* ]] || \
       [[ "${stale_cmd}" == *"milady"* ]] || \
       [[ "${stale_cmd}" == *"src/runtime/dev-server.ts"* ]] || \
       [[ "${stale_cmd}" == *"scripts/dev-runtime.sh"* ]] || \
       [[ "${stale_cmd}" == *" bun "* ]] || \
       [[ "${stale_cmd}" == bun* ]] || \
       [[ "${stale_cmd}" == *" node "* ]] || \
       [[ "${stale_cmd}" == node* ]]; then
      echo "[milady] stopping stale runtime listener pid=${stale_pid} on :${stale_port}"
      kill -9 "${stale_pid}" 2>/dev/null || true
    fi
  done
done

# Fail fast if the primary API port is still occupied after cleanup. This
# prevents silent fallback/port drift where UI and backend target different
# processes.
remaining_pid="$(lsof -ti "tcp:${START_PORT}" 2>/dev/null || true)"
if [[ -n "${remaining_pid}" ]]; then
  echo "[milady] error: port ${START_PORT} is still in use by pid(s): ${remaining_pid}"
  echo "[milady] stop the conflicting process, then retry dev runtime."
  exit 1
fi

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
