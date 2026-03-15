#!/usr/bin/env bash
# cloud-full-entrypoint.sh — Runs both milady server and cloud-agent bridge
#
# Starts milady server as the primary process and cloud-agent as a background
# daemon. If either process exits, we tear down both.

set -euo pipefail

echo "[entrypoint] Starting milady + cloud-agent (build: ${BUILD_VERSION:-dev} sha: ${BUILD_SHA:-unknown})"

# Trap signals and forward to children
cleanup() {
  echo "[entrypoint] Shutting down..."
  kill "$BRIDGE_PID" 2>/dev/null || true
  kill "$MILADY_PID" 2>/dev/null || true
  wait
  exit 0
}
trap cleanup SIGTERM SIGINT SIGQUIT

# ── Start cloud-agent bridge in background ─────────────────────────────────
echo "[entrypoint] Starting cloud-agent bridge (ports: ${BRIDGE_PORT:-31337}, ${BRIDGE_COMPAT_PORT:-18790})"
node packages/cloud-agent/bin/cloud-agent.mjs start &
BRIDGE_PID=$!

# ── Start milady server (foreground) ───────────────────────────────────────
echo "[entrypoint] Starting milady server (port: ${PORT:-2138})"
node milady.mjs start &
MILADY_PID=$!

# ── Wait for either to exit ───────────────────────────────────────────────
# If either process dies, kill the other and exit with its code
wait -n "$BRIDGE_PID" "$MILADY_PID" 2>/dev/null
EXIT_CODE=$?

echo "[entrypoint] Process exited with code $EXIT_CODE, shutting down remaining..."
cleanup
exit $EXIT_CODE
