#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${MILADY_IMAGE:-milady:local}"
CONFIG_DIR="${MILADY_CONFIG_DIR:-$HOME/.milady}"
WORKSPACE_DIR="${MILADY_WORKSPACE_DIR:-$HOME/.milady/workspace}"
PROFILE_FILE="${MILADY_PROFILE_FILE:-$HOME/.profile}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e MILADY_LIVE_TEST=1 \
  -e MILADY_LIVE_MODELS="${MILADY_LIVE_MODELS:-all}" \
  -e MILADY_LIVE_PROVIDERS="${MILADY_LIVE_PROVIDERS:-}" \
  -e MILADY_LIVE_MODEL_TIMEOUT_MS="${MILADY_LIVE_MODEL_TIMEOUT_MS:-}" \
  -e MILADY_LIVE_REQUIRE_PROFILE_KEYS="${MILADY_LIVE_REQUIRE_PROFILE_KEYS:-}" \
  -v "$CONFIG_DIR":/home/node/.milady \
  -v "$WORKSPACE_DIR":/home/node/.milady/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && bun run test:live"
